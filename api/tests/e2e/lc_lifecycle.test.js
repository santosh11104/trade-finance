const request = require('supertest');
const { app } = require('../../src/app');
const FabricRepository = require('../../src/repositories/fabricRepository');
const PostgresRepository = require('../../src/repositories/postgresRepository');
const jwt = require('jsonwebtoken');
const config = require('../../src/config');

// Mock Database to avoid needing a live Postgres
jest.mock('../../src/db', () => ({
  db: {
    none: jest.fn().mockResolvedValue({}),
    one: jest.fn().mockResolvedValue({ status: 'DOCUMENTS_SUBMITTED' }),
    any: jest.fn().mockResolvedValue([]),
    oneOrNone: jest.fn().mockResolvedValue({})
  },
  initDb: jest.fn().mockResolvedValue({})
}));

const { db } = require('../../src/db');

// Mock Fabric to avoid needing a live network
jest.mock('../../src/repositories/fabricRepository');

describe('E2E LC Lifecycle Integration', () => {
  let token;
  const lcId = `LC-E2E-${Date.now()}`;
  const expiryDate = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString();
  const docHash = 'a'.repeat(64);

  beforeAll(async () => {
    token = jwt.sign(
      { username: 'test-importer', role: 'importer', orgMsp: 'Org1MSP' },
      config.jwtSecret
    );
  });

  it('Step 1: Create LC (Importer)', async () => {
    FabricRepository.createLC.mockResolvedValue({ id: lcId, status: 'CREATED' });
    db.any.mockResolvedValue([{ id: lcId, status: 'CREATED' }]);

    const response = await request(app)
      .post('/lc/create')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: lcId,
        importer: 'Org1',
        exporter: 'Org2',
        issuingBank: 'Org3',
        advisingBank: 'Org4',
        amount: 50000,
        currency: 'USD',
        expiry: expiryDate,
        terms: 'CIF'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(db.none).toHaveBeenCalled();
  });

  it('Step 2: Propose Issue (Importer)', async () => {
    FabricRepository.issueLC.mockResolvedValue('LC issue proposed, awaiting Issuing Bank approval');

    const response = await request(app)
      .post('/lc/issue')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: lcId, pricingData: { fee: 500 } });

    expect(response.status).toBe(200);
    expect(response.body.phase).toBe('PROPOSAL');
  });

  it('Step 3: Approve Issue (Issuing Bank)', async () => {
    const bankToken = jwt.sign(
      { username: 'test-bank', role: 'bank', orgMsp: 'Org3MSP' },
      config.jwtSecret
    );
    FabricRepository.issueLC.mockResolvedValue('LC issued with dual endorsement');

    const response = await request(app)
      .post('/lc/issue')
      .set('Authorization', `Bearer ${bankToken}`)
      .send({ id: lcId, pricingData: { fee: 500 } });

    expect(response.status).toBe(200);
    expect(response.body.phase).toBe('APPROVAL');
  });

  it('Step 4: Ship Goods & Submit Documents (Exporter)', async () => {
    const exporterToken = jwt.sign(
      { username: 'test-exporter', role: 'exporter', orgMsp: 'Org2MSP' },
      config.jwtSecret
    );
    FabricRepository.queryLC.mockResolvedValue({ id: lcId, expiry: expiryDate });
    FabricRepository.submitDocuments.mockResolvedValue('Documents submitted');
    db.one.mockResolvedValue({ status: 'DOCUMENTS_SUBMITTED' });

    const response = await request(app)
      .post('/lc/ship')
      .set('Authorization', `Bearer ${exporterToken}`)
      .send({ id: lcId, documentsHash: docHash });

    expect(response.status).toBe(200);
  });

  it('Step 5: Reject if Expired (Exporter)', async () => {
    const exporterToken = jwt.sign(
      { username: 'test-exporter', role: 'exporter', orgMsp: 'Org2MSP' },
      config.jwtSecret
    );
    const pastDate = new Date(Date.now() - 1000).toISOString();
    FabricRepository.queryLC.mockResolvedValue({ id: lcId, expiry: pastDate });

    const response = await request(app)
      .post('/lc/ship')
      .set('Authorization', `Bearer ${exporterToken}`)
      .send({ id: lcId, documentsHash: docHash });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('expired');
  });
});
