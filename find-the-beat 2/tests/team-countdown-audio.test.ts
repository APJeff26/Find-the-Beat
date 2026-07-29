import assert from "node:assert/strict";
import test from "node:test";
import { SynthDemoPlayer } from "../modules/audio/audio-player.ts";
import { DEMO_BEAT_MAP } from "../modules/beat-map/demo-beat-map.ts";

class FakeAudioContext {
  currentTime = 10;
  destination = {};
  starts: number[] = [];
  resume() { return Promise.resolve(); }
  suspend() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
  createGain() {
    return {
      gain: {
        setValueAtTime() {},
        exponentialRampToValueAtTime() {},
      },
      connect() { return this; },
    };
  }
  createOscillator() {
    return {
      type: "sine",
      frequency: { setValueAtTime() {} },
      connect() { return this; },
      start: (time: number) => { this.starts.push(time); },
      stop() {},
    };
  }
}

test("Team Mode schedules no sound before the unchanged song start", async () => {
  const originalAudioContext = globalThis.AudioContext;
  const contexts: FakeAudioContext[] = [];
  globalThis.AudioContext = class extends FakeAudioContext {
    constructor() {
      super();
      contexts.push(this);
    }
  } as unknown as typeof AudioContext;

  try {
    const player = new SynthDemoPlayer(DEMO_BEAT_MAP, { silentCountIn: true });
    await player.start();
    const context = contexts[0];
    const timelineStart = context.currentTime + 0.08;
    const firstMusicTime = timelineStart + DEMO_BEAT_MAP.songStartMs / 1000;
    assert.ok(context.starts.length > 0, "the demo music should still be scheduled");
    assert.ok(context.starts.every((time) => time >= firstMusicTime));
    player.stop();
  } finally {
    globalThis.AudioContext = originalAudioContext;
  }
});

test("Solo Practice retains its audible count-in", async () => {
  const originalAudioContext = globalThis.AudioContext;
  const contexts: FakeAudioContext[] = [];
  globalThis.AudioContext = class extends FakeAudioContext {
    constructor() {
      super();
      contexts.push(this);
    }
  } as unknown as typeof AudioContext;

  try {
    const player = new SynthDemoPlayer(DEMO_BEAT_MAP);
    await player.start();
    const context = contexts[0];
    const timelineStart = context.currentTime + 0.08;
    const firstMusicTime = timelineStart + DEMO_BEAT_MAP.songStartMs / 1000;
    assert.ok(context.starts.some((time) => time < firstMusicTime));
    player.stop();
  } finally {
    globalThis.AudioContext = originalAudioContext;
  }
});
