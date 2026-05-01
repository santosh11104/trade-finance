const request = require('supertest');
const { app } = require('../../src/app');

/**
 * UNMOCKED INTEGRATION TEST
 * 
 * This test requires:
 * 1. A running Fabric Network
 * 2. A running PostgreSQL Database
 * 3. Correct identities synced to the DB (run sync-db-with-crypto.js first)
 */

describe('Real Fabric Integration Test (Unmocked)', () => {
  let token;
  const lcId = `LC-REAL-${Date.now()}`;

  // Use a longer timeout for real blockchain transactions
  jest.setTimeout(30000);

  beforeAll(async () => {
    // Step 1: Real Login to get a real JWT
    const loginResponse = await request(app)
      .post('/auth/login')
      .send({
        username: 'importer1',
        password: 'password'
      });

    if (loginResponse.status !== 200) {
        throw new Error(`Login failed: ${JSON.stringify(loginResponse.body)}`);
    }
    token = loginResponse.body.token;
  });

  it('Should successfully create an LC on the real blockchain', async () => {
    const response = await request(app)
      .post('/lc/create')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: lcId,
        importer: 'Org1',
        exporter: 'Org2',
        issuingBank: 'Org3',
        advisingBank: 'Org4',
        amount: 120000,
        currency: 'USD',
        expiry: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days future
        terms: 'FOB'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    
    // The payload should be the JSON string returned from the chaincode
    const payload = JSON.parse(response.body.payload);
    expect(payload.id).toBe(lcId);
    expect(payload.status).toBe('CREATED');
  });

  it('Should fail when creating a duplicate LC (Chaincode validation)', async () => {
    const response = await request(app)
      .post('/lc/create')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: lcId, // Same ID as above
        importer: 'Org1',
        exporter: 'Org2',
        issuingBank: 'Org3',
        advisingBank: 'Org4',
        amount: 500,
        currency: 'USD',
        expiry: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        terms: 'CIF'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('failed to endorse transaction');
  });

  it('Should successfully query the LC from the real blockchain', async () => {
    const response = await request(app)
      .get(`/lc/${lcId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.payload.id).toBe(lcId);
    expect(response.body.payload.status).toBe('CREATED');
  });
});
