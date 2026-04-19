const LCService = require('../services/lcService');

const LCController = {
  async createLC(req, res) {
    try {
      const result = await LCService.createLetterOfCredit(req.body, req.user);
      res.json({ success: true, payload: result });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async issueLC(req, res) {
    try {
      const { id, pricingData } = req.body;
      const result = await LCService.issueLetterOfCredit(id, pricingData, req.user);

      if (result.isProposal) {
        res.json({
          success: true,
          phase: 'PROPOSAL',
          status: result.status,
          message: result.message,
          nextStep: 'Issuing Bank must call /lc/issue with same ID to approve'
        });
      } else {
        res.json({
          success: true,
          phase: 'APPROVAL',
          status: result.status,
          message: result.message
        });
      }
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async adviseLC(req, res) {
    try {
      const result = await LCService.adviseLetterOfCredit(req.params.id || req.body.id, req.user);
      res.json({ success: true, payload: result });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async confirmLC(req, res) {
    try {
      const result = await LCService.confirmLetterOfCredit(req.params.id || req.body.id, req.user);
      res.json({ success: true, payload: result });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async shipLC(req, res) {
    try {
      const { id, documentsHash } = req.body;
      const result = await LCService.submitShipmentDocuments(id, documentsHash, req.user);
      res.json({ success: true, payload: result });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async verifyLC(req, res) {
    try {
      const result = await LCService.verifyShipmentDocuments(req.params.id || req.body.id, req.user);
      res.json({ success: true, payload: result });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async payLC(req, res) {
    try {
      const { id, paymentDetails } = req.body;
      const result = await LCService.releasePayment(id, paymentDetails, req.user);

      if (result.isProposal) {
        res.json({
          success: true,
          phase: 'PROPOSAL',
          status: result.status,
          message: result.message,
          nextStep: 'Issuing Bank must call /lc/pay with same ID to approve and release payment'
        });
      } else {
        res.json({
          success: true,
          phase: 'APPROVAL',
          status: result.status,
          message: result.message
        });
      }
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async amendLC(req, res) {
    try {
      const { id, amendmentNote } = req.body;
      const result = await LCService.amendLetterOfCredit(id, amendmentNote, req.user);
      res.json({ success: true, payload: result });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async cancelLC(req, res) {
    try {
      const result = await LCService.cancelLC(req.params.id || req.body.id, req.user);
      res.json({ success: true, payload: result });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async getLCList(req, res) {
    try {
      const { status } = req.query;
      const result = await LCService.getLCList({ status });
      res.json({ success: true, payload: result });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async getLCDetails(req, res) {
    try {
      const result = await LCService.getLCDetails(req.params.id, req.user);
      res.json({ success: true, payload: result });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async getLCHistory(req, res) {
    try {
      const result = await LCService.getLCStatusHistory(req.params.id, req.user);
      res.json({ success: true, payload: result });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
};

module.exports = LCController;
