const router = require('express').Router();
const ctrl   = require('../controllers/section.controller');
const authenticate = require('../middleware/authenticate');
const { authorize, authorizeActive } = require('../middleware/authorize');

// Static paths before /:id wildcards
router.get('/student/sections', authenticate, authorize('STUDENT'),         ctrl.getStudentSections);
router.post('/join-code/preview', authenticate, authorize('STUDENT'),       ctrl.previewJoinByCode);
router.post('/join-code',       authenticate, authorize('STUDENT'),         ctrl.joinByCode);
router.get('/instructor/sections', authenticate, authorizeActive('INSTRUCTOR'), ctrl.getInstructorSections);
router.get('/instructor/teaching-workspace', authenticate, authorizeActive('INSTRUCTOR'), ctrl.getTeachingWorkspace);
router.post('/instructor/folders', authenticate, authorizeActive('INSTRUCTOR'), ctrl.createTeachingFolder);
router.patch('/instructor/folders/reorder', authenticate, authorizeActive('INSTRUCTOR'), ctrl.reorderTeachingFolders);
router.patch('/instructor/folders/:folderId', authenticate, authorizeActive('INSTRUCTOR'), ctrl.renameTeachingFolder);
router.patch('/instructor/folders/:folderId/archive', authenticate, authorizeActive('INSTRUCTOR'), ctrl.setTeachingFolderArchived);
router.delete('/instructor/folders/:folderId', authenticate, authorizeActive('INSTRUCTOR'), ctrl.deleteTeachingFolder);
router.patch('/:sectionId/folder', authenticate, authorizeActive('INSTRUCTOR'), ctrl.moveSectionToFolder);
router.post('/',                   authenticate, authorizeActive('INSTRUCTOR'), ctrl.createSection);

// /:id routes
router.get('/:id',               authenticate, authorizeActive('INSTRUCTOR', 'ADMIN'), ctrl.getSectionById);
router.get('/:id/join-requests', authenticate, authorizeActive('INSTRUCTOR'),          ctrl.getJoinRequests);
router.get('/:id/students',      authenticate, authorizeActive('INSTRUCTOR'),          ctrl.getEnrolledStudents);

// Student management
router.delete('/:sectionId/students/:studentId', authenticate, authorizeActive('INSTRUCTOR'), ctrl.removeStudent);
router.post('/:sectionId/students',              authenticate, authorizeActive('INSTRUCTOR'), ctrl.manuallyAddStudent);

// Delete section
router.delete('/:sectionId', authenticate, authorizeActive('INSTRUCTOR'), ctrl.deleteSection);

const enrollRouter = require('express').Router();
enrollRouter.patch('/:id/approve', authenticate, authorizeActive('INSTRUCTOR'), ctrl.approveEnrollment);
enrollRouter.patch('/:id/reject',  authenticate, authorizeActive('INSTRUCTOR'), ctrl.rejectEnrollment);

module.exports = { sectionRouter: router, enrollRouter };
