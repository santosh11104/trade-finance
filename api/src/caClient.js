const FabricCAServices = require('fabric-ca-client');
const { User } = require('fabric-common');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const PostgresRepository = require('./repositories/postgresRepository');
const { encrypt, decrypt } = require('./cryptoUtils');

async function getCAClient() {
  const ccpRaw = fs.readFileSync(config.fabric.connectionProfile, 'utf8');
  const ccp = JSON.parse(ccpRaw);
  const caInfo = ccp.certificateAuthorities[config.fabric.caName];
  const caTLSCACerts = fs.readFileSync(path.resolve(__dirname, '../../', caInfo.tlsCACerts.path));
  
  let caUrl = caInfo.url;
  if (config.fabric.discoveryAsLocalhost) {
    caUrl = caUrl.replace('ca_org1', 'localhost');
  }
  return new FabricCAServices(caUrl, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);
}

async function enrollAdmin() {
  try {
    const ca = await getCAClient();
    const adminIdentity = await PostgresRepository.getIdentity(config.fabric.caAdmin);
    if (adminIdentity) {
      console.log(`An identity for the admin user "${config.fabric.caAdmin}" already exists in the database`);
      return;
    }

    const enrollment = await ca.enroll({ enrollmentID: config.fabric.caAdmin, enrollmentSecret: config.fabric.caAdminPW });
    const x509Identity = {
      credentials: {
        certificate: enrollment.certificate,
        privateKey: enrollment.key.toBytes(),
      },
      mspId: config.fabric.orgMsp,
      type: 'X.509',
      version: 1,
    };

    const encryptedKey = encrypt(x509Identity.credentials.privateKey);
    await PostgresRepository.saveIdentity(
      config.fabric.caAdmin,
      x509Identity.credentials.certificate,
      encryptedKey,
      x509Identity.mspId
    );
    console.log(`Successfully enrolled admin user "${config.fabric.caAdmin}" and saved it to the database`);

  } catch (error) {
    console.error(`Failed to enroll admin user "${config.fabric.caAdmin}": ${error}`);
    throw error;
  }
}

async function enrollUser(username, secret, orgMsp = config.fabric.orgMsp) {
  try {
    const ca = await getCAClient();
    const identity = await PostgresRepository.getIdentity(username);
    if (identity) {
      console.log(`An identity for the user "${username}" already exists in the database`);
      return identity;
    }
    
    const enrollment = await ca.enroll({
      enrollmentID: username,
      enrollmentSecret: secret
    });

    const x509Identity = {
      credentials: {
        certificate: enrollment.certificate,
        privateKey: enrollment.key.toBytes(),
      },
      mspId: orgMsp,
      type: 'X.509',
      version: 1,
    };

    const encryptedKey = encrypt(x509Identity.credentials.privateKey);
    await PostgresRepository.saveIdentity(
      username,
      x509Identity.credentials.certificate,
      encryptedKey,
      x509Identity.mspId
    );
    console.log(`Successfully enrolled user "${username}" and saved it to the database`);
    return x509Identity;
  } catch (error) {
    console.error(`Failed to enroll user "${username}": ${error}`);
    throw error;
  }
}

async function registerAndEnrollUser(username, role, orgMsp = config.fabric.orgMsp, optionalSecret = null) {
  try {
    const identity = await PostgresRepository.getIdentity(username);
    if (identity) {
      console.log(`An identity for the user "${username}" already exists in the database`);
      return identity;
    }

    const adminIdentity = await PostgresRepository.getIdentity(config.fabric.caAdmin);
    if (!adminIdentity) {
      throw new Error('Admin identity missing. Run enrollAdmin first.');
    }

    const decryptedPrivateKey = decrypt(adminIdentity.encrypted_private_key);

    const ca = await getCAClient();
    const cryptoSuite = ca.getCryptoSuite();
    const registrar = new User(config.fabric.caAdmin);
    registrar.setCryptoSuite(cryptoSuite);
    
    const privateKey = await cryptoSuite.importKey(decryptedPrivateKey, { ephemeral: true });
    await registrar.setEnrollment(privateKey, adminIdentity.certificate, adminIdentity.msp_id);

    let secret;
    try {
      secret = await ca.register({
        affiliation: 'org1.department1',
        enrollmentID: username,
        enrollmentSecret: optionalSecret,
        role: 'client',
        attrs: [{ name: 'role', value: role, ecert: true }]
      }, registrar);
    } catch (err) {
      if (err.message.includes('already registered')) {
        const wrapErr = new Error(`User ${username} already registered`);
        wrapErr.code = 'ALREADY_REGISTERED';
        throw wrapErr;
      }
      throw err;
    }

    return await enrollUser(username, secret || optionalSecret, orgMsp);
  } catch (error) {
    if (error.code === 'ALREADY_REGISTERED') throw error;
    console.error(`Failed to register and enroll user "${username}": ${error}`);
    throw error;
  }
}

module.exports = { enrollAdmin, enrollUser, registerAndEnrollUser };
