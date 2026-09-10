const asyncHandler   = require('../utils/asyncHandler');
const sectionService = require('../services/section.service');

const createSection = asyncHandler(async (req, res) => {
  const { subjectId, sectionName, folderId } = req.body;
  const section = await sectionService.createSection({ subjectId, sectionName, folderId, instructorId: req.user.id });
  res.status(201).json({ success: true, data: { section } });
});

const deleteSection = asyncHandler(async (req, res) => {
  await sectionService.deleteSection(req.params.sectionId, req.user.id);
  res.json({ success: true, data: { message: 'Section deleted successfully.' } });
});

const getInstructorSections = asyncHandler(async (req, res) => {
  const sections = await sectionService.getInstructorSections(req.user.id);
  res.json({ success: true, data: { sections } });
});

const getTeachingWorkspace = asyncHandler(async (req, res) => {
  const workspace = await sectionService.getTeachingWorkspace(req.user.id);
  res.json({ success: true, data: workspace });
});

const createTeachingFolder = asyncHandler(async (req, res) => {
  const folder = await sectionService.createTeachingFolder(req.user.id, req.body.name);
  res.status(201).json({ success: true, data: { folder } });
});

const renameTeachingFolder = asyncHandler(async (req, res) => {
  const folder = await sectionService.renameTeachingFolder(req.params.folderId, req.user.id, req.body.name);
  res.json({ success: true, data: { folder } });
});

const reorderTeachingFolders = asyncHandler(async (req, res) => {
  await sectionService.reorderTeachingFolders(req.user.id, req.body.folderIds);
  res.json({ success: true, data: { message: 'Folder order updated.' } });
});

const setTeachingFolderArchived = asyncHandler(async (req, res) => {
  const folder = await sectionService.setTeachingFolderArchived(req.params.folderId, req.user.id, req.body.archived);
  res.json({ success: true, data: { folder } });
});

const deleteTeachingFolder = asyncHandler(async (req, res) => {
  await sectionService.deleteTeachingFolder(req.params.folderId, req.user.id);
  res.json({ success: true, data: { message: 'Folder deleted. Its sections are now Unorganized.' } });
});

const moveSectionToFolder = asyncHandler(async (req, res) => {
  const assignment = await sectionService.moveSectionToFolder(req.params.sectionId, req.user.id, req.body.folderId || null);
  res.json({ success: true, data: { assignment } });
});
const getSectionById = asyncHandler(async (req, res) => {
  const section = await sectionService.getSectionById(req.params.id);
  if (req.user.role === 'INSTRUCTOR' && section.instructorId !== req.user.id)
    return res.status(403).json({ success: false, error: 'Access denied.' });
  res.json({ success: true, data: { section } });
});

const getJoinRequests = asyncHandler(async (req, res) => {
  const requests = await sectionService.getJoinRequests(req.params.id, req.user.id);
  res.json({ success: true, data: { requests } });
});

const approveEnrollment = asyncHandler(async (req, res) => {
  const enrollment = await sectionService.approveEnrollment(req.params.id, req.user.id);
  res.json({ success: true, data: { enrollment } });
});

const rejectEnrollment = asyncHandler(async (req, res) => {
  const enrollment = await sectionService.rejectEnrollment(req.params.id, req.user.id);
  res.json({ success: true, data: { enrollment } });
});

const getEnrolledStudents = asyncHandler(async (req, res) => {
  const students = await sectionService.getEnrolledStudents(req.params.id, req.user.id);
  res.json({ success: true, data: { students } });
});

const removeStudent = asyncHandler(async (req, res) => {
  await sectionService.removeStudent(req.params.sectionId, req.params.studentId, req.user.id);
  res.json({ success: true, data: { message: 'Student removed from section.' } });
});

const manuallyAddStudent = asyncHandler(async (req, res) => {
  const { studentNumber } = req.body;
  const enrollment = await sectionService.manuallyAddStudent(req.params.sectionId, studentNumber, req.user.id);
  res.status(201).json({ success: true, data: { enrollment } });
});

const searchSections = asyncHandler(async (req, res) => {
  const sections = await sectionService.searchSections(req.query.q);
  res.json({ success: true, data: { sections } });
});

const requestJoin = asyncHandler(async (req, res) => {
  const enrollment = await sectionService.requestJoin(req.params.id, req.user.id);
  res.status(201).json({ success: true, data: { enrollment } });
});

const joinByCode = asyncHandler(async (req, res) => {
  const { joinCode } = req.body;
  const enrollment = await sectionService.joinByCode(joinCode, req.user.id);
  res.status(201).json({ success: true, data: { enrollment } });
});

const previewJoinByCode = asyncHandler(async (req, res) => {
  const { joinCode } = req.body;
  const section = await sectionService.previewJoinByCode(joinCode, req.user.id);
  res.json({ success: true, data: { section } });
});

const getStudentSections = asyncHandler(async (req, res) => {
  const sections = await sectionService.getStudentSections(req.user.id);
  res.json({ success: true, data: { sections } });
});

const getSubjects = asyncHandler(async (req, res) => {
  const subjects = await sectionService.getSubjects();
  res.json({ success: true, data: { subjects } });
});

module.exports = {
  createSection, deleteSection, getInstructorSections, getTeachingWorkspace, getSectionById,
  createTeachingFolder, renameTeachingFolder, reorderTeachingFolders,
  setTeachingFolderArchived, deleteTeachingFolder, moveSectionToFolder,
  getJoinRequests, approveEnrollment, rejectEnrollment, getEnrolledStudents,
  removeStudent, manuallyAddStudent, searchSections, requestJoin, previewJoinByCode, joinByCode,
  getStudentSections, getSubjects,
};
