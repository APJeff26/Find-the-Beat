import assert from "node:assert/strict";
import test from "node:test";
import { shouldRecordRhythmPointer } from "../modules/taps/pointer-input.ts";

test("accepts one primary touchscreen contact", () => {
  assert.equal(shouldRecordRhythmPointer({ isPrimary: true, pointerType: "touch", button: 0 }), true);
});

test("ignores secondary touchscreen contacts to prevent duplicate taps", () => {
  assert.equal(shouldRecordRhythmPointer({ isPrimary: false, pointerType: "touch", button: 0 }), false);
});

test("accepts primary mouse clicks and rejects other mouse buttons", () => {
  assert.equal(shouldRecordRhythmPointer({ isPrimary: true, pointerType: "mouse", button: 0 }), true);
  assert.equal(shouldRecordRhythmPointer({ isPrimary: true, pointerType: "mouse", button: 2 }), false);
});
