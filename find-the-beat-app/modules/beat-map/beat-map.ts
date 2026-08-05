/** A beat map stays independent of where its audio comes from. */
export interface BeatMap {
  id: string;
  title: string;
  bpm: number;
  beatIntervalMs: number;
  countInBeats: number;
  songStartMs: number;
  durationMs: number;
  beatsMs: readonly number[];
}

export function createFixedTempoBeatMap(
  id: string,
  title: string,
  bpm: number,
  trackDurationMs: number,
): BeatMap {
  const beatIntervalMs = 60_000 / bpm;
  const countInBeats = 4;
  const songStartMs = countInBeats * beatIntervalMs;
  const scoredDurationMs = Math.min(trackDurationMs, 30_000);
  const beatCount = Math.max(1, Math.floor(scoredDurationMs / beatIntervalMs));
  return {
    id,
    title,
    bpm,
    beatIntervalMs,
    countInBeats,
    songStartMs,
    durationMs: songStartMs + scoredDurationMs,
    beatsMs: Array.from({ length: beatCount }, (_, index) => songStartMs + index * beatIntervalMs),
  };
}
