const fs = require('fs');
const path = require('path');
const { Wallets, Gateway } = require('fabric-network');
const config = require('./config');

async function buildGateway(userId) {
  const wallet = await Wallets.newFileSystemWallet(config.fabric.walletPath);
  const identity = await wallet.get(userId);
  if (!identity) {
    throw new Error(`Identity ${userId} not found in wallet`);
  }
  const ccp = JSON.parse(fs.readFileSync(config.fabric.connectionProfile, 'utf8'));
  const gateway = new Gateway();
  await gateway.connect(ccp, {
    wallet,
    identity: userId,
    discovery: { enabled: true, asLocalhost: config.fabric.discoveryAsLocalhost }
  });
  return gateway;
}

async function submitTransaction(transactionName, args, userId = config.fabric.userId) {
  const gateway = await buildGateway(userId);
  try {
    const network = await gateway.getNetwork(config.fabric.channelName);
    const contract = network.getContract(config.fabric.chaincodeName);
    const result = await contract.submitTransaction(transactionName, ...args);
    return result.toString();
  } finally {
    gateway.disconnect();
  }
}

async function evaluateTransaction(transactionName, args, userId = config.fabric.userId) {
  const gateway = await buildGateway(userId);
  try {
    const network = await gateway.getNetwork(config.fabric.channelName);
    const contract = network.getContract(config.fabric.chaincodeName);
    const result = await contract.evaluateTransaction(transactionName, ...args);
    return result.toString();
  } finally {
    gateway.disconnect();
  }
}

module.exports = { submitTransaction, evaluateTransaction };
