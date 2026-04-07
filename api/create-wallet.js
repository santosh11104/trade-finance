const { Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

const walletPath = path.resolve(__dirname, 'wallet');
const cryptoConfigPath = path.resolve(__dirname, '../blockchain-api/network/crypto-config/peerOrganizations/org1.example.com/users/User1@org1.example.com');

async function createWallet() {
  const wallet = await Wallets.newFileSystemWallet(walletPath);

  // Check if identity already exists
  const identity = await wallet.get('appUser');
  if (identity) {
    console.log('Identity appUser already exists in wallet');
    return;
  }

  // Read the certificate and private key
  const certPath = path.join(cryptoConfigPath, 'msp/signcerts/User1@org1.example.com-cert.pem');
  const keyDir = path.join(cryptoConfigPath, 'msp/keystore');
  const keyFiles = fs.readdirSync(keyDir);
  const keyPath = path.join(keyDir, keyFiles[0]); // There should be only one private key file

  const certificate = fs.readFileSync(certPath, 'utf8');
  const privateKey = fs.readFileSync(keyPath, 'utf8');

  const x509Identity = {
    credentials: {
      certificate,
      privateKey,
    },
    mspId: 'Org1MSP',
    type: 'X.509',
  };

  await wallet.put('appUser', x509Identity);
  console.log('Identity appUser imported to wallet successfully');
}

createWallet().catch(console.error);
