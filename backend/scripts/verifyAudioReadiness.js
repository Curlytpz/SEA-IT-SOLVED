// Run from backend. Uses a disposable synthetic spoken sample, never an existing lesson.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const env = require('../src/config/env');
const { prepareAudioForGemini } = require('../src/utils/audioTranscode');
const Provider = require('../src/transcription/GeminiSpeechTranscriptionProvider');
async function main() {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'sea-audio-verification-'));
  try {
    const executable=String(env.FFMPEG_PATH||'ffmpeg').replace(/^"(.*)"$/,'$1');
    await exec(executable,['-version'],{windowsHide:true});
    console.log('FFMPEG DETECTION: PASS');
    const wav=path.join(directory,'speech.wav'),webm=path.join(directory,'speech.webm');
    await exec('powershell.exe',['-NoProfile','-Command',
      "Add-Type -AssemblyName System.Speech; $speaker=New-Object System.Speech.Synthesis.SpeechSynthesizer; $speaker.SetOutputToWaveFile($env:SEA_DEMO_AUDIO_PATH); $speaker.Speak('This is a lesson transcription test. The derivative of x squared is two x.'); $speaker.Dispose();"
    ],{env:{...process.env,SEA_DEMO_AUDIO_PATH:wav},windowsHide:true});
    await exec(executable,['-hide_banner','-loglevel','error','-i',wav,'-c:a','libopus',webm],{windowsHide:true});
    const prepared=await prepareAudioForGemini({sourcePath:webm,sourceMime:'audio/webm',ffmpegPath:env.FFMPEG_PATH});
    assert.equal(prepared.mimeType,'audio/flac');
    assert((await fs.stat(prepared.audioPath)).size>0);
    const original=await fs.readFile(webm);
    // Explicit quoted paths, spaces, missing executable, and preservation on failure.
    const probe=(await exec('where.exe',[executable],{windowsHide:true})).stdout.trim().split(/\r?\n/)[0];
    await prepareAudioForGemini({sourcePath:webm,sourceMime:'audio/webm',ffmpegPath:'"'+probe+'"'});
    await assert.rejects(()=>prepareAudioForGemini({sourcePath:webm,sourceMime:'audio/webm',ffmpegPath:'sea-ffmpeg-does-not-exist'}),{code:'FFMPEG_NOT_FOUND'});
    assert.deepEqual(await fs.readFile(webm),original);
    console.log('WEBM TO FLAC / PATH / EXPLICIT PATH / ORIGINAL PRESERVED: PASS');
    if(process.argv.includes('--provider')) {
      const provider=new Provider({apiKey:env.GEMINI_API_KEY,model:env.GEMINI_TRANSCRIPTION_MODEL,timeoutMs:env.TRANSCRIPTION_PROVIDER_TIMEOUT_MS,filePollIntervalMs:env.GEMINI_FILE_POLL_INTERVAL_MS,fileReadyTimeoutMs:env.GEMINI_FILE_READY_TIMEOUT_MS});
      const result=await provider.transcribe({...prepared,durationMs:8000});
      assert(result.normalized.segments.length>0);
      console.log('LIVE SYNTHETIC SPEECH TRANSCRIPTION: PASS');
    }
  } finally { await fs.rm(directory,{recursive:true,force:true}); }
}
main().catch(error=>{console.error('AUDIO VERIFICATION: FAIL',error.code||error.name);process.exitCode=1;});
