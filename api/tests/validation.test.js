const { validateLCCreation, validateDocumentsHash } = require('../src/utils/validation');

describe('Validation Utility', () => {
  describe('validateLCCreation', () => {
    const validLC = {
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

    it('should validate a correct LC object', () => {
      expect(() => validateLCCreation(validLC)).not.toThrow();
    });

    it('should throw error for negative amount', () => {
      const invalidLC = { ...validLC, amount: -1 };
      expect(() => validateLCCreation(invalidLC)).toThrow('"amount" must be a positive number');
    });

    it('should throw error for invalid currency code', () => {
      const invalidLC = { ...validLC, currency: 'USDD' };
      expect(() => validateLCCreation(invalidLC)).toThrow('"currency" length must be 3 characters long');
    });

    it('should throw error if expiry is less than 30 days', () => {
      const invalidLC = { ...validLC, expiry: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString() };
      expect(() => validateLCCreation(invalidLC)).toThrow('Validation Error: Expiry date must be at least 30 days in the future');
    });

    it('should throw error if required fields are missing', () => {
      const { id, ...invalidLC } = validLC;
      expect(() => validateLCCreation(invalidLC)).toThrow('"id" is required');
    });
  });

  describe('validateDocumentsHash', () => {
    it('should validate a correct 64-char hex hash', () => {
      const validHash = 'a'.repeat(64);
      expect(() => validateDocumentsHash(validHash)).not.toThrow();
    });

    it('should throw error for invalid length', () => {
      const invalidHash = 'abc123';
      expect(() => validateDocumentsHash(invalidHash)).toThrow(/expected a 64-character SHA-256 hex string/);
    });

    it('should throw error for non-hex characters', () => {
      const invalidHash = 'z'.repeat(64);
      expect(() => validateDocumentsHash(invalidHash)).toThrow(/expected a 64-character SHA-256 hex string/);
    });
  });
});
