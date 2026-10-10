/**
 * Tiny WebAudio synth: every sound is generated in code, so games ship with zero audio assets.
 * The context is created lazily on the first user gesture (required by iOS/Android WebViews).
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

export function unlockAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
}

export interface ToneOptions {
  freq: number;
  /** End frequency for a pitch glide. */
  to?: number;
  duration?: number;
  type?: OscillatorType;
  volume?: number;
  /** Seconds from now. */
  delay?: number;
}

export function tone({ freq, to, duration = 0.12, type = 'sine', volume = 0.6, delay = 0 }: ToneOptions) {
  if (!enabled || !ctx || !master) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + duration);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** Pentatonic scale helper: always sounds pleasant, whatever the index. */
export function pentatonic(step: number, base = 523.25) {
  const pattern = [0, 2, 4, 7, 9];
  const octave = Math.floor(step / pattern.length);
  const semis = pattern[((step % pattern.length) + pattern.length) % pattern.length] + 12 * octave;
  return base * Math.pow(2, semis / 12);
}
