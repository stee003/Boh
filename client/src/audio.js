/** Original synthesized audio — AAA overhaul with reverb, spatial, layers. */

const RECIPES = {
  ar: { freq: 170, slide: 70, dur: 0.09, type: 'square', gain: 0.16, noise: 0.07, filter: 1600, layers:1 },
  ar_heavy: { freq: 110, slide: 50, dur: 0.12, type: 'sawtooth', gain: 0.18, noise: 0.08, filter: 900, layers:2 },
  ar_fast: { freq: 220, slide: 90, dur: 0.05, type: 'square', gain: 0.12, noise: 0.05, filter: 2200, layers:1 },
  smg: { freq: 250, slide: 120, dur: 0.045, type: 'square', gain: 0.11, noise: 0.05, filter: 2400, layers:1 },
  smg_fast: { freq: 300, slide: 140, dur: 0.035, type: 'square', gain: 0.10, noise: 0.04, filter: 2800, layers:1 },
  shotgun: { freq: 80, slide: 36, dur: 0.20, type: 'sawtooth', gain: 0.24, noise: 0.16, filter: 700, layers:3 },
  shotgun_slug: { freq: 100, slide: 40, dur: 0.16, type: 'triangle', gain: 0.20, noise: 0.08, filter: 900, layers:2 },
  sniper: { freq: 140, slide: 40, dur: 0.28, type: 'triangle', gain: 0.20, noise: 0.05, filter: 1100, layers:2 },
  sniper_quiet: { freq: 180, slide: 70, dur: 0.12, type: 'sine', gain: 0.10, noise: 0.02, filter: 1400, layers:1 },
  marksman: { freq: 190, slide: 80, dur: 0.10, type: 'square', gain: 0.15, noise: 0.04, filter: 1500, layers:1 },
  lmg: { freq: 120, slide: 55, dur: 0.08, type: 'sawtooth', gain: 0.14, noise: 0.08, filter: 1000, layers:2 },
  pistol: { freq: 280, slide: 100, dur: 0.07, type: 'square', gain: 0.13, noise: 0.04, filter: 2000, layers:1 },
  pistol_heavy: { freq: 160, slide: 60, dur: 0.10, type: 'triangle', gain: 0.16, noise: 0.04, filter: 1200, layers:1 },
  energy: { freq: 520, slide: 240, dur: 0.11, type: 'sine', gain: 0.12, noise: 0.01, filter: 3200, layers:2 },
  energy_blast: { freq: 180, slide: 90, dur: 0.16, type: 'sawtooth', gain: 0.16, noise: 0.06, filter: 1400, layers:2 },
  projectile: { freq: 340, slide: 180, dur: 0.10, type: 'sine', gain: 0.10, noise: 0.02, filter: 1800, layers:1 },
  charge: { freq: 90, slide: 200, dur: 0.22, type: 'sine', gain: 0.14, noise: 0.02, filter: 800, layers:2 },
  melee: { freq: 240, slide: 80, dur: 0.08, type: 'sawtooth', gain: 0.12, noise: 0.03, filter: 1600, layers:1 },
  melee_heavy: { freq: 90, slide: 40, dur: 0.12, type: 'triangle', gain: 0.16, noise: 0.05, filter: 600, layers:2 },
  reload: { freq: 420, slide: 180, dur: 0.06, type: 'triangle', gain: 0.06, noise: 0.02, filter: 1800, layers:1 },
  empty: { freq: 140, slide: 140, dur: 0.04, type: 'square', gain: 0.05, noise: 0, filter: 800, layers:1 },
  hit: { freq: 880, slide: 440, dur: 0.04, type: 'sine', gain: 0.07, noise: 0, filter: 2000, layers:1 },
  head: { freq: 1320, slide: 700, dur: 0.06, type: 'sine', gain: 0.08, noise: 0, filter: 2400, layers:2 },
  ui: { freq: 640, slide: 820, dur: 0.045, type: 'sine', gain: 0.05, noise: 0, filter: 2000, layers:1 },
  deny: { freq: 180, slide: 90, dur: 0.08, type: 'square', gain: 0.05, noise: 0, filter: 600, layers:1 },
  explode: { freq: 70, slide: 30, dur: 0.32, type: 'sawtooth', gain: 0.22, noise: 0.14, filter: 500, layers:3 },
  foot: { freq: 90, slide: 60, dur: 0.05, type: 'sine', gain: 0.08, noise: 0.05, filter: 420, layers:1 },
  jump: { freq: 220, slide: 360, dur: 0.08, type: 'sine', gain: 0.05, noise: 0, filter: 1200, layers:1 },
  land: { freq: 80, slide: 40, dur: 0.07, type: 'triangle', gain: 0.07, noise: 0.03, filter: 300, layers:1 },
  ability: { freq: 480, slide: 720, dur: 0.12, type: 'sine', gain: 0.07, noise: 0, filter: 2000, layers:2 },
  go: { freq: 520, slide: 880, dur: 0.18, type: 'triangle', gain: 0.08, noise: 0, filter: 1600, layers:2 },
};

