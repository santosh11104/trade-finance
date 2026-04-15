const fabricClient = require('../fabricClient');
const config = require('../config');

const FabricRepository = {
  /**
   * Generic wrapper for submitting transactions
   */
  async submit(transactionName, args, userId) {
    return fabricClient.submitTransaction(transactionName, args, userId);
  },

  /**
   * Generic wrapper for evaluating transactions
   */
  async evaluate(transactionName, args, userId) {
    return fabricClient.evaluateTransaction(transactionName, args, userId);
  },

  // --- Domain Specific Methods ---

  async createLC(id, importer, exporter, issuingBank, advisingBank, amount, currency, expiry, terms, userId) {
    return this.submit('createLC', [id, importer, exporter, issuingBank, advisingBank, amount, currency, expiry, terms], userId);
  },

  async issueLC(id, pricingData, userId) {
    return this.submit('issueLC', [id, pricingData], userId);
  },

  async adviseLC(id, userId) {
    return this.submit('adviseLC', [id], userId);
  },

  async confirmLC(id, userId) {
    return this.submit('confirmLC', [id], userId);
  },

  async submitDocuments(id, documentsHash, userId) {
    return this.submit('submitDocuments', [id, documentsHash], userId);
  },

  async verifyDocuments(id, userId) {
    return this.submit('verifyDocuments', [id], userId);
  },

  async releasePayment(id, paymentDetails, userId) {
    return this.submit('releasePayment', [id, paymentDetails], userId);
  },

  async amendLC(id, amendmentNote, userId) {
    return this.submit('amendLC', [id, amendmentNote], userId);
  },

  async cancelLC(id, userId) {
    return this.submit('cancelLC', [id], userId);
  },

  async queryLC(id, userId) {
    const result = await this.evaluate('queryLC', [id], userId);
    return JSON.parse(result);
  },

  async getLCStatusHistory(id, userId) {
    const result = await this.evaluate('getLCStatusHistory', [id], userId);
    return JSON.parse(result);
  }
};

module.exports = FabricRepository;
