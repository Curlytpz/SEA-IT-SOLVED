const express = require('express');
const router = express.Router();

const adminCtrl = require('../controllers/admin.controller');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

router.use(authenticate, authorize('ADMIN'));

router.get('/instructors/pending', adminCtrl.getPendingInstructors);

router.patch('/instructors/:id/approve', adminCtrl.approveInstructor);
router.patch('/instructors/:id/reject', adminCtrl.rejectInstructor);

router.get('/users', adminCtrl.getAllUsers);

router.patch('/users/:id/status', adminCtrl.setUserStatus);

router.delete('/users/:id/force', adminCtrl.forceDeleteInstructor);

router.delete('/users/:id', adminCtrl.deleteUser);

module.exports = router;