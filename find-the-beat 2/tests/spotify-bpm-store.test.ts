import assert from "node:assert/strict";
import test from "node:test";
import { attachSavedBpms, readSavedTracks, saveTrackBpm } from "../modules/spotify/bpm-store.ts";
import type { SpotifyTrack } from "../modules/spotify/types.ts";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const track = (id: string): SpotifyTrack => ({
  id,
  uri: `spotify:track:${id}`,
  title: "A Song",
  artist: "An Artist",
  album: "An Album",
  artworkUrl: null,
  spotifyUrl: `https://open.spotify.com/track/${id}`,
  durationMs: 120_000,
  isPlayable: true,
  bpm: null,
});

test("saves BPM metadata by exact Spotify Track ID and reads it later", () => {
  const storage = new MemoryStorage();
  const saved = saveTrackBpm(track("track-123"), 112.24, storage);
  const records = readSavedTracks(storage);
  assert.equal(saved.bpm, 112.2);
  assert.equal(records["track-123"].spotifyTrackId, "track-123");
  assert.equal(records["track-123"].songTitle, "A Song");
  assert.ok(records["track-123"].lastUpdated);
  assert.equal(attachSavedBpms([track("track-123")], records)[0].bpm, 112.2);
});

test("does not attach one track's BPM to another track", () => {
  const storage = new MemoryStorage();
  saveTrackBpm(track("one"), 90, storage);
  const attached = attachSavedBpms([track("two")], readSavedTracks(storage));
  assert.equal(attached[0].bpm, null);
});

test("rejects invalid BPM values", () => {
  const storage = new MemoryStorage();
  assert.throws(() => saveTrackBpm(track("one"), 20, storage), /between 30 and 300/);
  assert.throws(() => saveTrackBpm(track("one"), 301, storage), /between 30 and 300/);
});
