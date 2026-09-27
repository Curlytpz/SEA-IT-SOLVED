async function runQuizWorkerIteration({ claimNext, processJob, onJobError = () => {} }) {
  const job = await claimNext();
  if (!job) return false;
  try {
    await processJob(job);
  } catch (error) {
    await onJobError(error, job);
  }
  return true;
}

module.exports = { runQuizWorkerIteration };
