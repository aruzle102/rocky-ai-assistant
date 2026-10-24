/** Generated sound design — WebAudio only, no audio files, no copyrighted audio.
 * Every sound is synthesised on-device. The intro hum is a low sine drone;
 * UI sounds are short, quiet, and restrained (no loops, no fanfares). */

export class RockySfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private humOsc: OscillatorNode | null = null;
  private humGain: GainNode | null = null;
  enabled = true;
  volume = 0.7;

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    return this.ctx;
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
  }

  private tone(freq: number, durMs: number, type: OscillatorType, vol: number, delayMs = 0, slideTo?: number) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delayMs / 1000;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + durMs / 1000);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + durMs / 1000 + 0.05);
  }

  tap() { this.tone(880, 60, 'sine', 0.12); }
  chime() { this.tone(660, 180, 'sine', 0.12); this.tone(990, 220, 'sine', 0.10, 90); }
  tick() { this.tone(1250, 35, 'sine', 0.05); }
  success() { this.tone(523, 140, 'sine', 0.12); this.tone(659, 140, 'sine', 0.12, 110); this.tone(784, 200, 'sine', 0.10, 220); }
  error() { this.tone(180, 220, 'sawtooth', 0.08, 0, 120); }

  startHum() {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx || !this.master || this.humOsc) return;
    this.humOsc = ctx.createOscillator();
    this.humGain = ctx.createGain();
    this.humOsc.type = 'sine';
    this.humOsc.frequency.value = 55;
    this.humGain.gain.setValueAtTime(0, ctx.currentTime);
    this.humGain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.8);
    this.humOsc.connect(this.humGain); this.humGain.connect(this.master);
    this.humOsc.start();
  }

  stopHum() {
    if (!this.ctx || !this.humOsc || !this.humGain) return;
    const t = this.ctx.currentTime;
    this.humGain.gain.setTargetAtTime(0, t, 0.15);
    const osc = this.humOsc;
    window.setTimeout(() => { try { osc.stop(); } catch { /* already stopped */ } }, 600);
    this.humOsc = null; this.humGain = null;
  }

  stopAll() { this.stopHum(); }
}
