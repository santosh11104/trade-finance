const config = require('./config');
const PostgresRepository = require('./repositories/postgresRepository');

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

    await PostgresRepository.upsertLCMetadata({
      id: lc.id,
      importer: lc.importer,
      exporter: lc.exporter,
      issuingBank: lc.issuingBank,
      advisingBank: lc.advisingBank,
      amount: lc.amount,
      currency: lc.currency,
      status: lc.status,
      createdAt: lc.createdAt,
      updatedAt: lc.updatedAt,
      lastEvent: lastEvent
    });
  } catch (err) {
    console.error(`Failed to sync LC metadata for ${lcId}:`, err.message);
  }
}

module.exports = { startEventListener, syncLCMetadata };