const SURFACE = { concrete:1, metal:1.45, sand:0.62, wood:0.88, glass:1.7, water:0.5, grass:0.7, crate:0.8, caution:1.2, trim:1.3, neon:1.1 };

export class AudioBus {
  constructor(){
    this.ctx=null; this.master=null; this.music=null; this.sfx=null; this.voice=null;
    this.volumes={ master:0.8, music:0.28, sfx:0.75, voice:0.7 };
    this.musicNodes=[]; this.enabled=true; this.reverb=null;
  }

  ensure(){
    if (this.ctx) return;
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx=new Ctx();
    this.master=this.ctx.createGain();
    this.music=this.ctx.createGain();
    this.sfx=this.ctx.createGain();
    this.voice=this.ctx.createGain();
    // simple reverb via convolver with synthetic IR
    try{
      const convolver=this.ctx.createConvolver();
      const rate=this.ctx.sampleRate;
      const len=rate*1.4;
      const ir=this.ctx.createBuffer(2, len, rate);
      for (let ch=0; ch<2; ch++){
        const data=ir.getChannelData(ch);
        for (let i=0;i<len;i++){
          data[i]=(Math.random()*2-1)*Math.pow(1-i/len, 2.2)*0.6;
        }
      }
      convolver.buffer=ir;
      const revGain=this.ctx.createGain(); revGain.gain.value=0.18;
      const revFilter=this.ctx.createBiquadFilter(); revFilter.type='lowpass'; revFilter.frequency.value=1800;
      this.sfx.connect(revFilter); revFilter.connect(convolver); convolver.connect(revGain); revGain.connect(this.master);
      this.reverb={ convolver, gain:revGain };
    }catch{}

    this.music.connect(this.master);
    this.sfx.connect(this.master);
    this.voice.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.applyVolumes();
    this.startBed();
  }

  async resume(){
    this.ensure();
    if (this.ctx?.state==='suspended') await this.ctx.resume();
  }

  applyVolumes(){
    if (!this.master) return;
    this.master.gain.value=this.volumes.master;
    this.music.gain.value=this.volumes.music;
    this.sfx.gain.value=this.volumes.sfx;
    this.voice.gain.value=this.volumes.voice;
    if (this.reverb) this.reverb.gain.gain.value = this.volumes.sfx*0.22;
  }

  setVolumes(v){ Object.assign(this.volumes,v); this.applyVolumes(); }

  play(kind, opts={}){
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    const base=RECIPES[kind]||RECIPES.ui;
    const recipe={ ...base, ...Object.fromEntries(Object.entries(opts).filter(([,value])=>value!==undefined)) };
    const t=this.ctx.currentTime;
    const layers=recipe.layers||1;

    for (let l=0;l<layers;l++){
      const gain=this.ctx.createGain();
      const filter=this.ctx.createBiquadFilter();
      filter.type='lowpass';
      filter.frequency.value=recipe.filter||1800;
      // slight detune per layer for richness
      const detune = l===0 ? 0 : (l%2? 7 : -7) + (Math.random()-0.5)*4;
      const osc=this.ctx.createOscillator();
      osc.type=recipe.type||'sine';
      const f0=(recipe.freq||200)*(1+detune*0.01);
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, recipe.slide||recipe.freq||80), t+recipe.dur);
      const g = (recipe.gain ?? 0.08) * (l===0?1:0.55) / Math.max(1,layers*0.7);
      gain.gain.setValueAtTime(g, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t+recipe.dur+0.04);

