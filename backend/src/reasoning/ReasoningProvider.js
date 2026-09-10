class ReasoningProvider {
  async generateMaterials() { throw new Error('generateMaterials must be implemented.'); }
  async generateQuiz() { throw new Error('generateQuiz must be implemented.'); }
}
module.exports = ReasoningProvider;
