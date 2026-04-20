const LCService = require('../src/services/lcService');
const FabricRepository = require('../src/repositories/fabricRepository');
const PostgresRepository = require('../src/repositories/postgresRepository');

jest.mock('../src/repositories/fabricRepository');
jest.mock('../src/repositories/postgresRepository');

describe('LCService', () => {
  const user = { username: 'testuser' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createLetterOfCredit', () => {
    it('should successfully create an LC and mirror to postgres', async () => {
      const data = {
        id: 'LC123',
        importer: 'Org1',
        exporter: 'Org2',
        issuingBank: 'Org3',
        advisingBank: 'Org4',
        amount: 10000,
        currency: 'USD',
        expiry: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString(),
        terms: 'FOB'
      };

      FabricRepository.createLC.mockResolvedValue({ id: 'LC123' });
      PostgresRepository.upsertLCMetadata.mockResolvedValue({});

      const result = await LCService.createLetterOfCredit(data, user);

      expect(FabricRepository.createLC).toHaveBeenCalled();
      expect(PostgresRepository.upsertLCMetadata).toHaveBeenCalledWith(expect.objectContaining({
        id: 'LC123',
        status: 'CREATED'
      }));
      expect(result).toEqual({ id: 'LC123' });
    });

    it('should fail if validation fails (short expiry)', async () => {
      const data = {
        expiry: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
      };
      await expect(LCService.createLetterOfCredit(data, {})).rejects.toThrow();
    });
  });

  describe('issueLetterOfCredit', () => {
    it('should issue LC and update status to ISSUED', async () => {
      FabricRepository.issueLC.mockResolvedValue('LC issued');
      const result = await LCService.issueLetterOfCredit('LC1', 'pricing', user);
      expect(result.status).toBe('ISSUED');
      expect(PostgresRepository.updateLCMetadata).toHaveBeenCalledWith('LC1', { status: 'ISSUED', last_event: 'issueLC' });
    });

    it('should set status to ISSUE_PENDING if message contains proposed', async () => {
      FabricRepository.issueLC.mockResolvedValue('proposed');
      const result = await LCService.issueLetterOfCredit('LC1', 'pricing', user);
      expect(result.status).toBe('ISSUE_PENDING');
      expect(result.isProposal).toBe(true);
    });
  });

  describe('adviseLetterOfCredit', () => {
    it('should advise LC and update postgres', async () => {
      FabricRepository.adviseLC.mockResolvedValue('ok');
      await LCService.adviseLetterOfCredit('LC1', user);
      expect(PostgresRepository.updateLCMetadata).toHaveBeenCalledWith('LC1', { status: 'ADVISED', last_event: 'adviseLC' });
    });
  });

  describe('confirmLetterOfCredit', () => {
    it('should confirm LC and update postgres', async () => {
      FabricRepository.confirmLC.mockResolvedValue('ok');
      await LCService.confirmLetterOfCredit('LC1', user);
      expect(PostgresRepository.updateLCMetadata).toHaveBeenCalledWith('LC1', { status: 'CONFIRMED', last_event: 'confirmLC' });
    });
  });

  describe('submitShipmentDocuments', () => {
    it('should throw error if LC is expired', async () => {
      const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      FabricRepository.queryLC.mockResolvedValue({ expiry: pastDate });

      await expect(LCService.submitShipmentDocuments('LC123', 'a'.repeat(64), { username: 'user' }))
        .rejects.toThrow(/LC has expired/);
    });

    it('should call fabric and postgres if LC is valid', async () => {
      const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
      const validHash = 'a'.repeat(64);
      FabricRepository.queryLC.mockResolvedValue({ expiry: futureDate });
      FabricRepository.submitDocuments.mockResolvedValue({ success: true });

      await LCService.submitShipmentDocuments('LC123', validHash, { username: 'user' });

      expect(FabricRepository.submitDocuments).toHaveBeenCalledWith('LC123', validHash, 'user');
      expect(PostgresRepository.updateLCMetadata).toHaveBeenCalledWith('LC123', { 
        status: 'DOCUMENTS_SUBMITTED', 
        last_event: 'submitDocuments' 
      });
    });
  });

  describe('verifyShipmentDocuments', () => {
    it('should verify documents and update status', async () => {
      FabricRepository.verifyDocuments.mockResolvedValue('ok');
      await LCService.verifyShipmentDocuments('LC1', user);
      expect(PostgresRepository.updateLCMetadata).toHaveBeenCalledWith('LC1', { status: 'VERIFIED', last_event: 'verifyDocuments' });
    });
  });

  describe('releasePayment', () => {
    it('should release payment and set status to PAID', async () => {
      FabricRepository.releasePayment.mockResolvedValue('Payment released');
      const result = await LCService.releasePayment('LC1', 'details', user);
      expect(result.status).toBe('PAID');
    });

    it('should set status to PAYMENT_PENDING if proposed', async () => {
      FabricRepository.releasePayment.mockResolvedValue('proposed payment');
      const result = await LCService.releasePayment('LC1', 'details', user);
      expect(result.status).toBe('PAYMENT_PENDING');
    });
  });

  describe('amendLetterOfCredit', () => {
    it('should amend LC and update status', async () => {
      FabricRepository.amendLC.mockResolvedValue('ok');
      await LCService.amendLetterOfCredit('LC1', 'note', user);
      expect(PostgresRepository.updateLCMetadata).toHaveBeenCalledWith('LC1', { status: 'AMENDED', last_event: 'amendLC' });
    });
  });

  describe('cancelLetterOfCredit', () => {
    it('should cancel LC and update status', async () => {
      FabricRepository.cancelLC.mockResolvedValue('ok');
      await LCService.cancelLetterOfCredit('LC1', user);
      expect(PostgresRepository.updateLCMetadata).toHaveBeenCalledWith('LC1', { status: 'CANCELLED', last_event: 'cancelLC' });
    });
  });

  describe('getLCDetails', () => {
    it('should return LC details from fabric', async () => {
      FabricRepository.queryLC.mockResolvedValue({ id: 'LC1' });
      const result = await LCService.getLCDetails('LC1', user);
      expect(result).toEqual({ id: 'LC1' });
    });
  });

  describe('getLCList', () => {
    it('should return LC list from postgres', async () => {
      PostgresRepository.listLCs.mockResolvedValue([{ id: 'LC1' }]);
      const result = await LCService.getLCList({ status: 'ISSUED' });
      expect(result).toEqual([{ id: 'LC1' }]);
    });
  });

  describe('getLCStatusHistory', () => {
    it('should return history from fabric', async () => {
      FabricRepository.getLCStatusHistory.mockResolvedValue([{ status: 'CREATED' }]);
      const result = await LCService.getLCStatusHistory('LC1', user);
      expect(result).toEqual([{ status: 'CREATED' }]);
    });
  });
});
