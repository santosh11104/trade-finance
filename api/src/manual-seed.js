const { initDb } = require('./db');
const caClient = require('./caClient');
const PostgresRepository = require('./repositories/postgresRepository');
const bcrypt = require('bcryptjs');

async function seedDatabaseVerbose() {
  console.log('Ensuring database and Fabric identities are seeded (VERBOSE)...');
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('password', salt);

  const users = [
    { username: 'importer1', role: 'admin', org: 'Org1MSP' },
    { username: 'exporter1', role: 'operator', org: 'Org2MSP' },
    { username: 'bank1', role: 'admin', org: 'Org3MSP' },
    { username: 'bank2', role: 'admin', org: 'Org4MSP' },
    { username: 'admin', role: 'admin', org: 'Org1MSP' }
  ];

  for (const user of users) {
    try {
      console.log(`Processing user: ${user.username} (${user.org})`);
      // Create user if not exists
      await PostgresRepository.createUser({
        username: user.username,
        passwordHash: passwordHash,
        role: user.role,
        orgMsp: user.org
      }).catch(err => {
        if (err.code !== '23505') throw err; // Ignore unique constraint violation
      });

      // Ensure Fabric identity exists
      const enrollmentSecret = 'password';
      try {
        console.log(`  Registering and enrolling ${user.username}...`);
        await caClient.registerAndEnrollUser(user.username, user.role, user.org, enrollmentSecret);
        console.log(`  Successfully setup identity for ${user.username}`);
      } catch (caErr) {
        console.error(`  Failed registerAndEnroll for ${user.username}: ${caErr.message}`);
        if (caErr.code !== 'ALREADY_REGISTERED') {
          console.log(`  Attempting direct enroll for ${user.username}...`);
          await caClient.enrollUser(user.username, enrollmentSecret, user.org);
          console.log(`  Successfully enrolled ${user.username} directly`);
        }
      }
    } catch (err) {
      console.error(`CRITICAL error for user ${user.username}:`, err);
    }
  }
}

async function main() {
  try {
    console.log('Starting verbose manual seed...');
    await initDb();
    await caClient.enrollAllAdmins();
    await seedDatabaseVerbose();
    console.log('Verbose manual seed completed');
    process.exit(0);
  } catch (err) {
    console.error('Manual seed failed:', err);
    process.exit(1);
  }
}

main();
