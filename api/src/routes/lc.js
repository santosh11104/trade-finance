const express = require('express');
const router = express.Router();
const fabricClient = require('../fabricClient');
const { permit } = require('../auth');
const db = require('../db');

/**
 * @openapi
 * tags:
 *   name: LC
 *   description: Letter of Credit lifecycle management
 */

/**
 * @openapi
 * /lc/create:
 *   post:
 *     summary: Create a new LC
 *     tags: [LC]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id, importer, exporter, issuingBank, advisingBank, amount, currency, expiry, terms]
 *             properties:
 *               id: { type: string, example: LC1001 }
 *               importer: { type: string, example: ImporterA }
 *               exporter: { type: string, example: ExporterB }
 *               issuingBank: { type: string, example: BankC }
 *               advisingBank: { type: string, example: BankD }
 *               amount: { type: number, example: 95000 }
 *               currency: { type: string, example: USD }
 *               expiry: { type: string, example: "2026-12-31" }
 *               terms: { type: string, example: "Shipment within 30 days" }
 *     responses:
 *       200:
 *         description: LC created successfully
 */
router.post('/create', permit('importer', 'admin'), async (req, res) => {
  try {
    const { id, importer, exporter, issuingBank, advisingBank, amount, currency, expiry, terms } = req.body;
    const result = await fabricClient.submitTransaction('createLC', [id, importer, exporter, issuingBank, advisingBank, amount.toString(), currency, expiry, terms], req.user.username);
    res.json({ success: true, payload: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @openapi
 * /lc/issue:
 *   post:
 *     summary: Issue LC (Two-phase)
 *     description: Phase 1 (Importer proposes), Phase 2 (Issuing Bank approves).
 *     tags: [LC]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id, pricingData]
 *             properties:
 *               id: { type: string, example: LC1001 }
 *               pricingData: { type: string, example: "Price: 2% commission" }
 *     responses:
 *       200:
 *         description: LC issue proposed or approved
 */
router.post('/issue', permit('importer', 'bank', 'admin'), async (req, res) => {
  try {
    const { id, pricingData } = req.body;
    const result = await fabricClient.submitTransaction('issueLC', [id, pricingData], req.user.username);
    const message = result.toString ? result.toString() : result;

    if (message.includes('proposed')) {
      res.json({
        success: true,
        phase: 'PROPOSAL',
        status: 'ISSUE_PENDING',
        message: message,
        nextStep: 'Issuing Bank must call /lc/issue with same ID to approve'
      });
    } else {
      res.json({
        success: true,
        phase: 'APPROVAL',
        status: 'ISSUED',
        message: message
      });
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @openapi
 * /lc/advise:
 *   post:
 *     summary: Advise LC
 *     tags: [LC]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id]
 *             properties:
 *               id: { type: string, example: LC1001 }
 *     responses:
 *       200:
 *         description: LC advised successfully
 */
router.post('/advise', permit('bank', 'admin'), async (req, res) => {
  try {
    const { id } = req.body;
    const result = await fabricClient.submitTransaction('adviseLC', [id], req.user.username);
    res.json({ success: true, payload: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @openapi
 * /lc/confirm:
 *   post:
 *     summary: Confirm LC
 *     tags: [LC]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id]
 *             properties:
 *               id: { type: string, example: LC1001 }
 *     responses:
 *       200:
 *         description: LC confirmed successfully
 */
router.post('/confirm', permit('bank', 'admin'), async (req, res) => {
  try {
    const { id } = req.body;
    const result = await fabricClient.submitTransaction('confirmLC', [id], req.user.username);
    res.json({ success: true, payload: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @openapi
 * /lc/ship:
 *   post:
 *     summary: Submit shipment documents
 *     tags: [LC]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id, documentsHash]
 *             properties:
 *               id: { type: string, example: LC1001 }
 *               documentsHash: { type: string, example: "sha256:..." }
 *     responses:
 *       200:
 *         description: Documents submitted successfully
 */
router.post('/ship', permit('exporter', 'admin'), async (req, res) => {
  try {
    const { id, documentsHash } = req.body;
    const result = await fabricClient.submitTransaction('submitDocuments', [id, documentsHash], req.user.username);
    res.json({ success: true, payload: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @openapi
 * /lc/verify:
 *   post:
 *     summary: Verify shipment documents
 *     tags: [LC]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id]
 *             properties:
 *               id: { type: string, example: LC1001 }
 *     responses:
 *       200:
 *         description: Documents verified successfully
 */
router.post('/verify', permit('bank', 'admin'), async (req, res) => {
  try {
    const { id } = req.body;
    const result = await fabricClient.submitTransaction('verifyDocuments', [id], req.user.username);
    res.json({ success: true, payload: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @openapi
 * /lc/pay:
 *   post:
 *     summary: Release payment (Two-phase)
 *     description: Phase 1 (Exporter proposes), Phase 2 (Issuing Bank approves).
 *     tags: [LC]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id, paymentDetails]
 *             properties:
 *               id: { type: string, example: LC1001 }
 *               paymentDetails: { type: string, example: "SWIFT: BANKUS33" }
 *     responses:
 *       200:
 *         description: Payment proposed or approved
 */
router.post('/pay', permit('exporter', 'bank', 'admin'), async (req, res) => {
  try {
    const { id, paymentDetails } = req.body;
    const result = await fabricClient.submitTransaction('releasePayment', [id, paymentDetails], req.user.username);
    const message = result.toString ? result.toString() : result;

    if (message.includes('proposed')) {
      res.json({
        success: true,
        phase: 'PROPOSAL',
        status: 'PAYMENT_PENDING',
        message: message,
        nextStep: 'Issuing Bank must call /lc/pay with same ID to approve and release payment'
      });
    } else {
      res.json({
        success: true,
        phase: 'APPROVAL',
        status: 'PAID',
        message: message
      });
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @openapi
 * /lc/amend:
 *   post:
 *     summary: Amend LC
 *     tags: [LC]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id, amendmentNote]
 *             properties:
 *               id: { type: string, example: LC1001 }
 *               amendmentNote: { type: string, example: "Extend expiry" }
 *     responses:
 *       200:
 *         description: LC amended successfully
 */
router.post('/amend', permit('importer', 'bank', 'admin'), async (req, res) => {
  try {
    const { id, amendmentNote } = req.body;
    const result = await fabricClient.submitTransaction('amendLC', [id, amendmentNote], req.user.username);
    res.json({ success: true, payload: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @openapi
 * /lc/cancel:
 *   post:
 *     summary: Cancel LC
 *     tags: [LC]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id]
 *             properties:
 *               id: { type: string, example: LC1001 }
 *     responses:
 *       200:
 *         description: LC cancelled successfully
 */
router.post('/cancel', permit('importer', 'bank', 'admin'), async (req, res) => {
  try {
    const { id } = req.body;
    const result = await fabricClient.submitTransaction('cancelLC', [id], req.user.username);
    res.json({ success: true, payload: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @openapi
 * /lc:
 *   get:
 *     summary: List all LCs
 *     description: Retrieve LCs from off-chain database.
 *     tags: [LC]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: List of LCs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 payload: { type: array, items: { $ref: '#/components/schemas/LC' } }
 */
router.get('/', permit('importer', 'exporter', 'bank', 'admin'), async (req, res) => {
  try {
    const { status } = req.query;
    let query = 'SELECT * FROM lc_metadata';
    const params = [];
    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }
    query += ' ORDER BY updated_at DESC';
    const result = await db.query(query, params);
    res.json({ success: true, payload: result.rows });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @openapi
 * /lc/{id}:
 *   get:
 *     summary: Get LC details
 *     tags: [LC]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: LC details from ledger
 */
router.get('/:id', permit('importer', 'exporter', 'bank', 'admin'), async (req, res) => {
  try {
    const result = await fabricClient.evaluateTransaction('queryLC', [req.params.id], req.user.username);
    res.json({ success: true, payload: JSON.parse(result) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @openapi
 * /lc/{id}/history:
 *   get:
 *     summary: Get LC history
 *     tags: [LC]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: LC history from ledger
 */
router.get('/:id/history', permit('importer', 'exporter', 'bank', 'admin'), async (req, res) => {
  try {
    const result = await fabricClient.evaluateTransaction('getLCStatusHistory', [req.params.id], req.user.username);
    res.json({ success: true, payload: JSON.parse(result) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
