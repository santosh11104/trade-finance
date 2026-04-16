const crypto = require('crypto');
const config = require('./config');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Derive a 32-byte key from the IDENTITY_ENCRYPTION_KEY environment variable
 */
function getEncryptionKey() {
  const key = process.env.IDENTITY_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('IDENTITY_ENCRYPTION_KEY environment variable is not set');
  }
  // Ensure the key is exactly 32 bytes for aes-256
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypts a plain text string or buffer using AES-256-GCM
 * @param {string|Buffer} text
 * @returns {string} Encrypted data in format: iv:authTag:ciphertext (base64 encoded)
 */
function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);

  const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypts an encrypted string created by the encrypt function
 * @param {string} encryptedData
 * @returns {Buffer} Decrypted data
 */
function decrypt(encryptedData) {
  const [ivBase64, authTagBase64, ciphertextBase64] = encryptedData.split(':');
  if (!ivBase64 || !authTagBase64 || !ciphertextBase64) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');
  const ciphertext = Buffer.from(ciphertextBase64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

module.exports = { encrypt, decrypt };
