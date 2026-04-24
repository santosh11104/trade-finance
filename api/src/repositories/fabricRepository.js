const fs = require('fs');
const path = require('path');
const grpc = require('@grpc/grpc-js');
const { connect, signers } = require('@hyperledger/fabric-gateway');
const crypto = require('crypto');
const config = require('../config');
const PostgresRepository = require('./postgresRepository');
const { decrypt } = require('../cryptoUtils');

const projectRoot = path.resolve(__dirname, '../../../');

function getCCP() {
    const ccpRaw = fs.readFileSync(config.fabric.connectionProfile, 'utf8');
    return JSON.parse(ccpRaw);
}

function resolvePath(p) {
    if (p.startsWith('./')) {
        return path.resolve(projectRoot, p);
    }
    return p;
}

async function getIdentity(userId) {
    const identity = await PostgresRepository.getIdentity(userId);
    if (!identity) {
      throw new Error(`Identity ${userId} not found in database`);
    }

    return {
      mspId: identity.msp_id,
      credentials: Buffer.from(identity.certificate),
      privateKeyPem: decrypt(identity.encrypted_private_key),
    };
}

function newGrpcConnection(peerName, ccp) {
    const peer = ccp.peers[peerName];
    const tlsRootCertPath = resolvePath(peer.tlsCACerts.path);
    const tlsRootCert = fs.readFileSync(tlsRootCertPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);

    const address = peer.url.replace(/^grpcs?:\/\//, '');

    return new grpc.Client(address, tlsCredentials, {
        'grpc.ssl_target_name_override': peer.grpcOptions['ssl-target-name-override'],
        'grpc.default_authority': peer.grpcOptions['ssl-target-name-override']
    });
}

async function executeWithGateway(userId, operation) {
    const ccp = getCCP();
    const identity = await getIdentity(userId);
    const org = ccp.organizations[identity.mspId];
    if (!org) {
      throw new Error(`Organization ${identity.mspId} not found in connection profile`);
    }
    const peerName = org.peers[0];
    const client = newGrpcConnection(peerName, ccp);

    const gateway = connect({
        client,
        identity: {
            mspId: identity.mspId,
            credentials: identity.credentials,
        },
        signer: signers.newPrivateKeySigner(crypto.createPrivateKey(identity.privateKeyPem)),
    });

    try {
        const network = gateway.getNetwork(config.fabric.channelName);
        const contract = network.getContract(config.fabric.chaincodeName);
        return await operation(contract);
    } finally {
        gateway.close();
        client.close();
    }
}

const FabricRepository = {
  async submit(transactionName, args, userId) {
    return executeWithGateway(userId, async (contract) => {
      const result = await contract.submitTransaction(transactionName, ...args);
      return Buffer.from(result).toString();
    });
  },

  async evaluate(transactionName, args, userId) {
    return executeWithGateway(userId, async (contract) => {
      const result = await contract.evaluateTransaction(transactionName, ...args);
      return Buffer.from(result).toString();
    });
  },

  // --- Domain Specific Methods ---

  async createLC(id, importer, exporter, issuingBank, advisingBank, amount, currency, expiry, terms, userId) {
    return this.submit('createLC', [id, importer, exporter, issuingBank, advisingBank, amount, currency, expiry, terms, userId], userId);
  },

  async issueLC(id, pricingData, userId) {
    return this.submit('issueLC', [id, pricingData, userId], userId);
  },

  async adviseLC(id, userId) {
    return this.submit('adviseLC', [id], userId);
  },

  async confirmLC(id, userId) {
    return this.submit('confirmLC', [id], userId);
  },

  async submitDocuments(id, documentsHash, userId) {
    return this.submit('submitDocuments', [id, documentsHash], userId);
  },

  async verifyDocuments(id, userId) {
    return this.submit('verifyDocuments', [id], userId);
  },

  async releasePayment(id, paymentDetails, userId) {
    return this.submit('releasePayment', [id, paymentDetails, userId], userId);
  },

  async amendLC(id, amendmentNote, userId) {
    return this.submit('amendLC', [id, amendmentNote], userId);
  },

  async cancelLC(id, userId) {
    return this.submit('cancelLC', [id], userId);
  },

  async queryLC(id, userId) {
    const result = await this.evaluate('queryLC', [id], userId);
    return JSON.parse(result);
  },

  async getLCStatusHistory(id, userId) {
    const result = await this.evaluate('getLCStatusHistory', [id], userId);
    return JSON.parse(result);
  }
};

module.exports = FabricRepository;
