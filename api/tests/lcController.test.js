const request = require('supertest');
const express = require('express');
const bodyParser = require('body-parser');
const LCController = require('../src/controllers/lcController');
const LCService = require('../src/services/lcService');

// Setup mock app
const app = express();
app.use(bodyParser.json());
// Mock user middleware
app.use((req, res, next) => {
  req.user = { username: 'testuser', role: 'importer' };
  next();
});

app.post('/lc/create', LCController.createLC);
app.post('/lc/issue', LCController.issueLC);
app.post('/lc/advise/:id', LCController.adviseLC);
app.post('/lc/confirm/:id', LCController.confirmLC);
app.post('/lc/ship', LCController.shipLC);
app.post('/lc/verify/:id', LCController.verifyLC);
app.post('/lc/pay', LCController.payLC);
app.post('/lc/amend', LCController.amendLC);
app.post('/lc/cancel/:id', LCController.cancelLC);
app.get('/lc', LCController.getLCList);
app.get('/lc/:id', LCController.getLCDetails);
app.get('/lc/:id/history', LCController.getLCHistory);

jest.mock('../src/services/lcService');

describe('LCController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /lc/create', () => {
    it('should return 200 on successful creation', async () => {
      LCService.createLetterOfCredit.mockResolvedValue({ id: 'LC123' });
      
      const response = await request(app)
        .post('/lc/create')
        .send({ id: 'LC123', amount: 100 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.payload).toEqual({ id: 'LC123' });
    });

    it('should return 400 on service error', async () => {
      LCService.createLetterOfCredit.mockRejectedValue(new Error('Validation Failed'));

      const response = await request(app)
        .post('/lc/create')
        .send({ id: 'LC123' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation Failed');
    });
  });

  describe('POST /lc/issue', () => {
    it('should return 200 and phase APPROVAL when not a proposal', async () => {
      LCService.issueLetterOfCredit.mockResolvedValue({ isProposal: false, status: 'ISSUED', message: 'Ok' });
      const response = await request(app).post('/lc/issue').send({ id: 'LC1', pricingData: {} });
      expect(response.status).toBe(200);
      expect(response.body.phase).toBe('APPROVAL');
    });

    it('should return 200 and phase PROPOSAL when it is a proposal', async () => {
        LCService.issueLetterOfCredit.mockResolvedValue({ isProposal: true, status: 'ISSUE_PENDING', message: 'proposed' });
        const response = await request(app).post('/lc/issue').send({ id: 'LC1', pricingData: {} });
        expect(response.status).toBe(200);
        expect(response.body.phase).toBe('PROPOSAL');
    });

    it('should return 400 on error', async () => {
      LCService.issueLetterOfCredit.mockRejectedValue(new Error('error'));
      const response = await request(app).post('/lc/issue').send({ id: 'LC1' });
      expect(response.status).toBe(400);
    });
  });

  describe('POST /lc/advise/:id', () => {
    it('should successfully advise LC', async () => {
      LCService.adviseLetterOfCredit.mockResolvedValue('ok');
      const response = await request(app).post('/lc/advise/LC1');
      expect(response.status).toBe(200);
    });

    it('should return 400 on error', async () => {
      LCService.adviseLetterOfCredit.mockRejectedValue(new Error('error'));
      const response = await request(app).post('/lc/advise/LC1');
      expect(response.status).toBe(400);
    });
  });

  describe('POST /lc/confirm/:id', () => {
    it('should successfully confirm LC', async () => {
      LCService.confirmLetterOfCredit.mockResolvedValue('ok');
      const response = await request(app).post('/lc/confirm/LC1');
      expect(response.status).toBe(200);
    });

    it('should return 400 on error', async () => {
      LCService.confirmLetterOfCredit.mockRejectedValue(new Error('error'));
      const response = await request(app).post('/lc/confirm/LC1');
      expect(response.status).toBe(400);
    });
  });

  describe('POST /lc/ship', () => {
    it('should successfully submit documents', async () => {
      LCService.submitShipmentDocuments.mockResolvedValue({ status: 'SHIPPED' });

      const response = await request(app)
        .post('/lc/ship')
        .send({ id: 'LC123', documentsHash: 'a'.repeat(64) });

      expect(response.status).toBe(200);
      expect(response.body.payload.status).toBe('SHIPPED');
    });

    it('should return 400 on error', async () => {
      LCService.submitShipmentDocuments.mockRejectedValue(new Error('error'));
      const response = await request(app).post('/lc/ship').send({ id: 'LC1' });
      expect(response.status).toBe(400);
    });
  });

  describe('POST /lc/verify/:id', () => {
    it('should successfully verify documents', async () => {
      LCService.verifyShipmentDocuments.mockResolvedValue('ok');
      const response = await request(app).post('/lc/verify/LC1');
      expect(response.status).toBe(200);
    });

    it('should return 400 on error', async () => {
      LCService.verifyShipmentDocuments.mockRejectedValue(new Error('error'));
      const response = await request(app).post('/lc/verify/LC1');
      expect(response.status).toBe(400);
    });
  });

  describe('POST /lc/pay', () => {
    it('should return 200 and phase APPROVAL when paid', async () => {
      LCService.releasePayment.mockResolvedValue({ isProposal: false, status: 'PAID', message: 'Ok' });
      const response = await request(app).post('/lc/pay').send({ id: 'LC1', paymentDetails: {} });
      expect(response.status).toBe(200);
      expect(response.body.phase).toBe('APPROVAL');
    });

    it('should return 200 and phase PROPOSAL when proposed', async () => {
      LCService.releasePayment.mockResolvedValue({ isProposal: true, status: 'PAYMENT_PENDING', message: 'proposed' });
      const response = await request(app).post('/lc/pay').send({ id: 'LC1', paymentDetails: {} });
      expect(response.status).toBe(200);
      expect(response.body.phase).toBe('PROPOSAL');
    });

    it('should return 400 on error', async () => {
      LCService.releasePayment.mockRejectedValue(new Error('error'));
      const response = await request(app).post('/lc/pay').send({ id: 'LC1' });
      expect(response.status).toBe(400);
    });
  });

  describe('POST /lc/amend', () => {
    it('should successfully amend LC', async () => {
      LCService.amendLetterOfCredit.mockResolvedValue('ok');
      const response = await request(app).post('/lc/amend').send({ id: 'LC1', amendmentNote: 'note' });
      expect(response.status).toBe(200);
    });

    it('should return 400 on error', async () => {
      LCService.amendLetterOfCredit.mockRejectedValue(new Error('error'));
      const response = await request(app).post('/lc/amend').send({ id: 'LC1' });
      expect(response.status).toBe(400);
    });
  });

  describe('POST /lc/cancel/:id', () => {
    it('should successfully cancel LC', async () => {
      LCService.cancelLetterOfCredit.mockResolvedValue('ok');
      const response = await request(app).post('/lc/cancel/LC1');
      expect(response.status).toBe(200);
    });

    it('should return 400 on error', async () => {
      LCService.cancelLetterOfCredit.mockRejectedValue(new Error('error'));
      const response = await request(app).post('/lc/cancel/LC1');
      expect(response.status).toBe(400);
    });
  });

  describe('GET /lc', () => {
    it('should return LC list', async () => {
      LCService.getLCList.mockResolvedValue([{ id: 'LC1' }]);
      const response = await request(app).get('/lc?status=ISSUED');
      expect(response.status).toBe(200);
      expect(response.body.payload).toHaveLength(1);
    });

    it('should return 400 on error', async () => {
      LCService.getLCList.mockRejectedValue(new Error('error'));
      const response = await request(app).get('/lc');
      expect(response.status).toBe(400);
    });
  });

  describe('GET /lc/:id', () => {
    it('should return LC details', async () => {
      LCService.getLCDetails.mockResolvedValue({ id: 'LC1' });
      const response = await request(app).get('/lc/LC1');
      expect(response.status).toBe(200);
      expect(response.body.payload.id).toBe('LC1');
    });

    it('should return 400 on error', async () => {
      LCService.getLCDetails.mockRejectedValue(new Error('error'));
      const response = await request(app).get('/lc/LC1');
      expect(response.status).toBe(400);
    });
  });

  describe('GET /lc/:id/history', () => {
    it('should return LC history', async () => {
      LCService.getLCStatusHistory.mockResolvedValue([{ status: 'CREATED' }]);
      const response = await request(app).get('/lc/LC1/history');
      expect(response.status).toBe(200);
      expect(response.body.payload).toHaveLength(1);
    });

    it('should return 400 on error', async () => {
      LCService.getLCStatusHistory.mockRejectedValue(new Error('error'));
      const response = await request(app).get('/lc/LC1/history');
      expect(response.status).toBe(400);
    });
  });
});
