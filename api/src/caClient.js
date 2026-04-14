const FabricCAServices = require('fabric-ca-client');
const { Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');
const config = require('./config');

async function enrollAdmin() {
  try {
    const ccpRaw = fs.readFileSync(config.fabric.connectionProfile, 'utf8');
    const ccp = JSON.parse(ccpRaw);

    const caInfo = ccp.certificateAuthorities[config.fabric.caName];
    const caTLSCACerts = fs.readFileSync(path.resolve(__dirname, '../../', caInfo.tlsCACerts.path));
    
    // Handle Docker hostname resolution for local development
    let caUrl = caInfo.url;
    if (config.fabric.discoveryAsLocalhost) {
      caUrl = caUrl.replace('ca_org1', 'localhost');
    }

    const ca = new FabricCAServices(caUrl, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);

    const wallet = await Wallets.newFileSystemWallet(config.fabric.walletPath);

    // Check if admin is already enrolled
    const identity = await wallet.get(config.fabric.caAdmin);
    if (identity) {
      console.log(`An identity for the admin user "${config.fabric.caAdmin}" already exists in the wallet`);
      return;
    }

    // Enroll the admin user, and import the new identity into the wallet.
    const enrollment = await ca.enroll({ enrollmentID: config.fabric.caAdmin, enrollmentSecret: config.fabric.caAdminPW });
    const x509Identity = {
      credentials: {
        certificate: enrollment.certificate,
        privateKey: enrollment.key.toBytes(),
      },
      mspId: config.fabric.orgMsp,
      type: 'X.509',
    };
    await wallet.put(config.fabric.caAdmin, x509Identity);
    console.log(`Successfully enrolled admin user "${config.fabric.caAdmin}" and imported it into the wallet`);

  } catch (error) {
    console.error(`Failed to enroll admin user "${config.fabric.caAdmin}": ${error}`);
    throw error;
  }
}

async function registerAndEnrollUser(username, role, orgMsp = config.fabric.orgMsp) {
  try {
    const ccpRaw = fs.readFileSync(config.fabric.connectionProfile, 'utf8');
    const ccp = JSON.parse(ccpRaw);

    const caInfo = ccp.certificateAuthorities[config.fabric.caName];
    const caTLSCACerts = fs.readFileSync(path.resolve(__dirname, '../../', caInfo.tlsCACerts.path));
    
    let caUrl = caInfo.url;
    if (config.fabric.discoveryAsLocalhost) {
      caUrl = caUrl.replace('ca_org1', 'localhost');
    }

    const ca = new FabricCAServices(caUrl, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);
    const wallet = await Wallets.newFileSystemWallet(config.fabric.walletPath);

    // Check if user is already enrolled
    const userIdentity = await wallet.get(username);
    if (userIdentity) {
      console.log(`An identity for the user "${username}" already exists in the wallet`);
      return;
    }

    // Check if admin exists
    const adminIdentity = await wallet.get(config.fabric.caAdmin);
    if (!adminIdentity) {
      console.log('An identity for the admin user does not exist in the wallet. Run enrollAdmin first.');
      throw new Error('Admin identity missing');
    }

    // Build a user object for authenticating with the CA
    const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
    const adminUser = await provider.getUserContext(adminIdentity, config.fabric.caAdmin);

    // Register the user, enroll the user, and import the new identity into the wallet.
    const secret = await ca.register({
      affiliation: 'org1.department1',
      enrollmentID: username,
      role: 'client',
      attrs: [{ name: 'role', value: role, ecert: true }]
    }, adminUser);

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
    };
    await wallet.put(username, x509Identity);
    console.log(`Successfully registered and enrolled user "${username}" and imported it into the wallet`);

  } catch (error) {
    console.error(`Failed to register user "${username}": ${error}`);
    throw error;
  }
}

module.exports = { enrollAdmin, registerAndEnrollUser };
