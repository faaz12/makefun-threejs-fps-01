// Synthesized WebAudio sounds for FROSTLINE. No audio files, no network:
// every sound is an oscillator / filtered-noise burst built at runtime.
// The context is created lazily on the first user gesture; in headless
// screenshot mode it stays suspended and every call is a safe no-op.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.windNodes = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  unlock() {
    this.ensure();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  // Short noise burst through a band-pass filter: the core of every gunshot.
  _noiseBurst({ dur = 0.12, freq = 1800, q = 0.8, gain = 0.5, type = 'bandpass' }) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  // A short tone with a pitch slide, for clicks, beeps and stingers.
  _tone({ freq = 440, to = null, dur = 0.08, gain = 0.2, type = 'sine' }) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to !== null) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur);
  }

  shot(kind) {
    if (!this.ctx) return;
    switch (kind) {
      case 'pistol':
        this._noiseBurst({ dur: 0.09, freq: 2400, gain: 0.42 });
        this._tone({ freq: 220, to: 70, dur: 0.07, gain: 0.25, type: 'square' });
        break;
      case 'smg':
        this._noiseBurst({ dur: 0.07, freq: 3000, gain: 0.34 });
        this._tone({ freq: 260, to: 90, dur: 0.05, gain: 0.18, type: 'square' });
        break;
      case 'rifle':
        this._noiseBurst({ dur: 0.13, freq: 1600, gain: 0.55 });
        this._tone({ freq: 180, to: 55, dur: 0.11, gain: 0.32, type: 'square' });
        break;
      case 'sniper':
        this._noiseBurst({ dur: 0.22, freq: 1100, gain: 0.7 });
        this._tone({ freq: 140, to: 40, dur: 0.2, gain: 0.4, type: 'square' });
        break;
      default:
        this._noiseBurst({ dur: 0.1, freq: 2000, gain: 0.4 });
    }
  }

  dryFire() { this._tone({ freq: 900, to: 500, dur: 0.04, gain: 0.15, type: 'square' }); }
  reload() {
    this._tone({ freq: 1200, to: 700, dur: 0.05, gain: 0.18, type: 'square' });
    setTimeout(() => this._tone({ freq: 700, to: 1100, dur: 0.05, gain: 0.18, type: 'square' }), 220);
  }
  hit() { this._tone({ freq: 1500, dur: 0.05, gain: 0.22, type: 'sine' }); }
  kill() {
    this._tone({ freq: 880, dur: 0.07, gain: 0.2 });
    setTimeout(() => this._tone({ freq: 1320, dur: 0.09, gain: 0.2 }), 70);
  }
  hurt() { this._tone({ freq: 160, to: 90, dur: 0.14, gain: 0.3, type: 'sawtooth' }); }
  step() { this._noiseBurst({ dur: 0.05, freq: 500, q: 0.5, gain: 0.07, type: 'lowpass' }); }
  plantTick() { this._tone({ freq: 1100, dur: 0.05, gain: 0.16 }); }
  beep() { this._tone({ freq: 980, dur: 0.09, gain: 0.2 }); }
  explosion() {
    this._noiseBurst({ dur: 0.7, freq: 300, q: 0.4, gain: 0.9, type: 'lowpass' });
    this._tone({ freq: 90, to: 30, dur: 0.6, gain: 0.5, type: 'sine' });
  }
  roundWin() {
    [523, 659, 784].forEach((f, i) => setTimeout(() => this._tone({ freq: f, dur: 0.16, gain: 0.22 }), i * 110));
  }
  roundLose() {
    [392, 330, 262].forEach((f, i) => setTimeout(() => this._tone({ freq: f, dur: 0.18, gain: 0.2 }), i * 120));
  }
  buy() { this._tone({ freq: 740, to: 990, dur: 0.07, gain: 0.18 }); }
  denied() { this._tone({ freq: 220, to: 160, dur: 0.1, gain: 0.18, type: 'square' }); }

  // Looping polar wind: filtered noise whose gain breathes slowly.
  startWind() {
    if (!this.ctx || this.windNodes) return;
    try {
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02; // brown-ish drift
        d[i] = last * 3.2;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.value = 420;
      filt.Q.value = 0.6;
      const g = this.ctx.createGain();
      g.gain.value = 0.05;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.11;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.03;
      lfo.connect(lfoGain).connect(g.gain);
      src.connect(filt).connect(g).connect(this.master);
      src.start();
      lfo.start();
      this.windNodes = { src, lfo };
    } catch {
      // Wind is ambience; a failure must never break the game.
    }
  }
}
