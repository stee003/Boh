/** Original synthesized audio. No sampled library, no borrowed cues. */

const RECIPES = {
  ar: { freq: 170, slide: 70, dur: 0.09, type: 'square', gain: 0.16, noise: 0.07, filter: 1600 },
  ar_heavy: { freq: 110, slide: 50, dur: 0.12, type: 'sawtooth', gain: 0.18, noise: 0.08, filter: 900 },
  ar_fast: { freq: 220, slide: 90, dur: 0.05, type: 'square', gain: 0.12, noise: 0.05, filter: 2200 },
  smg: { freq: 250, slide: 120, dur: 0.045, type: 'square', gain: 0.11, noise: 0.05, filter: 2400 },
  smg_fast: { freq: 300, slide: 140, dur: 0.035, type: 'square', gain: 0.1, noise: 0.04, filter: 2800 },
  shotgun: { freq: 80, slide: 36, dur: 0.2, type: 'sawtooth', gain: 0.24, noise: 0.16, filter: 700 },
  shotgun_slug: { freq: 100, slide: 40, dur: 0.16, type: 'triangle', gain: 0.2, noise: 0.08, filter: 900 },
  sniper: { freq: 140, slide: 40, dur: 0.28, type: 'triangle', gain: 0.2, noise: 0.05, filter: 1100 },
  sniper_quiet: { freq: 180, slide: 70, dur: 0.12, type: 'sine', gain: 0.1, noise: 0.02, filter: 1400 },
  marksman: { freq: 190, slide: 80, dur: 0.1, type: 'square', gain: 0.15, noise: 0.04, filter: 1500 },
  lmg: { freq: 120, slide: 55, dur: 0.08, type: 'sawtooth', gain: 0.14, noise: 0.08, filter: 1000 },
  pistol: { freq: 280, slide: 100, dur: 0.07, type: 'square', gain: 0.13, noise: 0.04, filter: 2000 },
  pistol_heavy: { freq: 160, slide: 60, dur: 0.1, type: 'triangle', gain: 0.16, noise: 0.04, filter: 1200 },
  energy: { freq: 520, slide: 240, dur: 0.11, type: 'sine', gain: 0.12, noise: 0.01, filter: 3200 },
  energy_blast: { freq: 180, slide: 90, dur: 0.16, type: 'sawtooth', gain: 0.16, noise: 0.06, filter: 1400 },
  projectile: { freq: 340, slide: 180, dur: 0.1, type: 'sine', gain: 0.1, noise: 0.02, filter: 1800 },
  charge: { freq: 90, slide: 200, dur: 0.22, type: 'sine', gain: 0.14, noise: 0.02, filter: 800 },
  melee: { freq: 240, slide: 80, dur: 0.08, type: 'sawtooth', gain: 0.12, noise: 0.03, filter: 1600 },
  melee_heavy: { freq: 90, slide: 40, dur: 0.12, type: 'triangle', gain: 0.16, noise: 0.05, filter: 600 },
  reload: { freq: 420, slide: 180, dur: 0.06, type: 'triangle', gain: 0.06, noise: 0.02, filter: 1800 },
  empty: { freq: 140, slide: 140, dur: 0.04, type: 'square', gain: 0.05, noise: 0, filter: 800 },
  hit: { freq: 880, slide: 440, dur: 0.04, type: 'sine', gain: 0.07, noise: 0, filter: 2000 },
  head: { freq: 1320, slide: 700, dur: 0.06, type: 'sine', gain: 0.08, noise: 0, filter: 2400 },
  ui: { freq: 640, slide: 820, dur: 0.045, type: 'sine', gain: 0.05, noise: 0, filter: 2000 },
  deny: { freq: 180, slide: 90, dur: 0.08, type: 'square', gain: 0.05, noise: 0, filter: 600 },
  explode: { freq: 70, slide: 30, dur: 0.32, type: 'sawtooth', gain: 0.22, noise: 0.14, filter: 500 },
  foot: { freq: 90, slide: 60, dur: 0.05, type: 'sine', gain: 0.08, noise: 0.05, filter: 420 },
  jump: { freq: 220, slide: 360, dur: 0.08, type: 'sine', gain: 0.05, noise: 0, filter: 1200 },
  land: { freq: 80, slide: 40, dur: 0.07, type: 'triangle', gain: 0.07, noise: 0.03, filter: 300 },
  ability: { freq: 480, slide: 720, dur: 0.12, type: 'sine', gain: 0.07, noise: 0, filter: 2000 },
  go: { freq: 520, slide: 880, dur: 0.18, type: 'triangle', gain: 0.08, noise: 0, filter: 1600 },
};

