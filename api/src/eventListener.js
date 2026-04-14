const config = require('./config');
const db = require('./db');

async function startEventListener() {
  // Event listening requires peer event service access which often has
  // permission issues with test networks. Skip for now - API works without it.
  console.log('Event listener disabled - using transaction-based updates only');
  return;
}

async function syncLCMetadata(contract, lcId, lastEvent) {
  try {
    const result = await contract.evaluateTransaction('queryLC', [lcId]);
    const lc = JSON.parse(result.toString());

    await db.query(
      `INSERT INTO lc_metadata (
         id, importer, exporter, issuing_bank, advising_bank, amount, currency, status,
         created_at, updated_at, last_event,
         issue_proposed_by, issue_approved_by, payment_proposed_by, payment_approved_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at,
         last_event = EXCLUDED.last_event,
         issue_proposed_by = EXCLUDED.issue_proposed_by,
         issue_approved_by = EXCLUDED.issue_approved_by,
         payment_proposed_by = EXCLUDED.payment_proposed_by,
         payment_approved_by = EXCLUDED.payment_approved_by`,
      [
        lc.id,
        lc.importer,
        lc.exporter,
        lc.issuingBank,
        lc.advisingBank,
        lc.amount,
        lc.currency,
        lc.status,
        lc.createdAt,
        lc.updatedAt,
        lastEvent,
        lc.issueProposal?.proposedBy || null,
        lc.issueProposal?.approvedBy || null,
        lc.paymentProposal?.proposedBy || null,
        lc.paymentProposal?.approvedBy || null
      ]
    );
  } catch (err) {
    console.error(`Failed to sync LC metadata for ${lcId}:`, err.message);
  }
}

module.exports = { startEventListener, syncLCMetadata };
