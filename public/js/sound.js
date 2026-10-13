// Procedural industrial soundscapes; all layers share a cancellable master bus.
class BunkerSoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volume = 0.7;
    this.sources = new Set();
  }
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
    }
    if (!this.master) {
      this.master = this.ctx.createGain();
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.ratio.value = 6;
      this.master.connect(compressor);
      compressor.connect(this.ctx.destination);
      this.master.gain.value = this.muted ? 0 : this.volume * 0.65;
    }
    if (this.ctx.state === 'suspended' && typeof this.ctx.startRendering !== 'function')
      this.ctx.resume().catch(() => {});
  }
  stop() {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {}
    }
    this.sources.clear();
  }
  setMuted(muted) {
    this.muted = muted;
    if (muted) this.stop();
    if (this.master)
      this.master.gain.setTargetAtTime(muted ? 0 : this.volume * 0.65, this.ctx.currentTime, 0.02);
  }
  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.master)
      this.master.gain.setTargetAtTime(
        this.muted ? 0 : this.volume * 0.65,
        this.ctx.currentTime,
        0.02,
      );
  }
  layer(source, duration, delay, level, filter) {
    const time = this.ctx.currentTime + delay;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(level, time + Math.min(0.08, duration / 5));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter || gain);
    if (filter) filter.connect(gain);
    gain.connect(this.master);
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
      if (filter) filter.disconnect();
      gain.disconnect();
    };
    source.start(time);
    source.stop(time + duration);
    return time;
  }
  tone(frequency, duration = 1, delay = 0, level = 0.15, type = 'sine', end = frequency) {
    const oscillator = this.ctx.createOscillator();
    oscillator.type = type;
    const time = this.layer(oscillator, duration, delay, level);
    oscillator.frequency.setValueAtTime(frequency, time);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), time + duration);
    return oscillator;
  }
  air(duration = 3, delay = 0, level = 0.22) {
    const buffer = this.ctx.createBuffer(
      1,
      Math.ceil(this.ctx.sampleRate * duration),
      this.ctx.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const time = this.layer(source, duration, delay, level, filter);
    filter.frequency.setValueAtTime(1600, time);
    filter.frequency.exponentialRampToValueAtTime(90, time + duration);
  }
  impact(delay = 0) {
    this.tone(110, 1.8, delay, 0.45, 'triangle', 30);
    [173, 263, 417].forEach((f) => this.tone(f, 2.8, delay, 0.08, 'sine', f * 0.96));
    this.air(0.45, delay, 0.3);
  }
  drone(duration = 6) {
    this.tone(42, duration, 0, 0.2, 'sine', 36);
    this.tone(64, duration, 0, 0.09, 'triangle', 55);
  }
  radio(delay = 0) {
    [720, 960, 720].forEach((f, i) => this.tone(f, 0.16, delay + i * 0.24, 0.15, 'sine'));
  }
  siren(duration = 5) {
    const oscillator = this.tone(310, duration, 0, 0.1, 'triangle');
    const time = this.ctx.currentTime;
    for (let i = 1; i <= Math.floor(duration / 0.5); i++)
      oscillator.frequency.linearRampToValueAtTime(i % 2 ? 710 : 310, time + i * 0.5);
  }
  play(cue) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    try {
      if (cue === 'tick') {
        this.tone(800, 0.04, 0, 0.1, 'triangle');
        return;
      }
      if (cue === 'speaker_start') {
        this.radio();
        return;
      }
      this.stop();
      switch (cue) {
        case 'exile_stamp':
          this.drone(7);
          this.siren(5);
          this.air(3.8, 0.6);
          this.impact(1.25);
          this.radio(5.8);
          break;
        case 'bunker_reveal':
          this.drone(6);
          this.air(3.6, 0.3);
          this.impact(1.2);
          this.radio(4.8);
          break;
        case 'alarm':
        case 'catastrophe_alarm':
          this.drone(8);
          this.siren(7);
          this.impact(0.2);
          this.air(4, 1);
          break;
        case 'threat_alarm':
          this.drone(6);
          this.siren(5);
          this.radio(4.7);
          break;
        case 'victory':
        case 'readmit':
          this.drone(cue === 'victory' ? 7 : 4);
          [130.81, 164.81, 196, 261.63].forEach((f, i) =>
            this.tone(f, 4, i * 0.65, 0.12, 'triangle'),
          );
          this.air(2, 0.3, 0.08);
          break;
        case 'vote_open':
        case 'vote_result':
        case 'round_transition':
          this.drone(4);
          this.impact(0.2);
          this.radio(2.8);
          break;
        case 'gong':
          this.impact();
          this.drone(3.5);
          break;
        case 'card_reveal':
          this.air(1.8, 0, 0.12);
          this.radio(0.3);
          [220, 277.18, 329.63].forEach((f) => this.tone(f, 3, 0.4, 0.08, 'triangle'));
          break;
        default:
          this.radio();
      }
    } catch (error) {
      console.warn('Audio play error:', error);
    }
  }
}
window.soundEngine = new BunkerSoundEngine();
