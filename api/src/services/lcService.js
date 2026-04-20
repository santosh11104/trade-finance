const FabricRepository = require('../repositories/fabricRepository');
const PostgresRepository = require('../repositories/postgresRepository');
const { validateLCCreation } = require('../utils/validation');

const LCService = {
  async createLetterOfCredit(data, user) {
    // 0. API Level Validation
    validateLCCreation(data);

    // 1. Commit to Blockchain (Source of Truth)
    const result = await FabricRepository.createLC(
      data.id,
      data.importer,
      data.exporter,
      data.issuingBank,
      data.advisingBank,
      data.amount.toString(),
      data.currency,
      data.expiry,
      data.terms,
      user.username
    );

    // 2. Mirror to Postgres (Off-chain store for searching)
    // We assume the blockchain returned the created LC object or we use the input data
    await PostgresRepository.upsertLCMetadata({
      id: data.id,
      importer: data.importer,
      exporter: data.exporter,
      issuingBank: data.issuingBank,
      advisingBank: data.advisingBank,
      amount: data.amount,
      currency: data.currency,
      status: 'CREATED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastEvent: 'createLC'
    });

    return result;
  },

  async issueLetterOfCredit(id, pricingData, user) {
    const result = await FabricRepository.issueLC(id, pricingData, user.username);
    const message = result.toString ? result.toString() : result;

    let status = 'ISSUE_PENDING';
    if (!message.includes('proposed')) {
      status = 'ISSUED';
    }

    await PostgresRepository.updateLCMetadata(id, {
      status: status,
      last_event: 'issueLC'
    });

    return {
      message: message,
      status: status,
      isProposal: message.includes('proposed')
    };
  },

  async adviseLetterOfCredit(id, user) {
    const result = await FabricRepository.adviseLC(id, user.username);
    await PostgresRepository.updateLCMetadata(id, { status: 'ADVISED', last_event: 'adviseLC' });
    return result;
  },

  async confirmLetterOfCredit(id, user) {
    const result = await FabricRepository.confirmLC(id, user.username);
    await PostgresRepository.updateLCMetadata(id, { status: 'CONFIRMED', last_event: 'confirmLC' });
    return result;
  },

  async submitShipmentDocuments(id, documentsHash, user) {
    // 0. Preliminary Check (Optional but good for UX)
    const lc = await FabricRepository.queryLC(id, user.username);
    if (new Date(lc.expiry) < new Date()) {
      throw new Error(`Validation Error: LC has expired on [${lc.expiry}]`);
    }

    const result = await FabricRepository.submitDocuments(id, documentsHash, user.username);
    await PostgresRepository.updateLCMetadata(id, { status: 'DOCUMENTS_SUBMITTED', last_event: 'submitDocuments' });
    return result;
  },

  async verifyShipmentDocuments(id, user) {
    const result = await FabricRepository.verifyDocuments(id, user.username);
    await PostgresRepository.updateLCMetadata(id, { status: 'VERIFIED', last_event: 'verifyDocuments' });
    return result;
  },

  async releasePayment(id, paymentDetails, user) {
    const result = await FabricRepository.releasePayment(id, paymentDetails, user.username);
    const message = result.toString ? result.toString() : result;

    let status = 'PAYMENT_PENDING';
    if (!message.includes('proposed')) {
      status = 'PAID';
    }

    await PostgresRepository.updateLCMetadata(id, { status: status, last_event: 'releasePayment' });

    return {
      message: message,
      status: status,
      isProposal: message.includes('proposed')
    };
  },

  async amendLetterOfCredit(id, amendmentNote, user) {
    const result = await FabricRepository.amendLC(id, amendmentNote, user.username);
    await PostgresRepository.updateLCMetadata(id, { status: 'AMENDED', last_event: 'amendLC' });
    return result;
  },

  async cancelLetterOfCredit(id, user) {
    const result = await FabricRepository.cancelLC(id, user.username);
    await PostgresRepository.updateLCMetadata(id, { status: 'CANCELLED', last_event: 'cancelLC' });
    return result;
  },

  async getLCDetails(id, user) {
    // Fetch from blockchain for 100% accuracy
    return FabricRepository.queryLC(id, user.username);
  },

  async getLCList(filters) {
    // Fetch from Postgres for performance and search
    return PostgresRepository.listLCs(filters);
  },

  async getLCStatusHistory(id, user) {
    return FabricRepository.getLCStatusHistory(id, user.username);
  }
};

module.exports = LCService;