const SURFACE = { concrete: 1, metal: 1.45, sand: 0.62, wood: 0.88, glass: 1.7, water: 0.5, grass: 0.7, crate: 0.8, caution: 1.2, trim: 1.3, neon: 1.1 };

export class AudioBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.music = null;
    this.sfx = null;
    this.voice = null;
    this.volumes = { master: 0.8, music: 0.28, sfx: 0.75, voice: 0.7 };
    this.musicNodes = [];
    this.enabled = true;
  }

  ensure() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.music = this.ctx.createGain();
    this.sfx = this.ctx.createGain();
    this.voice = this.ctx.createGain();
    this.music.connect(this.master);
    this.sfx.connect(this.master);
    this.voice.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.applyVolumes();
    this.startBed();
  }

  async resume() {
    this.ensure();
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
  }

  applyVolumes() {
    if (!this.master) return;
    this.master.gain.value = this.volumes.master;
    this.music.gain.value = this.volumes.music;
    this.sfx.gain.value = this.volumes.sfx;
    this.voice.gain.value = this.volumes.voice;
  }

  setVolumes(v) {
    Object.assign(this.volumes, v);
    this.applyVolumes();
  }

  play(kind, opts = {}) {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    // Undefined overrides must not erase recipe defaults (notably weapon gain).
    const recipe = { ...(RECIPES[kind] || RECIPES.ui), ...Object.fromEntries(Object.entries(opts).filter(([, value]) => value !== undefined)) };
    const t = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = recipe.filter || 1800;
    const osc = this.ctx.createOscillator();
    osc.type = recipe.type || 'sine';
    osc.frequency.setValueAtTime(recipe.freq || 200, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, recipe.slide || recipe.freq || 80), t + recipe.dur);
    gain.gain.setValueAtTime(recipe.gain ?? 0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + recipe.dur + 0.02);
    osc.connect(filter);
    filter.connect(gain);
    const dest = opts.bus === 'music' ? this.music : this.sfx;
    if (recipe.noise) {
      const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * recipe.dur), this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * recipe.noise;
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const ng = this.ctx.createGain();
      ng.gain.value = recipe.gain * 0.8;
      noise.connect(ng);
      ng.connect(filter);
      noise.start(t);
      noise.stop(t + recipe.dur);
    }
    gain.connect(dest);
    const pan = opts.pan || 0;
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      gain.disconnect();
      gain.connect(p);
      p.connect(dest);
    }
    osc.start(t);
    osc.stop(t + recipe.dur + 0.03);
  }

  weapon(kind, quiet = false) {
    this.play(kind || 'ar', quiet ? { gain: 0.05 } : {});
  }

  footstep(surface, speed, dist = 0, quiet = 1) {
    const mul = SURFACE[surface] || 1;
    const vol = Math.max(0.02, 0.09 * Math.min(1.2, speed / 8) * quiet / (1 + dist * 0.12));
    this.play('foot', { freq: 70 * mul + speed * 4, gain: vol, filter: 300 * mul });
  }

  spatial(kind, dist, pan = 0) {
    const gain = 0.16 / (1 + dist * 0.11);
    this.play(kind, { gain, pan });
  }

  startBed() {
    if (!this.ctx || this.musicNodes.length) return;
    // Original sparse bed: a slow locrian-ish figure, not a known tune.
    const notes = [146.83, 174.61, 207.65, 233.08, 261.63, 207.65, 174.61, 155.56];
    const playNote = (i) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = notes[i % notes.length];
      g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.045, this.ctx.currentTime + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 2.4);
      osc.connect(g);
      g.connect(this.music);
      osc.start();
      osc.stop(this.ctx.currentTime + 2.6);
    };
    let i = 0;
    playNote(0);
    this.bedTimer = setInterval(() => {
      i = (i + 1) % notes.length;
      if (this.ctx && this.volumes.music > 0.01) playNote(i);
    }, 1700);
  }

  stop() {
    if (this.bedTimer) clearInterval(this.bedTimer);
    this.ctx?.close();
    this.ctx = null;
  }
}
