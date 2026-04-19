const caClient = require('../caClient');
const PostgresRepository = require('../repositories/postgresRepository');

const AuthService = {
  async enrollUser(data) {
    const { username, role, orgMsp, secret } = data;

    if (!username || !role || !orgMsp || !secret) {
      throw new Error('Missing required fields: username, role, orgMsp, and secret are required');
    }

    // 1. Ensure the user exists in the users table first
    const user = await PostgresRepository.getUser(username);
    if (!user) {
      throw new Error(`User ${username} does not exist in the system. Please create the user first.`);
    }

    if (user.org_msp !== orgMsp) {
      throw new Error(`User ${username} belongs to ${user.org_msp}, not ${orgMsp}`);
    }

    // 2. Register and Enroll with the correct CA
    // This uses the fixed caClient that supports multi-org CAs
    return await caClient.registerAndEnrollUser(username, role, orgMsp, secret);
  }
};

module.exports = AuthService;
