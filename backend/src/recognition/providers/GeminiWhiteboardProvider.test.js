const test = require('node:test');
const assert = require('node:assert/strict');
const GeminiWhiteboardProvider = require('./GeminiWhiteboardProvider');
const { providerGoogleStatus } = require('../ProviderErrorMapper');
const { sanitizeRecognitionLogText, recognitionRequestMetadata } = require('../RecognitionDiagnostics');
const { geminiResponseJsonSchema } = require('../geminiSchema');
const { assertGeminiJsonSchema } = require('../geminiSchemaSupport');

const png = Buffer.from('89504e470d0a1a0a01020304', 'hex');
const jpeg = Buffer.from('ffd8ffdb01020304', 'hex');
const validResponse = { plainText:'x = 1', blocks:[], warnings:[] };

function providerWithResponse(onRequest, response = validResponse) {
  const provider = new GeminiWhiteboardProvider({apiKey:'secret',model:'gemini-2.5-flash',mediaResolution:'MEDIA_RESOLUTION_HIGH',timeoutMs:1000,maxImageBytes:1024});
  provider.client={models:{generateContent:async request=>{onRequest(request);return{text:JSON.stringify(response)};}}};
  return provider;
}

for (const [label,mimeType,image] of [['JPEG','image/jpeg',jpeg],['PNG','image/png',png]]) {
  test(`valid ${label} uses actual image bytes, correct MIME, and JSON response config`, async () => {
    let request;
    const provider=providerWithResponse(value=>{request=value;});
    const result=await provider.extract({imageBuffer:image,mimeType});
    const inline=request.contents[0].parts[0].inlineData;
    assert.equal(inline.mimeType,mimeType);
    assert.equal(inline.data,image.toString('base64'));
    assert.equal(inline.data.startsWith('data:'),false);
    assert.equal(request.config.responseMimeType,'application/json');
    assert.equal(request.config.responseJsonSchema,geminiResponseJsonSchema);
    assert.equal(result.normalized.plainText,'x = 1');
  });
}

test('invalid image input is rejected before Gemini is called', async () => {
  let called=false;
  const provider=providerWithResponse(()=>{called=true;});
  await assert.rejects(()=>provider.extract({imageBuffer:Buffer.from('path/to/image.jpg'),mimeType:'image/jpeg'}),error=>error.code==='INVALID_INPUT');
  assert.equal(called,false);
});

test('Gemini INVALID_ARGUMENT remains a request failure with safe request metadata', async () => {
  const provider=providerWithResponse(()=>{throw Object.assign(new Error('{"error":{"code":400,"message":"schema rejected","status":"INVALID_ARGUMENT"}}'),{status:400});});
  await assert.rejects(()=>provider.extract({imageBuffer:jpeg,mimeType:'image/jpeg'}),error=>{
    assert.equal(error.code,'PROVIDER_REQUEST_INVALID');
    assert.equal(providerGoogleStatus(error),'INVALID_ARGUMENT');
    assert.deepEqual(recognitionRequestMetadata(error),{
      requestStage:'generate_content',model:'gemini-2.5-flash',imageMimeType:'image/jpeg',
      imageByteSize:jpeg.length,imagePartCount:1,responseSchemaSupplied:true,responseMimeTypeSupplied:true,
    });
    return true;
  });
});

test('malformed provider JSON is classified separately from request rejection', async () => {
  const provider=providerWithResponse(()=>{});
  provider.client.models.generateContent=async()=>({text:'not-json'});
  await assert.rejects(()=>provider.extract({imageBuffer:png,mimeType:'image/png'}),error=>error.code==='PROVIDER_RESPONSE_INVALID');
});

test('Gemini schemas stay within the supported keyword subset', () => {
  assert.doesNotThrow(()=>assertGeminiJsonSchema(geminiResponseJsonSchema));
});

test('recognition diagnostics redact API keys and image/base64 data', () => {
  const apiKey='AIza'+'A'.repeat(35);
  const imageData=Buffer.alloc(300,7).toString('base64');
  const safe=sanitizeRecognitionLogText(`key=${apiKey} data:image/jpeg;base64,${imageData}`);
  assert.equal(safe.includes(apiKey),false);
  assert.equal(safe.includes(imageData),false);
  assert.match(safe,/REDACTED/);
});
