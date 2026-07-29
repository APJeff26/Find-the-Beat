import assert from "node:assert/strict";
import test from "node:test";
import {
  createSongPool,
  consumeCurrentSong,
  currentSong,
  restoreLastUsedSong,
  skipCurrentSong,
} from "../modules/spotify/song-pool.ts";
import type { SpotifyTrack } from "../modules/spotify/types.ts";

const track = (id: string): SpotifyTrack => ({
  id,
  uri: `spotify:track:${id}`,
  title: `Song ${id}`,
  artist: "Test Artist",
  album: "Test Album",
  artworkUrl: null,
  spotifyUrl: `https://open.spotify.com/track/${id}`,
  durationMs: 180_000,
  isPlayable: true,
  bpm: 100,
});

test("creates one randomized pool with duplicate track IDs removed", () => {
  const pool = createSongPool([track("a"), track("b"), track("a"), track("c")], () => 0);
  assert.equal(pool.available.length, 3);
  assert.deepEqual([...new Set(pool.available.map((song) => song.id))].length, 3);
  assert.equal(pool.used.length, 0);
});

test("using songs removes each song from availability without repeats", () => {
  let pool = createSongPool([track("a"), track("b"), track("c")], () => 0.5);
  const played: string[] = [];
  while (currentSong(pool)) {
    played.push(currentSong(pool)!.id);
    pool = consumeCurrentSong(pool);
  }
  assert.equal(new Set(played).size, 3);
  assert.equal(pool.available.length, 0);
  assert.equal(pool.used.length, 3);
});

test("skip rotates a song to the end and undo restores the last used song", () => {
  const original = createSongPool([track("a"), track("b"), track("c")], () => 0.999);
  const first = currentSong(original)!;
  const skipped = skipCurrentSong(original);
  assert.notEqual(currentSong(skipped)?.id, first.id);
  assert.equal(skipped.available.at(-1)?.id, first.id);

  const used = consumeCurrentSong(skipped);
  const restored = restoreLastUsedSong(used);
  assert.equal(currentSong(restored)?.id, currentSong(skipped)?.id);
  assert.equal(restored.used.length, 0);
});
