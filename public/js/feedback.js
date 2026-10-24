// Sound, vibration and screen wake lock. Everything here is best-effort:
// a phone without vibration or WebAudio still works, it just stays quiet.

let audio = null;

/** Call from a tap handler so the browser allows sound. */
export function unlockAudio() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch { /* no audio */ }
}

function beep(freq, start, dur, type = 'sine', gain = 0.35) {
  if (!audio) return;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = audio.currentTime + start;
  amp.gain.setValueAtTime(gain, t0);
  amp.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(amp).connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* ignore */ }
}

/** Short rising two-tone chirp + one buzz. */
export function success() {
  beep(660, 0, 0.12);
  beep(990, 0.13, 0.2);
  vibrate(80);
}

/** Low double buzz. */
export function failure() {
  beep(180, 0, 0.25, 'square', 0.3);
  beep(150, 0.3, 0.3, 'square', 0.3);
  vibrate([200, 100, 200]);
}

/** Tiny tick when a card is first read. */
export function tick() {
  beep(800, 0, 0.06);
  vibrate(30);
}

let wakeLock = null;

export async function keepAwake() {
  try {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch { /* denied or unsupported */ }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !wakeLock && wantAwake) keepAwake();
});

let wantAwake = false;
export function setKeepAwake(on) {
  wantAwake = on;
  if (on) keepAwake();
  else if (wakeLock) wakeLock.release();
}
