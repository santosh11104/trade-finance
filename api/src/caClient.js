const FabricCAServices = require('fabric-ca-client');
const { User } = require('fabric-common');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const PostgresRepository = require('./repositories/postgresRepository');
const { encrypt, decrypt } = require('./cryptoUtils');
 
function getCaNameFromMsp(mspId) {
  const mapping = {
    'Org1MSP': 'ca-org1',
    'Org2MSP': 'ca-org2',
    'Org3MSP': 'ca-org3',
    'Org4MSP': 'ca-org4',
  };
  return mapping[mspId] || config.fabric.caName;
}

async function getCAClient(caName = config.fabric.caName) {
  const ccpRaw = fs.readFileSync(config.fabric.connectionProfile, 'utf8');
  const ccp = JSON.parse(ccpRaw);
  const caInfo = ccp.certificateAuthorities[caName];
  if (!caInfo) {
    throw new Error(`CA configuration for ${caName} not found in connection profile`);
  }
  const caTLSCACerts = fs.readFileSync(path.resolve(__dirname, '../../', caInfo.tlsCACerts.path));

  let caUrl = caInfo.url;
  if (config.fabric.discoveryAsLocalhost) {
    caUrl = caUrl.replace(/ca-org\d+/, 'localhost');
  }
  return new FabricCAServices(caUrl, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);
}

async function enrollAllAdmins() {
  try {
    const orgs = Object.keys(config.fabric.caAdminMap);

    for (const mspId of orgs) {
      const { id: adminId, pw: adminPw } = config.fabric.caAdminMap[mspId];
      const caName = getCaNameFromMsp(mspId);
      const ca = await getCAClient(caName);

      const identityKey = `admin_${mspId}`;
      let adminIdentity = await PostgresRepository.getIdentity(identityKey);

      if (!adminIdentity) {
        const enrollment = await ca.enroll({ enrollmentID: adminId, enrollmentSecret: adminPw });
        const x509Identity = {
          credentials: {
            certificate: enrollment.certificate,
            privateKey: enrollment.key.toBytes(),
          },
          mspId: mspId,
          type: 'X.509',
          version: 1,
        };

        const encryptedKey = encrypt(x509Identity.credentials.privateKey);
        await PostgresRepository.saveIdentity(
          identityKey,
          x509Identity.credentials.certificate,
          encryptedKey,
          x509Identity.mspId
        );
        console.log(`Successfully enrolled admin user "${identityKey}" for ${mspId} and saved it to the database`);
        adminIdentity = await PostgresRepository.getIdentity(identityKey);
      } else {
        console.log(`An identity for the admin user "${identityKey}" already exists in the database`);
      }

      // Ensure affiliation exists
      const decryptedPrivateKey = decrypt(adminIdentity.encrypted_private_key);
      const cryptoSuite = ca.getCryptoSuite();
      const registrar = new User(adminId);
      registrar.setCryptoSuite(cryptoSuite);
      const privateKey = await cryptoSuite.importKey(decryptedPrivateKey, { ephemeral: true });
      await registrar.setEnrollment(privateKey, adminIdentity.certificate, adminIdentity.msp_id);

      const affiliationService = ca.newAffiliationService();
      const orgName = mspId.replace('MSP', '').toLowerCase();
      const affiliation = `${orgName}.department1`;
      
      try {
        await affiliationService.create({ name: orgName, force: true }, registrar);
        console.log(`Created affiliation root: ${orgName}`);
      } catch (err) {
        // Ignore if already exists
      }

      try {
        await affiliationService.create({ name: affiliation, force: true }, registrar);
        console.log(`Ensured affiliation exists: ${affiliation}`);
      } catch (err) {
        // Ignore if already exists
      }
    }
  } catch (error) {
    console.error(`Failed to enroll admins: ${error}`);
    throw error;
  }
}

async function enrollUser(username, secret, orgMsp = config.fabric.orgMsp) {
  try {
    const caName = getCaNameFromMsp(orgMsp);
    const ca = await getCAClient(caName);
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

    const adminIdentityKey = `admin_${orgMsp}`;
    const adminIdentity = await PostgresRepository.getIdentity(adminIdentityKey);
    if (!adminIdentity) {
      throw new Error(`Admin identity for ${orgMsp} (${adminIdentityKey}) missing. Run enrollAllAdmins first.`);
    }

    const decryptedPrivateKey = decrypt(adminIdentity.encrypted_private_key);
    const caName = getCaNameFromMsp(orgMsp);
    const ca = await getCAClient(caName);
    const cryptoSuite = ca.getCryptoSuite();
    const adminConfig = config.fabric.caAdminMap[orgMsp] || { id: config.fabric.caAdmin };
    const registrar = new User(adminConfig.id);
    registrar.setCryptoSuite(cryptoSuite);
    
    const privateKey = await cryptoSuite.importKey(decryptedPrivateKey, { ephemeral: true });
    await registrar.setEnrollment(privateKey, adminIdentity.certificate, adminIdentity.msp_id);

    let secret;
    try {
      const affiliationMapping = {
      'Org1MSP': 'org1.department1',
      'Org2MSP': 'org2.department1',
      'Org3MSP': 'org3.department1',
      'Org4MSP': 'org4.department1',
    };
    const affiliation = affiliationMapping[orgMsp] || 'org1.department1';

    secret = await ca.register({
      affiliation: affiliation,
      enrollmentID: username,
      enrollmentSecret: optionalSecret,
      role: 'client',
      attrs: [{ name: 'role', value: role, ecert: true }]
    }, registrar);
    } catch (err) {
      if (err.message.includes('already registered')) {
        console.log(`User ${username} is already registered with CA, proceeding to enrollment...`);
        // If already registered, we can't get the secret again unless it was provided
        if (!optionalSecret) {
           throw new Error(`User ${username} already registered and no enrollment secret provided to attempt enrollment`);
        }
        secret = optionalSecret;
      } else {
        throw err;
      }
    }

    return await enrollUser(username, secret, orgMsp);
  } catch (error) {
    if (error.code === 'ALREADY_REGISTERED') throw error;
    console.error(`Failed to register and enroll user "${username}": ${error}`);
    throw error;
  }
}

module.exports = { enrollAllAdmins, enrollUser, registerAndEnrollUser };
