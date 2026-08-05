import type { BeatMap } from "./beat-map";

const BPM = 100;
const BEAT_INTERVAL_MS = 60_000 / BPM;
const COUNT_IN_BEATS = 4;
const SONG_BEATS = 24;
const SONG_START_MS = COUNT_IN_BEATS * BEAT_INTERVAL_MS;

/** Fixed timestamps measured from playback start, including the count-in. */
export const DEMO_BEAT_MAP: BeatMap = {
  id: "demo-groove-100",
  title: "Demo Groove",
  bpm: BPM,
  beatIntervalMs: BEAT_INTERVAL_MS,
  countInBeats: COUNT_IN_BEATS,
  songStartMs: SONG_START_MS,
  durationMs: SONG_START_MS + SONG_BEATS * BEAT_INTERVAL_MS,
  beatsMs: Array.from(
    { length: SONG_BEATS },
    (_, index) => SONG_START_MS + index * BEAT_INTERVAL_MS,
  ),
};
