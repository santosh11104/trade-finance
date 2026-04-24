const fs = require('fs');
const path = require('path');

const walletPath = path.resolve(__dirname, 'wallet');
const cryptoConfigPath = path.resolve(__dirname, '../blockchain-api/network/crypto-config/peerOrganizations/org1.example.com/users/User1@org1.example.com');

async function createWallet() {
  if (!fs.existsSync(walletPath)) {
    fs.mkdirSync(walletPath, { recursive: true });
  }

  const idPath = path.join(walletPath, 'appUser.id');

  // Always update the identity to ensure certificates match the current network
  console.log('Updating identity appUser in wallet...');

  // Read the certificate and private key
  const certPath = path.join(cryptoConfigPath, 'msp/signcerts/User1@org1.example.com-cert.pem');
  const keyDir = path.join(cryptoConfigPath, 'msp/keystore');
  
  if (!fs.existsSync(certPath) || !fs.existsSync(keyDir)) {
    console.log('Identity files not found at expected paths. Skipping wallet creation.');
    return;
  }

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
    version: 1
  };

  fs.writeFileSync(idPath, JSON.stringify(x509Identity));
  console.log('Identity appUser imported to wallet successfully');
}

createWallet().catch(console.error);
