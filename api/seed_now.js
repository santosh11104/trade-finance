const { db, initDb } = require('./src/db');
const { seedDatabase } = require('./src/seeder');
const caClient = require('./src/caClient');
const logger = require('./src/utils/logger');

async function run() {
    try {
        console.log('Initializing DB...');
        await initDb();

        console.log('Enrolling all admins first...');
        await caClient.enrollAllAdmins();

        console.log('Starting seeding process...');
        await seedDatabase();

        console.log('Seeding successful!');
        process.exit(0);
    } catch (err) {
        console.error('Seeding failed:', err);
        process.exit(1);
    }
}

run();
