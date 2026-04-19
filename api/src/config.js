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
  dbUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tradefinance',
  fabric: {
    walletPath: process.env.FABRIC_WALLET_PATH || path.resolve(__dirname, '../wallet'),
    connectionProfile: path.resolve(__dirname, '../../blockchain-api/config/connection-profile.json'),
    channelName: process.env.FABRIC_CHANNEL_NAME || 'tradechannel',
    chaincodeName: process.env.FABRIC_CHAINCODE_NAME || 'lccontract',
    userId: process.env.FABRIC_USER_ID || 'appUser',
    orgMsp: process.env.FABRIC_ORG_MSP || 'Org1MSP',
    caName: process.env.FABRIC_CA_NAME || 'ca-org1',
    caAdmin: process.env.FABRIC_CA_ADMIN || 'admin',
    caAdminPW: process.env.FABRIC_CA_ADMIN_PW || 'adminpw',
    caAdminMap: {
      'Org1MSP': { id: process.env.FABRIC_CA_ADMIN_ORG1 || 'admin', pw: process.env.FABRIC_CA_ADMIN_PW_ORG1 || 'adminpw' },
      'Org2MSP': { id: process.env.FABRIC_CA_ADMIN_ORG2 || 'admin', pw: process.env.FABRIC_CA_ADMIN_PW_ORG2 || 'adminpw' },
      'Org3MSP': { id: process.env.FABRIC_CA_ADMIN_ORG3 || 'admin', pw: process.env.FABRIC_CA_ADMIN_PW_ORG3 || 'adminpw' },
      'Org4MSP': { id: process.env.FABRIC_CA_ADMIN_ORG4 || 'admin', pw: process.env.FABRIC_CA_ADMIN_PW_ORG4 || 'adminpw' },
    },
    discoveryEnabled: process.env.FABRIC_DISCOVERY_ENABLED !== 'false',
    discoveryAsLocalhost: process.env.FABRIC_DISCOVERY_AS_LOCALHOST === 'true',
  }
};
