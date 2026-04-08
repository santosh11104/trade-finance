const express = require('express');
const router = express.Router();
const fabricClient = require('../fabricClient');
const { permit } = require('../auth');
const db = require('../db');

router.post('/create', permit('importer', 'admin'), async (req, res) => {
  try {
    const { id, importer, exporter, issuingBank, advisingBank, amount, currency, expiry, terms } = req.body;
    const result = await fabricClient.submitTransaction('createLC', [id, importer, exporter, issuingBank, advisingBank, amount.toString(), currency, expiry, terms]);
    res.json({ success: true, payload: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Issue LC - two-phase approval flow
// Phase 1: Importer proposes (creates ISSUE_PENDING status)
// Phase 2: Issuing Bank approves (transitions to ISSUED status)
router.post('/issue', permit('importer', 'bank', 'admin'), async (req, res) => {
  try {
    const { id, pricingData } = req.body;
    const result = await fabricClient.submitTransaction('issueLC', [id, pricingData]);
    const message = result.toString ? result.toString() : result;

    // Check if this was a proposal or approval
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

router.post('/advise', permit('bank', 'admin'), async (req, res) => {
  try {
    const { id } = req.body;
    const result = await fabricClient.submitTransaction('adviseLC', [id]);
    res.json({ success: true, payload: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/confirm', permit('bank', 'admin'), async (req, res) => {
  try {
    const { id } = req.body;
    const result = await fabricClient.submitTransaction('confirmLC', [id]);
    res.json({ success: true, payload: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/ship', permit('exporter', 'admin'), async (req, res) => {
  try {
    const { id, documentsHash } = req.body;
    const result = await fabricClient.submitTransaction('submitDocuments', [id, documentsHash]);
    res.json({ success: true, payload: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/verify', permit('bank', 'admin'), async (req, res) => {
  try {
    const { id } = req.body;
    const result = await fabricClient.submitTransaction('verifyDocuments', [id]);
    res.json({ success: true, payload: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Release Payment - two-phase approval flow
// Phase 1: Exporter proposes payment (creates PAYMENT_PENDING status)
// Phase 2: Issuing Bank approves payment (transitions to PAID status)
router.post('/pay', permit('exporter', 'bank', 'admin'), async (req, res) => {
  try {
    const { id, paymentDetails } = req.body;
    const result = await fabricClient.submitTransaction('releasePayment', [id, paymentDetails]);
    const message = result.toString ? result.toString() : result;

    // Check if this was a proposal or approval
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

router.post('/amend', permit('importer', 'bank', 'admin'), async (req, res) => {
  try {
    const { id, amendmentNote } = req.body;
    const result = await fabricClient.submitTransaction('amendLC', [id, amendmentNote]);
    res.json({ success: true, payload: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/cancel', permit('importer', 'bank', 'admin'), async (req, res) => {
  try {
    const { id } = req.body;
    const result = await fabricClient.submitTransaction('cancelLC', [id]);
    res.json({ success: true, payload: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// List all LCs from off-chain database (fast query)
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

router.get('/:id', permit('importer', 'exporter', 'bank', 'admin'), async (req, res) => {
  try {
    const result = await fabricClient.evaluateTransaction('queryLC', [req.params.id]);
    res.json({ success: true, payload: JSON.parse(result) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/history', permit('importer', 'exporter', 'bank', 'admin'), async (req, res) => {
  try {
    const result = await fabricClient.evaluateTransaction('getLCStatusHistory', [req.params.id]);
    res.json({ success: true, payload: JSON.parse(result) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
