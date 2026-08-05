import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanClassPlayName,
  isAppropriateClassPlayName,
  makeUniqueClassPlayName,
} from "../modules/class-play/player-names.ts";

test("cleans markup, control characters, spacing, and excessive length", () => {
  assert.equal(cleanClassPlayName("  <b>Jordan</b>   Beat\u0000  "), "Jordan Beat");
  assert.equal(cleanClassPlayName("A".repeat(40)).length, 20);
});

test("rejects blank and basic inappropriate classroom names", () => {
  assert.equal(cleanClassPlayName("<script></script>"), "");
  assert.equal(isAppropriateClassPlayName("nice nickname"), true);
  assert.equal(isAppropriateClassPlayName("s-h-i-t"), false);
});

test("adds stable numeric suffixes for duplicate names", () => {
  assert.equal(makeUniqueClassPlayName("Jordan", []), "Jordan");
  assert.equal(makeUniqueClassPlayName("Jordan", ["Jordan"]), "Jordan 2");
  assert.equal(makeUniqueClassPlayName("Jordan", ["Jordan", "Jordan 2"]), "Jordan 3");
});
