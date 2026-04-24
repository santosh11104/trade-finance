const FabricRepository = require('../repositories/fabricRepository');
const PostgresRepository = require('../repositories/postgresRepository');
const logger = require('../utils/logger');
const { validateLCCreation, validateDocumentsHash } = require('../utils/validation');
const { lcCreatedCounter, lcTransactionDuration } = require('../metrics');

/**
 * Helper to log events to the audit table
 */
async function logEvent(lcId, eventType, user, details = {}) {
  try {
    await PostgresRepository.createAuditLog({
      lcId,
      eventType,
      source: 'API',
      payload: {
        actor: user.username,
        role: user.role,
        msp: user.orgMsp,
        timestamp: new Date().toISOString(),
        ...details
      }
    });

    logger.info(`LC Event: ${eventType}`, { lcId, user: user.username, role: user.role, ...details });
  } catch (err) {
    logger.error(`Failed to create audit log for ${eventType}`, { error: err.message, lcId });
  }
}

const LCService = {
  async createLetterOfCredit(data, user) {
    // 0. API Level Validation
    validateLCCreation(data);

    const end = lcTransactionDuration.startTimer({ operation: 'createLC' });

    // 1. Commit to Blockchain (Source of Truth)
    try {
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

      // 3. Audit Log
      await logEvent(data.id, 'LC_CREATED', user, { amount: data.amount, currency: data.currency });

      // 4. Metrics
      lcCreatedCounter.inc({ msp_id: user.orgMsp, status: 'CREATED' });
      end({ status: 'success' });

      return result;
    } catch (err) {
      end({ status: 'error' });
      throw err;
    }
  },

  async issueLetterOfCredit(id, pricingData, user) {
    const end = lcTransactionDuration.startTimer({ operation: 'issueLC' });
    try {
      const result = await FabricRepository.issueLC(id, pricingData, user.username);
      const message = result.toString ? result.toString() : result;

      let status = 'ISSUE_PENDING';
      let eventType = 'LC_ISSUE_PROPOSED';
      if (!message.includes('proposed')) {
        status = 'ISSUED';
        eventType = 'LC_ISSUED';
      }

      await PostgresRepository.updateLCMetadata(id, {
        status: status,
        last_event: 'issueLC'
      });

      await logEvent(id, eventType, user, { message });

      end({ status: 'success' });
      return {
        message: message,
        status: status,
        isProposal: message.includes('proposed')
      };
    } catch (err) {
      end({ status: 'error' });
      throw err;
    }
  },

  async adviseLetterOfCredit(id, user) {
    const result = await FabricRepository.adviseLC(id, user.username);
    await PostgresRepository.updateLCMetadata(id, { status: 'ADVISED', last_event: 'adviseLC' });
    await logEvent(id, 'LC_ADVISED', user);
    return result;
  },

  async confirmLetterOfCredit(id, user) {
    const result = await FabricRepository.confirmLC(id, user.username);
    await PostgresRepository.updateLCMetadata(id, { status: 'CONFIRMED', last_event: 'confirmLC' });
    await logEvent(id, 'LC_CONFIRMED', user);
    return result;
  },

  async submitShipmentDocuments(id, documentsHash, user) {
    // 0. Preliminary Check (Optional but good for UX)
    validateDocumentsHash(documentsHash);
    const lc = await FabricRepository.queryLC(id, user.username);
    if (new Date(lc.expiry) < new Date()) {
      throw new Error(`Validation Error: LC has expired on [${lc.expiry}]`);
    }

    const result = await FabricRepository.submitDocuments(id, documentsHash, user.username);
    await PostgresRepository.updateLCMetadata(id, { status: 'DOCUMENTS_SUBMITTED', last_event: 'submitDocuments' });
    await logEvent(id, 'DOCUMENTS_SUBMITTED', user, { hash: documentsHash });
    return result;
  },

  async verifyShipmentDocuments(id, user) {
    const result = await FabricRepository.verifyDocuments(id, user.username);
    await PostgresRepository.updateLCMetadata(id, { status: 'VERIFIED', last_event: 'verifyDocuments' });
    await logEvent(id, 'DOCUMENTS_VERIFIED', user);
    return result;
  },

  async releasePayment(id, paymentDetails, user) {
    const result = await FabricRepository.releasePayment(id, paymentDetails, user.username);
    const message = result.toString ? result.toString() : result;

    let status = 'PAYMENT_PENDING';
    let eventType = 'PAYMENT_PROPOSED';
    if (!message.includes('proposed')) {
      status = 'PAID';
      eventType = 'PAYMENT_RELEASED';
    }

    await PostgresRepository.updateLCMetadata(id, { status: status, last_event: 'releasePayment' });
    await logEvent(id, eventType, user, { message });

    return {
      message: message,
      status: status,
      isProposal: message.includes('proposed')
    };
  },

  async amendLetterOfCredit(id, amendmentNote, user) {
    const result = await FabricRepository.amendLC(id, amendmentNote, user.username);
    await PostgresRepository.updateLCMetadata(id, { status: 'AMENDED', last_event: 'amendLC' });
    await logEvent(id, 'LC_AMENDED', user, { note: amendmentNote });
    return result;
  },

  async cancelLetterOfCredit(id, user) {
    const result = await FabricRepository.cancelLC(id, user.username);
    await PostgresRepository.updateLCMetadata(id, { status: 'CANCELLED', last_event: 'cancelLC' });
    await logEvent(id, 'LC_CANCELLED', user);
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
