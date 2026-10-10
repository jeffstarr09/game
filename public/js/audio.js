// Generative sound. The nib scratches, grazes sing, pigments ring notes
// from the day's scale, so every run is also a short piece of music.
let ctx = null;
let master = null;
let scratch = null;
let scratchGain = null;
let scratchFilter = null;
let graze = null;
let grazeGain = null;
let muted = false;

try {
  muted = localStorage.getItem('otl.muted') === '1';
} catch {}

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]; // major pentatonic

export function isMuted() {
  return muted;
}

export function setMuted(m) {
  muted = m;
  try {
    localStorage.setItem('otl.muted', m ? '1' : '0');
  } catch {}
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05);
}

export function unlock() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.8;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);

  // pen scratch: looped noise through a bandpass
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = last * 0.6 + (Math.random() * 2 - 1) * 0.4;
    d[i] = last * (0.6 + 0.4 * Math.random());
  }
  scratch = ctx.createBufferSource();
  scratch.buffer = buf;
  scratch.loop = true;
  scratchFilter = ctx.createBiquadFilter();
  scratchFilter.type = 'bandpass';
  scratchFilter.frequency.value = 1800;
  scratchFilter.Q.value = 0.9;
  scratchGain = ctx.createGain();
  scratchGain.gain.value = 0;
  scratch.connect(scratchFilter).connect(scratchGain).connect(master);
  scratch.start();

  // graze tone: a soft sine that rises with nerve
  graze = ctx.createOscillator();
  graze.type = 'triangle';
  graze.frequency.value = 440;
  grazeGain = ctx.createGain();
  grazeGain.gain.value = 0;
  graze.connect(grazeGain).connect(master);
  graze.start();
}

export function penUpdate(speed, turning, grazing, streak) {
  if (!ctx) return;
  const t = ctx.currentTime;
  scratchGain.gain.setTargetAtTime(speed > 0 ? 0.05 + speed * 0.012 : 0, t, 0.05);
  scratchFilter.frequency.setTargetAtTime(1400 + speed * 260 + (turning ? 500 : 0), t, 0.05);
  grazeGain.gain.setTargetAtTime(grazing ? 0.06 : 0, t, grazing ? 0.02 : 0.08);
  if (grazing) graze.frequency.setTargetAtTime(330 * Math.pow(2, Math.min(streak, 240) / 120), t, 0.05);
}

export function penStop() {
  if (!ctx) return;
  scratchGain.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
  grazeGain.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
}

function bell(freq, when, dur = 0.9, vol = 0.22, type = 'sine') {
  const o = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  o2.type = 'sine';
  o2.frequency.value = freq * 2.76; // marimba-ish partial
  const g2 = ctx.createGain();
  g2.gain.value = 0.18;
  o.connect(g);
  o2.connect(g2).connect(g);
  g.connect(master);
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(vol, when + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.start(when);
  o2.start(when);
  o.stop(when + dur + 0.05);
  o2.stop(when + dur + 0.05);
}

export function pigment(n) {
  if (!ctx) return;
  const step = SCALE[Math.min(n - 1, SCALE.length - 1)] + 12 * Math.floor((n - 1) / SCALE.length);
  const f = 392 * Math.pow(2, Math.min(step, 36) / 12);
  bell(f, ctx.currentTime, 0.8, 0.2);
  bell(f * 1.5, ctx.currentTime + 0.06, 0.5, 0.07);
}

export function death() {
  if (!ctx) return;
  penStop();
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.35);
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.55);
  // splat
  const len = ctx.sampleRate * 0.25;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const n = ctx.createBufferSource();
  n.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 900;
  const ng = ctx.createGain();
  ng.gain.value = 0.35;
  n.connect(f).connect(ng).connect(master);
  n.start(t);
}

export function chord(rank) {
  // Result sting: brighter the higher you hang.
  if (!ctx) return;
  const t = ctx.currentTime + 0.05;
  const base = rank === 1 ? 523.25 : rank <= 10 ? 440 : 392;
  const notes = rank === 1 ? [0, 4, 7, 12, 16] : rank <= 10 ? [0, 4, 7, 12] : [0, 7];
  notes.forEach((s, i) => bell(base * Math.pow(2, s / 12), t + i * 0.07, 1.4, 0.12));
}

export function tick() {
  if (!ctx) return;
  bell(1200, ctx.currentTime, 0.08, 0.05, 'triangle');
}
