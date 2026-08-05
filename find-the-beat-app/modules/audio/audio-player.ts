import type { BeatMap } from "../beat-map/beat-map";

/**
 * Local Web Audio placeholder player. Every sound is scheduled against
 * AudioContext.currentTime, preventing the drift caused by setInterval. Tap
 * timestamps use this same clock. A future file player can keep this contract.
 */
export class SynthDemoPlayer {
  private context: AudioContext | null = null;
  private startTimeSeconds = 0;
  private nodes: AudioScheduledSourceNode[] = [];
  private readonly beatMap: BeatMap;
  private readonly options: { silentCountIn?: boolean };

  constructor(
    beatMap: BeatMap,
    options: { silentCountIn?: boolean } = {},
  ) {
    this.beatMap = beatMap;
    this.options = options;
  }

  async start(): Promise<void> {
    this.stop();
    this.context = new AudioContext();
    await this.context.resume();
    this.startTimeSeconds = this.context.currentTime + 0.08;
    // Team Mode keeps this exact clock but deliberately schedules no count-in
    // audio, so students cannot preview the tempo before the music begins.
    if (!this.options.silentCountIn) this.scheduleCountIn();
    this.scheduleDemoGroove();
  }

  async pause(): Promise<void> {
    await this.context?.suspend();
  }

  async resume(): Promise<void> {
    await this.context?.resume();
  }

  getPositionMs(): number {
    if (!this.context) return 0;
    return Math.max(0, (this.context.currentTime - this.startTimeSeconds) * 1000);
  }

  stop(): void {
    for (const node of this.nodes) {
      try { node.stop(); } catch { /* The source may already have ended. */ }
    }
    this.nodes = [];
    if (this.context) void this.context.close();
    this.context = null;
    this.startTimeSeconds = 0;
  }

  private scheduleCountIn(): void {
    for (let index = 0; index < this.beatMap.countInBeats; index += 1) {
      this.scheduleTone(
        this.startTimeSeconds + (index * this.beatMap.beatIntervalMs) / 1000,
        index === this.beatMap.countInBeats - 1 ? 980 : 760,
        0.08,
        0.18,
        "square",
      );
    }
  }

  private scheduleDemoGroove(): void {
    const melody = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23];
    this.beatMap.beatsMs.forEach((beatMs, index) => {
      const time = this.startTimeSeconds + beatMs / 1000;
      this.scheduleTone(time, index % 4 === 0 ? 130.81 : 146.83, 0.12, 0.34, "sine");
      this.scheduleTone(time, melody[index % melody.length], 0.055, 0.24, "triangle");
      if (index % 2 === 1) this.scheduleTone(time, 1200, 0.018, 0.06, "square");
    });
  }

  private scheduleTone(
    time: number,
    frequency: number,
    volume: number,
    duration: number,
    type: OscillatorType,
  ): void {
    if (!this.context) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
    this.nodes.push(oscillator);
  }
}
