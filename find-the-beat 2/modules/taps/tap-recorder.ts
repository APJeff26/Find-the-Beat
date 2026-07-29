export interface RecordedTap {
  /** Position on the shared audio timeline, including the count-in. */
  audioTimeMs: number;
  /** High-resolution wall-clock timestamp retained for future diagnostics. */
  inputTimeMs: number;
}

export class TapRecorder {
  private taps: RecordedTap[] = [];

  record(audioTimeMs: number, inputTimeMs: number): RecordedTap {
    const tap = { audioTimeMs, inputTimeMs };
    this.taps.push(tap);
    return tap;
  }

  getTaps(): readonly RecordedTap[] {
    return [...this.taps];
  }

  clear(): void {
    this.taps = [];
  }
}
