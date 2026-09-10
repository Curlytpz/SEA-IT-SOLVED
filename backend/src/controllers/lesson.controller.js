const asyncHandler  = require('../utils/asyncHandler');
const lessonService = require('../services/lesson.service');

const createLesson = asyncHandler(async (req, res) => {
  const { title, topic } = req.body;
  const lesson = await lessonService.createLesson({
    sectionId: req.params.sectionId, instructorId: req.user.id, title, topic,
  });
  res.status(201).json({ success: true, data: { lesson } });
});

const getLessons = asyncHandler(async (req, res) => {
  const lessons = await lessonService.getLessons(req.params.sectionId, req.user.id);
  res.json({ success: true, data: { lessons } });
});

const getLessonById = asyncHandler(async (req, res) => {
  const lesson = await lessonService.getLessonById(req.params.lessonId, req.user.id);
  res.json({ success: true, data: { lesson } });
});

const updateLesson = asyncHandler(async (req, res) => {
  const lesson = await lessonService.updateLesson(req.params.lessonId, req.user.id, req.body);
  res.json({ success: true, data: { lesson } });
});

const deleteLesson = asyncHandler(async (req, res) => {
  const result = await lessonService.deleteLesson(req.params.lessonId, req.user.id);
  res.json({ success: true, data: result });
});

const startLesson  = asyncHandler(async (req, res) => {
  const lesson = await lessonService.startLesson(req.params.lessonId, req.user.id);
  res.json({ success: true, data: { lesson } });
});

const pauseLesson  = asyncHandler(async (req, res) => {
  const lesson = await lessonService.pauseLesson(req.params.lessonId, req.user.id);
  res.json({ success: true, data: { lesson } });
});

const resumeLesson = asyncHandler(async (req, res) => {
  const lesson = await lessonService.resumeLesson(req.params.lessonId, req.user.id);
  res.json({ success: true, data: { lesson } });
});

const endLesson    = asyncHandler(async (req, res) => {
  const lesson = await lessonService.endLesson(req.params.lessonId, req.user.id);
  res.json({ success: true, data: { lesson } });
});

module.exports = {
  createLesson,
  getLessons,
  getLessonById,
  updateLesson,
  deleteLesson,
  startLesson,
  pauseLesson,
  resumeLesson,
  endLesson,
};
