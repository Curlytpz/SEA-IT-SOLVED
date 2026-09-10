const router = require('express').Router();
const controller = require('../controllers/hardware.controller');
const authenticate = require('../middleware/authenticate');
const { authorizeActive } = require('../middleware/authorize');

const guard = [authenticate, authorizeActive('INSTRUCTOR')];

router.get('/settings', ...guard, controller.getSettings);
router.patch('/settings', ...guard, controller.updateSettings);
router.get('/camera/calibrations', ...guard, controller.getCalibrations);
router.get('/camera/calibrations/:sourceKey', ...guard, controller.getCalibration);
router.put('/camera/calibrations', ...guard, controller.saveCalibration);
router.delete('/camera/calibrations/:calibrationId', ...guard, controller.deleteCalibration);

module.exports = router;
