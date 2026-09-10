class LessonChatProvider {
  async reply() { throw new Error('reply must be implemented.'); }
  async edit() { throw new Error('edit must be implemented.'); }
  async editDocument() { throw new Error('editDocument must be implemented.'); }
  async editQuiz() { throw new Error('editQuiz must be implemented.'); }
}

module.exports = LessonChatProvider;
