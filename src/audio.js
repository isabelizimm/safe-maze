// Synthesised sound: the rumble of a steel ball on wood, knocks on the walls, drops into holes.
// Everything is generated from the ball's motion, so a ball at rest is silent.

export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  start() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch {}
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 1 : 0;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.rollBand = ctx.createBiquadFilter();
    this.rollBand.type = 'bandpass';
    this.rollBand.Q.value = 0.9;
    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;
    const hiss = ctx.createBiquadFilter();
    hiss.type = 'highpass';
    hiss.frequency.value = 3000;
    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0;
    src.connect(this.rollBand).connect(this.rollGain).connect(this.master);
    src.connect(hiss).connect(this.hissGain).connect(this.master);
    src.start();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.02);
  }

  roll(speed) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const v = Math.min(1, speed / 450);
    const g = v < 0.01 ? 0 : 0.5 * v ** 1.1 * (0.85 + 0.3 * Math.random());
    this.rollGain.gain.setTargetAtTime(g, t, 0.025);
    this.hissGain.gain.setTargetAtTime(v < 0.01 ? 0 : 0.03 * v, t, 0.04);
    this.rollBand.frequency.setTargetAtTime(110 + 520 * v, t, 0.05);
  }

  burst(t, { gain, freq, q = 3, dur = 0.03, type = 'bandpass' }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, dur + 0.02);
  }

  tone(t, { gain, f0, f1 = f0, dur, type = 'sine' }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  hit(v) {
    if (!this.ctx || !this.enabled) return;
    const a = Math.min(1, v / 400) ** 1.3;
    if (a < 0.01) return;
    const t = this.ctx.currentTime;
    this.burst(t, { gain: 0.9 * a, freq: 2400 + Math.random() * 600, q: 2.5, dur: 0.025 });
    this.tone(t, { gain: 0.35 * a, f0: 950 + Math.random() * 250, dur: 0.06 });
    this.tone(t, { gain: 0.25 * a, f0: 210, f1: 170, dur: 0.05 });
  }

  fall() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    this.burst(t, { gain: 0.5, freq: 1800, dur: 0.03 });
    this.tone(t + 0.12, { gain: 0.7, f0: 170, f1: 55, dur: 0.3 });
    this.burst(t + 0.12, { gain: 0.6, freq: 380, q: 0.8, type: 'lowpass', dur: 0.12 });
    this.tone(t + 0.3, { gain: 0.2, f0: 120, f1: 60, dur: 0.15 });
  }

  goal() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    [784, 1047, 1319, 1568].forEach((f, i) => {
      this.tone(t + 0.1 + i * 0.09, { gain: 0.14, f0: f, dur: 1.4 });
      this.tone(t + 0.1 + i * 0.09, { gain: 0.04, f0: f * 2.76, dur: 0.5 });
    });
  }
}
