import assert from "node:assert/strict";
import test from "node:test";
import { createFixedTempoBeatMap } from "../modules/beat-map/beat-map.ts";

test("builds a four-beat count-in and fixed-tempo scoring map from saved BPM", () => {
  const map = createFixedTempoBeatMap("spotify-id", "Test Song", 120, 180_000);
  assert.equal(map.beatIntervalMs, 500);
  assert.equal(map.songStartMs, 2_000);
  assert.equal(map.durationMs, 32_000);
  assert.equal(map.beatsMs[0], 2_000);
  assert.equal(map.beatsMs[1], 2_500);
  assert.equal(map.beatsMs.length, 60);
});
