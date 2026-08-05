import assert from "node:assert/strict";
import test from "node:test";
import { evaluateTaps } from "../modules/evaluation/tap-evaluation.ts";
import type { RecordedTap } from "../modules/taps/tap-recorder.ts";

const tapsAt = (...times: number[]): RecordedTap[] =>
  times.map((audioTimeMs) => ({ audioTimeMs, inputTimeMs: audioTimeMs }));

test("awards perfect scores for taps exactly on every beat", () => {
  const result = evaluateTaps([1000, 1600, 2200, 2800], tapsAt(1000, 1600, 2200, 2800));
  assert.equal(result.accuracyScore, 100);
  assert.equal(result.consistencyScore, 100);
  assert.equal(result.matchedBeats, 4);
  assert.equal(result.extraTaps, 0);
});

test("consistent early taps remain steady while losing some accuracy", () => {
  const result = evaluateTaps([1000, 1600, 2200, 2800], tapsAt(900, 1500, 2100, 2700));
  assert.equal(result.accuracyScore, 67);
  assert.equal(result.consistencyScore, 100);
});

test("irregular taps reduce consistency", () => {
  const result = evaluateTaps([1000, 1600, 2200, 2800], tapsAt(820, 1720, 2050, 2990));
  assert.ok(result.consistencyScore < 40);
  assert.equal(result.matchedBeats, 4);
});

test("missed beats reduce both coverage-based scores", () => {
  const result = evaluateTaps([1000, 1600, 2200, 2800], tapsAt(1000, 1600));
  assert.equal(result.accuracyScore, 50);
  assert.equal(result.consistencyScore, 50);
  assert.equal(result.missedBeats, 2);
});

test("extra taps are not matched more than once", () => {
  const result = evaluateTaps([1000, 1600], tapsAt(1000, 1080, 1600, 2100));
  assert.equal(result.matchedBeats, 2);
  assert.equal(result.extraTaps, 2);
});

test("taps outside the matching window are not counted", () => {
  const result = evaluateTaps([1000], tapsAt(699, 1301));
  assert.equal(result.matchedBeats, 0);
  assert.equal(result.accuracyScore, 0);
  assert.equal(result.extraTaps, 2);
});
