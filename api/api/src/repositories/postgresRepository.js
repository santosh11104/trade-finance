const { db } = require('../db');

const PostgresRepository = {
  // User Operations
  async findUserByUsername(username) {
    return db.oneOrNone('SELECT username, password_hash, role, org_msp FROM users WHERE username=$1', [username]);
  },

  async createUser(user) {
    return db.one(
      'INSERT INTO users (username, password_hash, role, org_msp) VALUES ($1, $2, $3, $4) RETURNING username, role, org_msp',
      [user.username, user.passwordHash, user.role, user.orgMsp]
    );
  },

  // LC Metadata Operations
  async listLCs(filters = {}) {
    let query = 'SELECT * FROM lc_metadata';
    const params = [];

    if (filters.status) {
      query += ' WHERE status = $1';
      params.push(filters.status);
    }

    query += ' ORDER BY updated_at DESC';
    return db.any(query, params);
  },

  async updateLCMetadata(id, data) {
    // Update multiple fields dynamically
    const fields = Object.keys(data);
    const values = Object.values(data);
    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');

    return db.none(
      `UPDATE lc_metadata SET ${setClause}, updated_at = now() WHERE id = $${fields.length + 1}`,
      [...values, id]
    );
  },

  async upsertLCMetadata(lc) {
    // Use ON CONFLICT for mirroring Fabric state
    return db.none(
      `INSERT INTO lc_metadata (id, importer, exporter, issuing_bank, advising_bank, amount, currency, status, created_at, updated_at, last_event)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at,
         last_event = EXCLUDED.last_event`,
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
        lc.lastEvent
      ]
    );
  },

  async createAuditLog(log) {
    return db.none(
      'INSERT INTO audit_logs (lc_id, event_type, event_payload, source) VALUES ($1, $2, $3, $4)',
      [log.lcId, log.eventType, log.payload, log.source]
    );
  }
};

module.exports = PostgresRepository;
