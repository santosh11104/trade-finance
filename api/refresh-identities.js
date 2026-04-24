const { db, initDb } = require('./src/db');
const { seedDatabase } = require('./src/seeder');
const { enrollAllAdmins } = require('./src/caClient');

async function refresh() {
  try {
    console.log('Initializing database schema...');
    await initDb();
    
    console.log('Refreshing Fabric identities in database...');

    // 1. Clear existing identities
    await db.none('DELETE FROM fabric_identities');
    console.log('Cleared stale identities from fabric_identities table');

    // 2. Enroll admins first (required for registering users)
    console.log('Enrolling admins...');
    await enrollAllAdmins();

    // 3. Seed users and their identities
    console.log('Seeding users...');
    await seedDatabase();

    console.log('Successfully refreshed all Fabric identities.');
  } catch (err) {
    console.error('Error refreshing identities:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

refresh();
