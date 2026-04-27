const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { db, initDb } = require('./src/db');
const { encrypt } = require('./src/cryptoUtils');

const projectRoot = path.resolve(__dirname, '..');
const cryptoRoot = path.join(projectRoot, 'blockchain-api/network/crypto-config');

const userMapping = [
  {
    appUsername: 'admin',
    cryptoUser: 'Admin@org1.example.com',
    org: 'org1.example.com',
    mspId: 'Org1MSP',
    role: 'admin'
  },
  {
    appUsername: 'importer1',
    cryptoUser: 'User1@org1.example.com',
    org: 'org1.example.com',
    mspId: 'Org1MSP',
    role: 'importer'
  },
  {
    appUsername: 'exporter1',
    cryptoUser: 'User1@org2.example.com',
    org: 'org2.example.com',
    mspId: 'Org2MSP',
    role: 'exporter'
  },
  {
    appUsername: 'bank1',
    cryptoUser: 'User1@org3.example.com',
    org: 'org3.example.com',
    mspId: 'Org3MSP',
    role: 'bank'
  },
  {
    appUsername: 'bank2',
    cryptoUser: 'User1@org4.example.com',
    org: 'org4.example.com',
    mspId: 'Org4MSP',
    role: 'bank'
  },
];

async function sync() {
  try {
    console.log('Initializing database schema...');
    await initDb();

    console.log('Syncing database identities directly from crypto-config...');

    for (const user of userMapping) {
      const userDir = path.join(cryptoRoot, 'peerOrganizations', user.org, 'users', user.cryptoUser);

      if (!fs.existsSync(userDir)) {
        console.warn(`User directory not found for ${user.appUsername} at ${userDir}`);
        continue;
      }

      const certPath = path.join(userDir, 'msp/signcerts', `${user.cryptoUser}-cert.pem`);
      const keyDir = path.join(userDir, 'msp/keystore');

      if (!fs.existsSync(certPath) || !fs.existsSync(keyDir)) {
        console.warn(`Cert or key missing for ${user.appUsername}`);
        continue;
      }

      const cert = fs.readFileSync(certPath, 'utf8');
      const keyFiles = fs.readdirSync(keyDir);
      const key = fs.readFileSync(path.join(keyDir, keyFiles[0]), 'utf8');

      const encryptedKey = encrypt(key);

      await db.none(
        `INSERT INTO fabric_identities (username, certificate, encrypted_private_key, msp_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (username) DO UPDATE
         SET certificate = EXCLUDED.certificate,
             encrypted_private_key = EXCLUDED.encrypted_private_key,
             msp_id = EXCLUDED.msp_id`,
        [user.appUsername, cert, encryptedKey, user.mspId]
      );

      const passwordHash = await bcrypt.hash('password123', 10);

      await db.none(
        `INSERT INTO users (username, password_hash, role, org_msp)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (username) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             role = EXCLUDED.role,
             org_msp = EXCLUDED.org_msp`,
        [user.appUsername, passwordHash, user.role, user.mspId]
      );

      console.log(`Synced identity for ${user.appUsername} using ${user.cryptoUser} (${user.mspId})`);
    }

    console.log('Successfully synced all identities from crypto-config to database.');
  } catch (err) {
    console.error('Error syncing identities:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

sync();
