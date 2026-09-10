const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/solution-activity.service');

const listInstructor = asyncHandler(async (req, res) => res.json({ success: true, data: { activities: await service.listInstructor(req.params.lessonId, req.user.id) } }));
const create = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: { activity: await service.createActivity(req.params.lessonId, req.user.id, req.body) } }));
const update = asyncHandler(async (req, res) => res.json({ success: true, data: { activity: await service.updateActivity(req.params.activityId, req.user.id, req.body) } }));
const publish = asyncHandler(async (req, res) => res.json({ success: true, data: { activity: await service.setActivityStatus(req.params.activityId, req.user.id, 'publish') } }));
const close = asyncHandler(async (req, res) => res.json({ success: true, data: { activity: await service.setActivityStatus(req.params.activityId, req.user.id, 'close') } }));
const reopen = asyncHandler(async (req, res) => res.json({ success: true, data: { activity: await service.setActivityStatus(req.params.activityId, req.user.id, 'reopen') } }));
const remove = asyncHandler(async (req, res) => { await service.deleteActivity(req.params.activityId, req.user.id); res.json({ success: true }); });
const listStudent = asyncHandler(async (req, res) => res.json({ success: true, data: { activities: await service.listStudent(req.params.lessonId, req.user.id) } }));
const submit = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: { submission: await service.submitSolution(req.params.activityId, req.user.id, req.file) } }));
const listSubmissions = asyncHandler(async (req, res) => res.json({ success: true, data: { submissions: await service.listSubmissions(req.params.activityId, req.user.id) } }));
const recognize = asyncHandler(async (req, res) => res.json({ success: true, data: { submission: await service.retryRecognition(req.params.submissionId, req.user.id) } }));
const analyze = asyncHandler(async (req, res) => res.json({ success: true, data: { submission: await service.analyzeSubmission(req.params.submissionId, req.user.id) } }));
const grade = asyncHandler(async (req, res) => res.json({ success: true, data: { submission: await service.gradeSubmission(req.params.submissionId, req.user.id, req.body) } }));
const reopenSubmission = asyncHandler(async (req, res) => res.json({ success: true, data: { submission: await service.reopenSubmission(req.params.submissionId, req.user.id) } }));
const image = asyncHandler(async (req, res) => {
  const file = await service.submissionImage(req.params.submissionId, req.user);
  res.set({ 'Content-Type': file.mime, 'Content-Length': file.size, 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' });
  file.stream.on('error', error => res.destroy(error));
  file.stream.pipe(res);
});

module.exports = { listInstructor, create, update, publish, close, reopen, remove, listStudent, submit, listSubmissions, recognize, analyze, grade, reopenSubmission, image };
