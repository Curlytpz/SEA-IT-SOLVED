const test=require('node:test');
const assert=require('node:assert/strict');
const {extractGeminiResponseText}=require('./GeminiResponse');

test('extracts valid candidate text and safe finish metadata',()=>{
  const result=extractGeminiResponseText({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"pages":[]}'}]}}],usageMetadata:{candidatesTokenCount:12}});
  assert.equal(result.text,'{"pages":[]}');
  assert.equal(result.metadata.finishReason,'STOP');
  assert.equal(result.metadata.outputTokenCount,12);
});

test('zero candidates, empty parts, and empty text are distinct',()=>{
  assert.throws(()=>extractGeminiResponseText({candidates:[]}),error=>error.code==='PROVIDER_NO_CANDIDATES');
  assert.throws(()=>extractGeminiResponseText({candidates:[{finishReason:'STOP',content:{parts:[]}}]}),error=>error.code==='PROVIDER_EMPTY_PARTS');
  assert.throws(()=>extractGeminiResponseText({candidates:[{finishReason:'STOP',content:{parts:[{text:'   '} ]}}]}),error=>error.code==='PROVIDER_TEXT_EMPTY');
});

test('blocked and MAX_TOKENS responses remain distinct from malformed JSON',()=>{
  assert.throws(()=>extractGeminiResponseText({candidates:[],promptFeedback:{blockReason:'SAFETY'}}),error=>error.code==='PROVIDER_BLOCKED');
  assert.throws(()=>extractGeminiResponseText({candidates:[{finishReason:'SAFETY',content:{parts:[]}}]}),error=>error.code==='PROVIDER_BLOCKED');
  assert.throws(()=>extractGeminiResponseText({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{"partial":'}]}}],usageMetadata:{candidatesTokenCount:8192}}),error=>{
    assert.equal(error.code,'PROVIDER_OUTPUT_TRUNCATED');
    assert.equal(error.recognitionResponse.finishReason,'MAX_TOKENS');
    assert.equal(error.recognitionResponse.outputTokenCount,8192);
    return true;
  });
});
