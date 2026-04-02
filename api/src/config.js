const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const envPath = path.resolve(__dirname, '../../.env');
const samplePath = path.resolve(__dirname, '../../.env.example');

dotenv.config({ path: fs.existsSync(envPath) ? envPath : samplePath });

module.exports = {
  port: process.env.PORT || 4000,
  jwtSecret: process.env.JWT_SECRET || 'supersecretkey',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  dbUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@postgres:5432/tradefinance',
  fabric: {
    walletPath: process.env.FABRIC_WALLET_PATH || path.resolve(__dirname, '../wallet'),
    connectionProfile: path.resolve(__dirname, '../../blockchain-api/config/connection-profile.json'),
    channelName: process.env.FABRIC_CHANNEL_NAME || 'tradechannel',
    chaincodeName: process.env.FABRIC_CHAINCODE_NAME || 'lccontract',
    userId: process.env.FABRIC_USER_ID || 'appUser',
    orgMsp: process.env.FABRIC_ORG_MSP || 'Org1MSP',
    discoveryAsLocalhost: process.env.FABRIC_DISCOVERY_AS_LOCALHOST === 'true',
  }
};
