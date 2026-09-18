import type { Settings } from './storage';
export class Sound {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private last = 0;
  settings: Settings;
  constructor(settings: Settings) {
    this.settings = settings;
  }
  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }
  play(type: string) {
    if (!this.settings.sound || !this.ctx || !this.gain) return;
    const t = this.ctx.currentTime;
    if (t - this.last < 0.06) return;
    this.last = t;
    this.gain.gain.value = this.settings.volume * 0.32;
    const o = this.ctx.createOscillator(),
      g = this.ctx.createGain();
    o.connect(g);
    g.connect(this.gain);
    o.type = type === 'hit' ? 'triangle' : 'sine';
    const f =
      type === 'hit'
        ? 110
        : type === 'heal'
          ? 660
          : type === 'break'
            ? 230
            : type === 'won'
              ? 880
              : 330;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(type === 'hit' ? 40 : f * 1.5, t + 0.18);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.start(t);
    o.stop(t + 0.31);
  }
  dispose() {
    void this.ctx?.close();
  }
}
