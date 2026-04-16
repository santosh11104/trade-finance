const bcrypt = require('bcryptjs');
const PostgresRepository = require('./repositories/postgresRepository');
const caClient = require('./caClient');

async function seedDatabase() {
  try {
    console.log('Ensuring database and Fabric identities are seeded...');
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('password', salt);

    const users = [
      { username: 'importer1', role: 'importer', org: 'Org1MSP' },
      { username: 'exporter1', role: 'exporter', org: 'Org2MSP' },
      { username: 'bank1', role: 'bank', org: 'Org3MSP' },
      { username: 'bank2', role: 'bank', org: 'Org4MSP' },
      { username: 'admin', role: 'admin', org: 'Org1MSP' }
    ];

    for (const user of users) {
      try {
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
        try {
          const enrollmentSecret = 'password';
          await caClient.registerAndEnrollUser(user.username, user.role, user.org, enrollmentSecret);
        } catch (caErr) {
          if (caErr.code !== 'ALREADY_REGISTERED') {
            await caClient.enrollUser(user.username, enrollmentSecret, user.org).catch(e => {
               console.warn(`Fabric identity setup failed for ${user.username}: ${e.message}`);
            });
          }
        }
      } catch (err) {
        console.error(`Failed to seed user ${user.username}: ${err.message}`);
      }
    }
    console.log('Database seeding completed');
  } catch (err) {
    console.error('Error seeding database:', err);
    throw err;
  }
}

module.exports = { seedDatabase };
