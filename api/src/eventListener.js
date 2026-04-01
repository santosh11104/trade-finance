const { Wallets, Gateway } = require('fabric-network');
const config = require('./config');
const db = require('./db');
const fs = require('fs');

async function startEventListener() {
  const wallet = await Wallets.newFileSystemWallet(config.fabric.walletPath);
  const identity = await wallet.get(config.fabric.userId);
  if (!identity) {
    throw new Error(`Identity ${config.fabric.userId} not found in wallet for event listener`);
  }

  const ccp = JSON.parse(fs.readFileSync(config.fabric.connectionProfile, 'utf8'));
  const gateway = new Gateway();
  await gateway.connect(ccp, {
    wallet,
    identity: config.fabric.userId,
    discovery: { enabled: true, asLocalhost: config.fabric.discoveryAsLocalhost }
  });

  const network = await gateway.getNetwork(config.fabric.channelName);
  const contract = network.getContract(config.fabric.chaincodeName);

  await contract.addContractListener('lcEventListener', 'LCEvent', async (err, event, blockNumber, txId, status) => {
    if (err) {
      console.error('Event listener error', err);
      return;
    }

    try {
      const payload = JSON.parse(event.payload.toString());
      await db.query(
        'INSERT INTO audit_logs (lc_id, event_type, event_payload, source) VALUES ($1, $2, $3, $4)',
        [payload.lcId, payload.action, payload, 'chaincode']
      );
      await db.query(
        'UPDATE lc_metadata SET status=$1, last_event=$2, updated_at=now() WHERE id=$3',
        [payload.action, payload.action, payload.lcId]
      );
      console.log(`Processed LC event ${payload.action} for ${payload.lcId}`);
    } catch (error) {
      console.error('Failed to persist chaincode event to Postgres', error);
    }
  });

  console.log('Fabric event listener started.');
}

module.exports = { startEventListener };
