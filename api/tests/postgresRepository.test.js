const PostgresRepository = require('../src/repositories/postgresRepository');
const { db } = require('../src/db');

jest.mock('../src/db', () => ({
  db: {
    oneOrNone: jest.fn(),
    none: jest.fn(),
    one: jest.fn(),
    any: jest.fn()
  }
}));

describe('PostgresRepository', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findUserByUsername', () => {
    it('should call db.oneOrNone with correct query', async () => {
      db.oneOrNone.mockResolvedValue({ username: 'test' });
      const result = await PostgresRepository.findUserByUsername('test');
      expect(db.oneOrNone).toHaveBeenCalledWith(expect.stringContaining('SELECT username'), ['test']);
      expect(result.username).toBe('test');
    });
  });

  describe('saveIdentity', () => {
    it('should call db.none with correct parameters', async () => {
      await PostgresRepository.saveIdentity('user1', 'cert', 'key', 'Org1MSP');
      expect(db.none).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO fabric_identities'),
        ['user1', 'cert', 'key', 'Org1MSP']
      );
    });
  });

  describe('getIdentity', () => {
    it('should call db.oneOrNone with correct query', async () => {
      db.oneOrNone.mockResolvedValue({ certificate: 'cert' });
      const result = await PostgresRepository.getIdentity('user1');
      expect(db.oneOrNone).toHaveBeenCalledWith(expect.stringContaining('SELECT certificate'), ['user1']);
      expect(result.certificate).toBe('cert');
    });
  });

  describe('createUser', () => {
    it('should call db.one with correct parameters', async () => {
      const user = { username: 'user1', passwordHash: 'hash', role: 'importer', orgMsp: 'Org1MSP' };
      db.one.mockResolvedValue({ username: 'user1' });
      const result = await PostgresRepository.createUser(user);
      expect(db.one).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        ['user1', 'hash', 'importer', 'Org1MSP']
      );
      expect(result.username).toBe('user1');
    });
  });

  describe('listLCs', () => {
    it('should call db.any without filters', async () => {
      await PostgresRepository.listLCs();
      expect(db.any).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM lc_metadata'), []);
    });

    it('should call db.any with status filter', async () => {
      await PostgresRepository.listLCs({ status: 'ISSUED' });
      expect(db.any).toHaveBeenCalledWith(expect.stringContaining('WHERE status = $1'), ['ISSUED']);
    });
  });

  describe('updateLCMetadata', () => {
    it('should call db.none with dynamic set clause', async () => {
      const data = { status: 'ADVISED', exporter: 'Exp1' };
      await PostgresRepository.updateLCMetadata('LC1', data);
      expect(db.none).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE lc_metadata SET status = $1, exporter = $2'),
        ['ADVISED', 'Exp1', 'LC1']
      );
    });
  });

  describe('upsertLCMetadata', () => {
    it('should call db.none with full LC data', async () => {
      const lc = {
        id: 'LC123',
        importer: 'Org1',
        exporter: 'Org2',
        issuingBank: 'Bank1',
        advisingBank: 'Bank2',
        amount: 100,
        currency: 'USD',
        status: 'ISSUED',
        createdAt: '2023-01-01',
        updatedAt: '2023-01-01',
        lastEvent: 'EVENT1'
      };
      await PostgresRepository.upsertLCMetadata(lc);
      expect(db.none).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO lc_metadata'),
        expect.arrayContaining(['LC123', 'Org1', 'Org2', 'Bank1', 'Bank2', 100, 'USD', 'ISSUED', '2023-01-01', '2023-01-01', 'EVENT1'])
      );
    });
  });

  describe('createAuditLog', () => {
    it('should call db.none with correct parameters', async () => {
      const log = { lcId: 'LC1', eventType: 'ISSUE', payload: { data: 1 }, source: 'fabric' };
      await PostgresRepository.createAuditLog(log);
      expect(db.none).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_logs'),
        ['LC1', 'ISSUE', { data: 1 }, 'fabric']
      );
    });
  });
});
