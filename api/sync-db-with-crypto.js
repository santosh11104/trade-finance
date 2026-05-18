const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { db, initDb } = require('./src/db');
const { encrypt } = require('./src/cryptoUtils');

const walletPath = path.resolve(__dirname, 'wallet');

const userMapping = [
  { appUsername: 'admin', mspId: 'Org1MSP', role: 'admin' },
  { appUsername: 'importer1', mspId: 'Org1MSP', role: 'admin' },
  { appUsername: 'exporter1', mspId: 'Org2MSP', role: 'operator' },
  { appUsername: 'bank1', mspId: 'Org3MSP', role: 'admin' },
  { appUsername: 'bank2', mspId: 'Org4MSP', role: 'admin' },
];

async function sync() {
  try {
    console.log('Initializing database schema...');
    await initDb();

    console.log('Syncing database identities from api/wallet...');

    for (const user of userMapping) {
      const userWalletDir = path.join(walletPath, user.appUsername);

      if (!fs.existsSync(userWalletDir)) {
        console.warn(`Wallet directory not found for ${user.appUsername} at ${userWalletDir}`);
        continue;
      }

      const certPath = path.join(userWalletDir, 'msp/signcerts/cert.pem');
      const keyDir = path.join(userWalletDir, 'msp/keystore');

      if (!fs.existsSync(certPath) || !fs.existsSync(keyDir)) {
        console.warn(`Cert or key missing in wallet for ${user.appUsername}`);
        continue;
      }

      const cert = fs.readFileSync(certPath, 'utf8');
      
      const keyFiles = fs.readdirSync(keyDir)
        .filter(file => file.endsWith('_sk'))
        .map(file => ({
          name: file,
          time: fs.statSync(path.join(keyDir, file)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

      if (keyFiles.length === 0) {
        console.warn(`No secret key (_sk) found in keystore for ${user.appUsername}`);
        continue;
      }

      const key = fs.readFileSync(path.join(keyDir, keyFiles[0].name), 'utf8');

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

      const passwordHash = await bcrypt.hash('password', 10);

      await db.none(
        `INSERT INTO users (username, password_hash, role, org_msp)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (username) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             role = EXCLUDED.role,
             org_msp = EXCLUDED.org_msp`,
        [user.appUsername, passwordHash, user.role, user.mspId]
      );

      console.log(`Synced identity for ${user.appUsername} (${user.mspId})`);
    }

    console.log('Successfully synced all identities from wallet to database.');
  } catch (err) {
    console.error('Error syncing identities:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

sync();
