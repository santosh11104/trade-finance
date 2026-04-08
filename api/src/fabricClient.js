const fs = require('fs');
const { Wallets, Gateway } = require('fabric-network');
const config = require('./config');

let discoveryEnabledAtRuntime = config.fabric.discoveryEnabled;

function shouldRetryWithoutDiscovery(error) {
  const message = (error && error.message ? error.message : '').toLowerCase();
  return message.includes('discoveryservice') || message.includes('parsediscoveryresults') || message.includes('access denied');
}

const path = require('path');

async function buildGateway(userId, discoveryEnabled) {
  const wallet = await Wallets.newFileSystemWallet(config.fabric.walletPath);
  const identity = await wallet.get(userId);
  if (!identity) {
    throw new Error(`Identity ${userId} not found in wallet`);
  }

  const ccpRaw = fs.readFileSync(config.fabric.connectionProfile, 'utf8');
  let ccp = JSON.parse(ccpRaw);

  // Resolve relative paths in connection profile
  const projectRoot = path.resolve(__dirname, '../../');
  if (ccp.peers) {
    Object.keys(ccp.peers).forEach(peerName => {
      const peer = ccp.peers[peerName];
      if (peer.tlsCACerts && peer.tlsCACerts.path && peer.tlsCACerts.path.startsWith('./')) {
        peer.tlsCACerts.path = path.resolve(projectRoot, peer.tlsCACerts.path);
      }
    });
  }
  if (ccp.orderers) {
    Object.keys(ccp.orderers).forEach(ordererName => {
      const orderer = ccp.orderers[ordererName];
      if (orderer.tlsCACerts && orderer.tlsCACerts.path && orderer.tlsCACerts.path.startsWith('./')) {
        orderer.tlsCACerts.path = path.resolve(projectRoot, orderer.tlsCACerts.path);
      }
    });
  }
  if (ccp.certificateAuthorities) {
    Object.keys(ccp.certificateAuthorities).forEach(caName => {
      const ca = ccp.certificateAuthorities[caName];
      if (ca.tlsCACerts && ca.tlsCACerts.path && ca.tlsCACerts.path.startsWith('./')) {
        ca.tlsCACerts.path = path.resolve(projectRoot, ca.tlsCACerts.path);
      }
    });
  }

  const gateway = new Gateway();
  await gateway.connect(ccp, {
    wallet,
    identity: userId,
    discovery: {
      enabled: discoveryEnabled,
      asLocalhost: config.fabric.discoveryAsLocalhost
    }
  });

  return gateway;
}

async function executeWithGateway(userId, operation) {
  const preferredDiscovery = discoveryEnabledAtRuntime;
  const attempts = preferredDiscovery ? [true, false] : [false];
  let lastError;

  for (const discoveryEnabled of attempts) {
    let gateway;
    try {
      gateway = await buildGateway(userId, discoveryEnabled);
      return await operation(gateway);
    } catch (err) {
      lastError = err;
      if (!preferredDiscovery || !discoveryEnabled || !shouldRetryWithoutDiscovery(err)) {
        throw err;
      }

      discoveryEnabledAtRuntime = false;
      console.warn('Fabric discovery access denied. Switching to discovery disabled for subsequent requests.');
    } finally {
      if (gateway) {
        gateway.disconnect();
      }
    }
  }

  throw lastError;
}

async function submitTransaction(transactionName, args, userId = config.fabric.userId) {
  return executeWithGateway(userId, async (gateway) => {
    const network = await gateway.getNetwork(config.fabric.channelName);
    const contract = network.getContract(config.fabric.chaincodeName);
    const result = await contract.submitTransaction(transactionName, ...args);
    return result.toString();
  });
}

async function evaluateTransaction(transactionName, args, userId = config.fabric.userId) {
  return executeWithGateway(userId, async (gateway) => {
    const network = await gateway.getNetwork(config.fabric.channelName);
    const contract = network.getContract(config.fabric.chaincodeName);
    const result = await contract.evaluateTransaction(transactionName, ...args);
    return result.toString();
  });
}

module.exports = { submitTransaction, evaluateTransaction };
