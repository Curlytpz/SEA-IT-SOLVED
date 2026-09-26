const path = require('path');
const LocalStorageAdapter = require('./LocalStorageAdapter');
const { CAPTURE_STORAGE_PATH, AUDIO_STORAGE_PATH, LESSON_MATERIAL_STORAGE_PATH, SOLUTION_SUBMISSION_STORAGE_PATH } = require('../config/env');

const captureStorage = new LocalStorageAdapter(
  CAPTURE_STORAGE_PATH || path.resolve(__dirname, '../../storage/captures')
);
const audioStorage = new LocalStorageAdapter(
  AUDIO_STORAGE_PATH || path.resolve(__dirname, '../../storage/audio')
);
const lessonMaterialStorage = new LocalStorageAdapter(
  LESSON_MATERIAL_STORAGE_PATH || path.resolve(__dirname, '../../storage/lesson-materials')
);
const solutionSubmissionStorage = new LocalStorageAdapter(
  SOLUTION_SUBMISSION_STORAGE_PATH || path.resolve(__dirname, '../../storage/solution-submissions')
);

module.exports = { captureStorage, audioStorage, lessonMaterialStorage, solutionSubmissionStorage };
