export function initializeAudioTimeline(audio) {
  if (!audio) return;
  audio.currentTime = 0;
}
