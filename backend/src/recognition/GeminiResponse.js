const crypto = require('crypto');
const { RecognitionProviderError } = require('./ProviderErrorMapper');

function safeResponseMetadata(response, text = '') {
  const value=String(text||'');
  const candidate=Array.isArray(response?.candidates) ? response.candidates[0] : null;
  return {
    finishReason:String(candidate?.finishReason||'').toUpperCase()||null,
    outputTokenCount:Number(response?.usageMetadata?.candidatesTokenCount||response?.usageMetadata?.outputTokenCount||0)||null,
    responseBytes:Buffer.byteLength(value,'utf8'),
    responseSha256:value ? crypto.createHash('sha256').update(value).digest('hex').slice(0,16) : null,
    fenced:/^\s*```/i.test(value),
  };
}

function responseFailure(code, message, response, text = '') {
  const error=new RecognitionProviderError(code,message,false);
  error.recognitionResponse={stage:code,...safeResponseMetadata(response,text)};
  return error;
}

function extractGeminiResponseText(response) {
  if (Array.isArray(response?.candidates)) {
    if (!response.candidates.length) {
      if (response?.promptFeedback?.blockReason) throw responseFailure('PROVIDER_BLOCKED','The recognition provider blocked the request.',response);
      throw responseFailure('PROVIDER_NO_CANDIDATES','The recognition provider returned no candidates.',response);
    }
    const candidate=response.candidates[0]||{};
    const finishReason=String(candidate.finishReason||'').toUpperCase();
    if (finishReason==='MAX_TOKENS') throw responseFailure('PROVIDER_OUTPUT_TRUNCATED','The recognition provider response was truncated.',response);
    if (['SAFETY','RECITATION','PROHIBITED_CONTENT','BLOCKLIST','SPII'].includes(finishReason)) {
      throw responseFailure('PROVIDER_BLOCKED','The recognition provider blocked the response.',response);
    }
    const parts=candidate.content?.parts;
    if (!Array.isArray(parts)||!parts.length) throw responseFailure('PROVIDER_EMPTY_PARTS','The recognition provider returned an empty candidate.',response);
    const text=parts.map(part=>typeof part?.text==='string'?part.text:'').join('');
    if (!text.trim()) throw responseFailure('PROVIDER_TEXT_EMPTY','The recognition provider returned no text.',response,text);
    return {text,metadata:{stage:'RESPONSE_TEXT_READY',...safeResponseMetadata(response,text)}};
  }
  const text=typeof response?.text==='string'?response.text:'';
  if (!text.trim()) throw responseFailure('PROVIDER_TEXT_EMPTY','The recognition provider returned no text.',response,text);
  return {text,metadata:{stage:'RESPONSE_TEXT_READY',...safeResponseMetadata(response,text)}};
}

module.exports={extractGeminiResponseText,safeResponseMetadata};
