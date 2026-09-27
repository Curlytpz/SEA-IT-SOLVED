import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeAudioTimeline } from './audioPlayback.js';

test('saved audio timeline starts at zero after metadata loads', () => {
  const audio = { currentTime: 14.5 };
  initializeAudioTimeline(audio);
  assert.equal(audio.currentTime, 0);
});
