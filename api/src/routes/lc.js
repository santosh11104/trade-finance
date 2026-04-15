const express = require('express');
const router = express.Router();
const { permit } = require('../auth');
const LCController = require('../controllers/lcController');

/**
 * @openapi
 * tags:
 *   name: LC
 *   description: Letter of Credit lifecycle management
 */

router.post('/create', permit('importer', 'admin'), LCController.createLC);
router.post('/issue', permit('importer', 'bank', 'admin'), LCController.issueLC);
router.post('/advise', permit('bank', 'admin'), LCController.adviseLC);
router.post('/confirm', permit('bank', 'admin'), LCController.confirmLC);
router.post('/ship', permit('exporter', 'admin'), LCController.shipLC);
router.post('/verify', permit('bank', 'admin'), LCController.verifyLC);
router.post('/pay', permit('exporter', 'bank', 'admin'), LCController.payLC);
router.post('/amend', permit('importer', 'bank', 'admin'), LCController.amendLC);
router.post('/cancel', permit('importer', 'bank', 'admin'), LCController.cancelLC);

router.get('/', permit('importer', 'exporter', 'bank', 'admin'), LCController.getLCList);
router.get('/:id', permit('importer', 'exporter', 'bank', 'admin'), LCController.getLCDetails);
router.get('/:id/history', permit('importer', 'exporter', 'bank', 'admin'), LCController.getLCHistory);

module.exports = router;
