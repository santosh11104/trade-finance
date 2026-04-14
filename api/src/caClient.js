const FabricCAServices = require('fabric-ca-client');
const { User } = require('fabric-common');
const fs = require('fs');
const path = require('path');
const config = require('./config');

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
    const adminPath = path.join(config.fabric.walletPath, `${config.fabric.caAdmin}.id`);
    if (fs.existsSync(adminPath)) {
      console.log(`An identity for the admin user "${config.fabric.caAdmin}" already exists in the wallet`);
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
    
    if (!fs.existsSync(config.fabric.walletPath)) {
      fs.mkdirSync(config.fabric.walletPath, { recursive: true });
    }
    fs.writeFileSync(adminPath, JSON.stringify(x509Identity));
    console.log(`Successfully enrolled admin user "${config.fabric.caAdmin}" and imported it into the wallet`);

  } catch (error) {
    console.error(`Failed to enroll admin user "${config.fabric.caAdmin}": ${error}`);
    throw error;
  }
}

async function enrollUser(username, secret, orgMsp = config.fabric.orgMsp) {
  try {
    const ca = await getCAClient();
    const userPath = path.join(config.fabric.walletPath, `${username}.id`);
    
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
    
    if (!fs.existsSync(config.fabric.walletPath)) {
      fs.mkdirSync(config.fabric.walletPath, { recursive: true });
    }
    fs.writeFileSync(userPath, JSON.stringify(x509Identity));
    console.log(`Successfully enrolled user "${username}" and imported it into the wallet`);
    return x509Identity;
  } catch (error) {
    console.error(`Failed to enroll user "${username}": ${error}`);
    throw error;
  }
}

async function registerAndEnrollUser(username, role, orgMsp = config.fabric.orgMsp, optionalSecret = null) {
  try {
    const userPath = path.join(config.fabric.walletPath, `${username}.id`);
    if (fs.existsSync(userPath)) {
      console.log(`An identity for the user "${username}" already exists in the wallet`);
      return;
    }

    const adminPath = path.join(config.fabric.walletPath, `${config.fabric.caAdmin}.id`);
    if (!fs.existsSync(adminPath)) {
      throw new Error('Admin identity missing. Run enrollAdmin first.');
    }
    const adminIdentity = JSON.parse(fs.readFileSync(adminPath, 'utf8'));

    const ca = await getCAClient();
    const cryptoSuite = ca.getCryptoSuite();
    const registrar = new User(config.fabric.caAdmin);
    registrar.setCryptoSuite(cryptoSuite);
    
    const privateKey = await cryptoSuite.importKey(adminIdentity.credentials.privateKey, { ephemeral: true });
    await registrar.setEnrollment(privateKey, adminIdentity.credentials.certificate, adminIdentity.mspId);

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
