/**
 * Continuous wheel + clay sound, synthesised (no assets): a soft motor hum whose pitch follows
 * the wheel speed, plus filtered brown noise that swells into a wet "shhh" while a finger is on
 * the clay. Lives in its own small AudioContext (kit `tone` covers one-shots only); it is
 * created on the first touch and honours the sound setting.
 */
let ac: AudioContext | null = null;
let out: GainNode | null = null;
let motor: OscillatorNode | null = null;
let motor2: OscillatorNode | null = null;
let motorGain: GainNode | null = null;
let band: BiquadFilterNode | null = null;
let noiseGain: GainNode | null = null;
let enabled = true;

export function setHumEnabled(on: boolean) {
  enabled = on;
  if (!on) silence();
}

export function unlockHum() {
  if (ac) {
    if (ac.state === 'suspended') void ac.resume();
    return;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  try {
    ac = new AC();
  } catch {
    return;
  }
  out = ac.createGain();
  out.gain.value = 0;
  out.connect(ac.destination);

  // motor: two detuned low tones through a gentle low-pass
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  motorGain = ac.createGain();
  motorGain.gain.value = 0;
  motor = ac.createOscillator();
  motor.type = 'triangle';
  motor.frequency.value = 70;
  motor2 = ac.createOscillator();
  motor2.type = 'sine';
  motor2.frequency.value = 140.6;
  const m2 = ac.createGain();
  m2.gain.value = 0.35;
  motor.connect(lp);
  motor2.connect(m2).connect(lp);
  lp.connect(motorGain).connect(out);

  // clay: looping brown noise through a band-pass
  const len = ac.sampleRate * 2;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.2;
  }
  const noise = ac.createBufferSource();
  noise.buffer = buf;
  noise.loop = true;
  band = ac.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 500;
  band.Q.value = 0.9;
  noiseGain = ac.createGain();
  noiseGain.gain.value = 0;
  noise.connect(band).connect(noiseGain).connect(out);
  motor.start();
  motor2.start();
  noise.start();
}

/**
 * Per frame: `speed` = wheel speed 0..1, `contact` = finger pressure 0..1 (how much clay is
 * moving), `active` = the wheel scene is on screen.
 */
export function updateHum(speed: number, contact: number, active: boolean) {
  if (!ac || !out || !motor || !motor2 || !motorGain || !band || !noiseGain) return;
  const t = ac.currentTime;
  const on = enabled && active && document.visibilityState === 'visible';
  out.gain.setTargetAtTime(on ? 0.5 : 0, t, on ? 0.12 : 0.05);
  const f = 52 + 46 * speed - 6 * contact;
  motor.frequency.setTargetAtTime(f, t, 0.15);
  motor2.frequency.setTargetAtTime(f * 2.01, t, 0.15);
  motorGain.gain.setTargetAtTime(0.05 + 0.1 * speed, t, 0.2);
  band.frequency.setTargetAtTime(260 + 520 * speed + 900 * contact, t, 0.08);
  noiseGain.gain.setTargetAtTime(0.025 * speed + 0.42 * contact, t, 0.06);
}

export function silence() {
  if (ac && out) out.gain.setTargetAtTime(0, ac.currentTime, 0.04);
}
