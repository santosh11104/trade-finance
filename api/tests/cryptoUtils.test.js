const { encrypt, decrypt } = require('../src/cryptoUtils');

describe('cryptoUtils', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.IDENTITY_ENCRYPTION_KEY = 'test-encryption-key-32-chars-long-!!!';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt a string correctly', () => {
      const plainText = 'Hello World';
      const encrypted = encrypt(plainText);
      expect(encrypted).toContain(':');
      
      const decrypted = decrypt(encrypted);
      expect(decrypted.toString()).toBe(plainText);
    });

    it('should encrypt and decrypt a Buffer correctly', () => {
      const plainText = Buffer.from('Hello Buffer');
      const encrypted = encrypt(plainText);
      const decrypted = decrypt(encrypted);
      expect(decrypted.toString()).toBe('Hello Buffer');
    });

    it('should throw error if IDENTITY_ENCRYPTION_KEY is missing during encryption', () => {
      delete process.env.IDENTITY_ENCRYPTION_KEY;
      expect(() => encrypt('test')).toThrow('IDENTITY_ENCRYPTION_KEY environment variable is not set');
    });

    it('should throw error if IDENTITY_ENCRYPTION_KEY is missing during decryption', () => {
      const encrypted = encrypt('test');
      delete process.env.IDENTITY_ENCRYPTION_KEY;
      expect(() => decrypt(encrypted)).toThrow('IDENTITY_ENCRYPTION_KEY environment variable is not set');
    });

    it('should throw error for invalid encrypted data format', () => {
      expect(() => decrypt('invalidformat')).toThrow('Invalid encrypted data format');
      expect(() => decrypt('a:b')).toThrow('Invalid encrypted data format');
    });

    it('should throw error if decryption fails (e.g. tampered data)', () => {
      const encrypted = encrypt('test');
      const parts = encrypted.split(':');
      // Tamper with the ciphertext
      parts[2] = Buffer.from('tampered').toString('base64');
      const tampered = parts.join(':');
      expect(() => decrypt(tampered)).toThrow();
    });
  });
});
