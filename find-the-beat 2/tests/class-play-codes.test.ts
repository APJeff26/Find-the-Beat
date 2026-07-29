import assert from "node:assert/strict";
import test from "node:test";
import { createClassPlayJoinCode } from "../modules/class-play/session-codes.ts";

test("creates short classroom-friendly join codes", () => {
  const code = createClassPlayJoinCode(new Uint8Array([0, 1, 2, 3, 4, 5]));
  assert.equal(code.length, 6);
  assert.match(code, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
  assert.doesNotMatch(code, /[01IO]/);
});

test("requires enough cryptographic input for a complete code", () => {
  assert.throws(() => createClassPlayJoinCode(new Uint8Array([1, 2])), /At least 6/);
});
