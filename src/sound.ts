import { soundEnabled } from './settings.ts';

/** Singleton AudioContext for the document; created lazily on first use/gesture. */
let audioCtx: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  audioCtx ??= new Ctx();
  if (audioCtx.state === 'suspended') void audioCtx.resume();
  return audioCtx;
}

/** Create/resume the audio context. Call from a user-gesture handler so browsers
 * allow playback (audio is blocked until the page has been interacted with). */
export function unlockAudio(): void {
  ctx();
}

/** Play a short synthesized attention chime, unless the user has muted sound.
 * 'done' is a brighter ascending pair; 'waiting' is lower and more insistent. */
export function playChime(state: 'done' | 'waiting'): void {
  if (!soundEnabled()) return;
  const audio = ctx();
  if (!audio) return;
  const notes = state === 'done' ? [660, 988] : [523, 415];
  const start = audio.currentTime;
  notes.forEach((freq, i) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const t = start + i * 0.13;
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  });
}
