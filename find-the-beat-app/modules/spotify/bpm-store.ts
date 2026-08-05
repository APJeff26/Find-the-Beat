import type { SpotifyTrack } from "./types";

export interface SavedTrackMetadata {
  spotifyTrackId: string;
  songTitle: string;
  artist: string;
  bpm: number;
  lastUpdated: string;
}

const STORAGE_KEY = "find-the-beat:spotify-track-metadata:v1";

export function readSavedTracks(storage: Pick<Storage, "getItem"> = localStorage): Record<string, SavedTrackMetadata> {
  try {
    const value = storage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) as Record<string, SavedTrackMetadata> : {};
  } catch {
    return {};
  }
}

export function saveTrackBpm(
  track: SpotifyTrack,
  bpm: number,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
): SavedTrackMetadata {
  if (!Number.isFinite(bpm) || bpm < 30 || bpm > 300) {
    throw new Error("BPM must be between 30 and 300.");
  }
  const records = readSavedTracks(storage);
  const record: SavedTrackMetadata = {
    spotifyTrackId: track.id,
    songTitle: track.title,
    artist: track.artist,
    bpm: Math.round(bpm * 10) / 10,
    lastUpdated: new Date().toISOString(),
  };
  storage.setItem(STORAGE_KEY, JSON.stringify({ ...records, [track.id]: record }));
  return record;
}

export function attachSavedBpms(
  tracks: readonly SpotifyTrack[],
  records: Record<string, SavedTrackMetadata>,
): SpotifyTrack[] {
  return tracks.map((track) => ({ ...track, bpm: records[track.id]?.bpm ?? null }));
}
