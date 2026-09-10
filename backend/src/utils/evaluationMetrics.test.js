const assert=require('node:assert/strict');const metrics=require('./evaluationMetrics');
assert.equal(metrics.characterErrorRate('cat','cut'),1/3);
assert.equal(metrics.wordErrorRate('one two','one too'),1/2);
assert.deepEqual(metrics.equationExactMatch(['x','y'],['x','z']),{correct:1,total:2,percentage:50});
assert.equal(metrics.normalizedEditSimilarity('abc','abc'),100);
assert.equal(metrics.timestampMeanAbsoluteError([100,300],[110,280]),15);
console.log('Evaluation metric utility tests passed.');
