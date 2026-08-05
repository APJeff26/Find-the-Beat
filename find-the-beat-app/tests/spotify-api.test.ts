import assert from "node:assert/strict";
import test from "node:test";
import { normalizePlaylist } from "../modules/spotify/api.ts";

test("normalizes playlists when Spotify returns null artwork and links", () => {
  const playlist = normalizePlaylist({
    id: "playlist-123",
    name: "Classroom Songs",
    images: null,
    items: { total: 12 },
    external_urls: null,
  });

  assert.equal(playlist.imageUrl, null);
  assert.equal(playlist.trackCount, 12);
  assert.equal(playlist.spotifyUrl, "https://open.spotify.com/playlist/playlist-123");
});

test("uses the first playlist artwork when it is available", () => {
  const playlist = normalizePlaylist({
    id: "playlist-456",
    name: "Beat Practice",
    images: [{ url: "https://i.scdn.co/image/example" }],
    tracks: { total: 8 },
    external_urls: { spotify: "https://open.spotify.com/playlist/playlist-456" },
  });

  assert.equal(playlist.imageUrl, "https://i.scdn.co/image/example");
  assert.equal(playlist.trackCount, 8);
});
