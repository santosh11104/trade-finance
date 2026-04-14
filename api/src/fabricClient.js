const fs = require('fs');
const path = require('path');
const grpc = require('@grpc/grpc-js');
const { connect, signers } = require('@hyperledger/fabric-gateway');
const crypto = require('crypto');
const config = require('./config');

const projectRoot = path.resolve(__dirname, '../../');

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
    const idPath = path.join(config.fabric.walletPath, `${userId}.id`);
    if (!fs.existsSync(idPath)) {
        throw new Error(`Identity ${userId} not found in wallet`);
    }
    const idData = JSON.parse(fs.readFileSync(idPath, 'utf8'));
    return {
        mspId: idData.mspId,
        credentials: Buffer.from(idData.credentials.certificate),
        privateKeyPem: idData.credentials.privateKey,
    };
}

function newGrpcConnection(peerName, ccp) {
    const peer = ccp.peers[peerName];
    const tlsRootCertPath = resolvePath(peer.tlsCACerts.path);
    const tlsRootCert = fs.readFileSync(tlsRootCertPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
    
    // Address format for grpc-js is host:port
    const address = peer.url.replace(/^grpcs?:\/\//, '');
    
    return new grpc.Client(address, tlsCredentials, {
        'grpc.ssl_target_name_override': peer.grpcOptions['ssl-target-name-override'],
        'grpc.default_authority': peer.grpcOptions['ssl-target-name-override']
    });
}

async function executeWithGateway(userId, operation) {
    const ccp = getCCP();
    const org = ccp.organizations[config.fabric.orgMsp];
    const peerName = org.peers[0];
    
    const identity = await getIdentity(userId);
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

async function submitTransaction(transactionName, args, userId = config.fabric.userId) {
    return executeWithGateway(userId, async (contract) => {
        const result = await contract.submitTransaction(transactionName, ...args);
        return Buffer.from(result).toString();
    });
}

async function evaluateTransaction(transactionName, args, userId = config.fabric.userId) {
    return executeWithGateway(userId, async (contract) => {
        const result = await contract.evaluateTransaction(transactionName, ...args);
        return Buffer.from(result).toString();
    });
}

module.exports = { submitTransaction, evaluateTransaction };
