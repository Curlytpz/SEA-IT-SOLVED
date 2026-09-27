const asyncHandler = require('../utils/asyncHandler');
const audioService = require('../services/audio-recording.service');
const { removeTemporaryAudio } = require('../utils/audioFile');

const createRecording = asyncHandler(async (req, res) => {
  try {
    const recording = await audioService.createRecording(req.params.lessonId, req.user.id, req.file, req.body);
    res.status(201).json({ success:true, data:{ recording } });
  } finally {
    await removeTemporaryAudio(req.file);
  }
});

const getLessonRecording = asyncHandler(async (req, res) => {
  const recording = await audioService.getLessonRecording(req.params.lessonId, req.user.id);
  res.json({ success:true, data:{ recording } });
});

const getSectionRecordings = asyncHandler(async (req, res) => {
  const recordings = await audioService.getSectionRecordings(req.params.sectionId, req.user.id);
  res.json({ success:true, data:{ recordings } });
});

const getRecordingAudio = asyncHandler(async (req, res) => {
  let file;
  try {
    file = await audioService.getRecordingFile(req.params.recordingId, req.user.id, req.headers.range);
  } catch (error) {
    if (error?.code === 'RANGE_NOT_SATISFIABLE') {
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Range', `bytes */${error.size}`);
      return res.status(416).end();
    }
    throw error;
  }
  res.setHeader('Content-Type', file.mime);
  res.setHeader('X-Audio-Duration-Ms', file.durationMs);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', file.range?.length ?? file.size);
  if (file.range) {
    res.status(206);
    res.setHeader('Content-Range', `bytes ${file.range.start}-${file.range.end}/${file.size}`);
  }
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('Content-Disposition', 'inline');
  file.stream.on('error', error => res.destroy(error));
  file.stream.pipe(res);
});

const deleteRecording = asyncHandler(async (req, res) => {
  await audioService.deleteRecording(req.params.recordingId, req.user.id);
  res.json({ success:true, data:{ message:'Audio recording deleted.' } });
});

module.exports = { createRecording, getLessonRecording, getSectionRecordings, getRecordingAudio, deleteRecording };