      osc.connect(filter); filter.connect(gain);
      const dest=opts.bus==='music'?this.music:this.sfx;

      if (recipe.noise){
        const buffer=this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate*recipe.dur), this.ctx.sampleRate);
        const data=buffer.getChannelData(0);
        for (let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*recipe.noise*(1-i/data.length*0.5);
        const noise=this.ctx.createBufferSource(); noise.buffer=buffer;
        const ng=this.ctx.createGain(); ng.gain.value=g*0.85;
        noise.connect(ng); ng.connect(filter);
        noise.start(t); noise.stop(t+recipe.dur);
      }

      // spatialization
      if (opts.pan!==undefined && this.ctx.createStereoPanner){
        const panner=this.ctx.createStereoPanner();
        panner.pan.value=Math.max(-1,Math.min(1, opts.pan + (l===1?0.12:-0.12)));
        gain.disconnect(); gain.connect(panner); panner.connect(dest);
      } else {
        gain.connect(dest);
      }

      // distance lowpass
      if (opts.distance){
        filter.frequency.value = Math.max(400, filter.frequency.value / (1+opts.distance*0.08));
        gain.gain.value *= 1/(1+opts.distance*0.18);
      }

      osc.start(t + l*0.008);
      osc.stop(t+recipe.dur+0.05);
    }
  }

  weapon(kind, quiet=false){
    if (quiet) this.play(kind||'ar', { gain:0.05, layers:1 });
    else {
      this.play(kind||'ar', {});
      // add mechanical layer
      if (Math.random()<0.7) this.play('reload', { gain:0.04, freq: 600+Math.random()*200, dur:0.04 });
    }
  }

  footstep(surface, speed, dist=0, quiet=1){
    const mul=SURFACE[surface]||1;
    const vol=Math.max(0.02, 0.09*Math.min(1.2, speed/8)*quiet/(1+dist*0.12));
    this.play('foot', { freq:70*mul + speed*4 + (Math.random()-0.5)*12, gain:vol, filter:320*mul, distance:dist*0.5 });
  }

  spatial(kind, dist, pan=0){
    const gain=0.16/(1+dist*0.11);
    this.play(kind, { gain, pan, distance:dist });
  }

  startBed(){
    if (!this.ctx || this.musicNodes.length) return;
    // original sparse bed: locrian-ish figure with pads and arps, not a known tune
    const notes=[146.83, 174.61, 207.65, 233.08, 261.63, 207.65, 174.61, 155.56];
    const bass=[73.42, 87.31, 103.83, 116.54];
    let idx=0, bIdx=0;

    const playNote=(freq, dur, type='sine', gain=0.045, detune=0)=>{
      if (!this.ctx) return;
      const osc=this.ctx.createOscillator();
      const g=this.ctx.createGain();
      const f=this.ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=1800;
      osc.type=type; osc.frequency.value=freq; osc.detune.value=detune;
      g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      g.gain.linearRampToValueAtTime(gain, this.ctx.currentTime+0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime+dur);
      osc.connect(f); f.connect(g); g.connect(this.music);
      osc.start(); osc.stop(this.ctx.currentTime+dur+0.1);
    };

    playNote(notes[0], 2.4, 'sine', 0.05);
    this.bedTimer=setInterval(()=>{
      if (!this.ctx || this.volumes.music<0.015) return;
      idx=(idx+1)%notes.length;
      bIdx=(bIdx+ (idx%4===0?1:0))%bass.length;
      // arp
      playNote(notes[idx], 2.2, 'triangle', 0.038, (Math.random()-0.5)*4);
      // pad every 4
      if (idx%4===0){
        playNote(bass[bIdx], 3.8, 'sine', 0.028);
        playNote(bass[bIdx]*2, 3.2, 'triangle', 0.018, 3);
      }
      // shimmer
      if (Math.random()<0.35){
        playNote(notes[(idx+3)%notes.length]*2, 1.1, 'sine', 0.012, 7);
      }
    }, 1650);
  }

  stop(){
    if (this.bedTimer) clearInterval(this.bedTimer);
    this.ctx?.close(); this.ctx=null;
  }
}
