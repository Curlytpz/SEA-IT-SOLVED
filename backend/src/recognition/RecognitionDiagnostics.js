function sanitizeRecognitionLogText(value) {
  return String(value || '')
    .replace(/AIza[A-Za-z0-9_-]{20,}/g, '[REDACTED_API_KEY]')
    .replace(/([?&](?:key|api_key)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,}]+/gi, '$1[REDACTED]')
    .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/gi, '[REDACTED_IMAGE_DATA]')
    .replace(/\b[A-Za-z0-9+/]{200,}={0,2}\b/g, '[REDACTED_BINARY_DATA]')
    .slice(0, 1000);
}

function recognitionRequestMetadata(error) {
  let current=error;
  for(let depth=0;current&&depth<6;depth+=1){
    if(current.recognitionRequest)return {
      requestStage:current.recognitionRequest.requestStage || null,
      model:current.recognitionRequest.model || null,
      imageMimeType:current.recognitionRequest.imageMimeType || null,
      imageByteSize:current.recognitionRequest.imageByteSize ?? null,
      imagePartCount:current.recognitionRequest.imagePartCount ?? null,
      responseSchemaSupplied:current.recognitionRequest.responseSchemaSupplied ?? null,
      responseMimeTypeSupplied:current.recognitionRequest.responseMimeTypeSupplied ?? null,
    };
    current=current.cause;
  }
  return {};
}

module.exports = { sanitizeRecognitionLogText, recognitionRequestMetadata };
