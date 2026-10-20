export class Sound {
  constructor() {
    this.enabled = localStorage.getItem('snake:muted') !== '1';
    this.context = null;
  }
  ensureContext() {
    if (this.context) {
      if (this.context.state === 'suspended') this.context.resume();
      return this.context;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    this.context = new AudioContextClass();
    return this.context;
  }
  tone({ from, to = from, duration = 0.12, type = 'triangle', volume = 0.05 }) {
    if (!this.enabled) return;
    const context = this.ensureContext();
    if (!context) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }
  eat() {
    this.tone({ from: 620, to: 940, duration: 0.1, type: 'triangle', volume: 0.06 });
  }
  start() {
    this.tone({ from: 320, to: 520, duration: 0.12, type: 'sine', volume: 0.05 });
    setTimeout(() => this.tone({ from: 520, to: 720, duration: 0.12, type: 'sine', volume: 0.05 }), 90);
  }
  die() {
    this.tone({ from: 240, to: 60, duration: 0.5, type: 'sawtooth', volume: 0.06 });
  }
  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('snake:muted', this.enabled ? '0' : '1');
    if (this.enabled) this.tone({ from: 700, to: 900, duration: 0.08, volume: 0.04 });
    return this.enabled;
  }
}
