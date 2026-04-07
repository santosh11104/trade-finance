const { Wallets, Gateway } = require('fabric-network');
const config = require('./config');
const db = require('./db');
const fs = require('fs');

function shouldRetryWithoutDiscovery(error) {
  const message = (error && error.message ? error.message : '').toLowerCase();
  return message.includes('discoveryservice') || message.includes('parsediscoveryresults') || message.includes('access denied');
}

async function startEventListener() {
  try {
    const wallet = await Wallets.newFileSystemWallet(config.fabric.walletPath);
    const identity = await wallet.get(config.fabric.userId);
    if (!identity) {
      console.log('Wallet identity not found, skipping event listener setup');
      return;
    }

    const ccp = JSON.parse(fs.readFileSync(config.fabric.connectionProfile, 'utf8'));
    const discoveryAttempts = config.fabric.discoveryEnabled ? [true, false] : [false];

    let gateway;
    let contract;
    let connectedWithDiscovery = false;
    for (const discoveryEnabled of discoveryAttempts) {
      gateway = new Gateway();
      try {
        await gateway.connect(ccp, {
          wallet,
          identity: config.fabric.userId,
          discovery: {
            enabled: discoveryEnabled,
            asLocalhost: config.fabric.discoveryAsLocalhost
          }
        });

        const network = await gateway.getNetwork(config.fabric.channelName);
        contract = network.getContract(config.fabric.chaincodeName);
        connectedWithDiscovery = discoveryEnabled;
        break;
      } catch (err) {
        if (!config.fabric.discoveryEnabled || !discoveryEnabled || !shouldRetryWithoutDiscovery(err)) {
          throw err;
        }
        console.warn('Discovery access denied for event listener. Retrying with discovery disabled.');
      }
    }

    if (!contract) {
      throw new Error('Unable to initialize Fabric contract for event listener');
    }

    if (!connectedWithDiscovery) {
      console.warn('Event listener disabled: discovery is unavailable for the configured identity/channel.');
      return;
    }

    // Set up contract listener for LC events
    await contract.addContractListener('lcEventListener', 'LCEvent', async (err, event, blockNumber, txId, status) => {
      if (err) {
        console.error('Event listener error:', err);
        return;
      }

      try {
        const payload = JSON.parse(event.payload.toString());
        console.log(`Received LC Event: ${payload.action} for ${payload.lcId} by ${payload.actor}`);

        // Insert into audit logs
        await db.query(
          'INSERT INTO audit_logs (lc_id, event_type, event_payload, source) VALUES ($1, $2, $3, $4)',
          [payload.lcId, payload.action, payload, 'chaincode']
        );

        // Fetch LC details from chaincode and update metadata
        await syncLCMetadata(contract, payload.lcId, payload.action);

        console.log(`Processed LC event ${payload.action} for ${payload.lcId}`);
      } catch (error) {
        console.error('Failed to persist chaincode event to Postgres:', error);
      }
    });

    console.log('Fabric event listener started successfully');
  } catch (err) {
    console.error('Failed to start event listener:', err.message);
    // Don't throw - API can still work without event listener
  }
}

async function syncLCMetadata(contract, lcId, lastEvent) {
  try {
    // Query LC details from chaincode
    const result = await contract.evaluateTransaction('queryLC', [lcId]);
    const lc = JSON.parse(result.toString());

    // Upsert LC metadata
    await db.query(
      `INSERT INTO lc_metadata (id, importer, exporter, issuing_bank, advising_bank, amount, currency, status, created_at, updated_at, last_event)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at,
         last_event = EXCLUDED.last_event`,
      [
        lc.id,
        lc.importer,
        lc.exporter,
        lc.issuingBank,
        lc.advisingBank,
        lc.amount,
        lc.currency,
        lc.status,
        lc.createdAt,
        lc.updatedAt,
        lastEvent
      ]
    );
  } catch (err) {
    console.error(`Failed to sync LC metadata for ${lcId}:`, err.message);
  }
}

module.exports = { startEventListener, syncLCMetadata };
