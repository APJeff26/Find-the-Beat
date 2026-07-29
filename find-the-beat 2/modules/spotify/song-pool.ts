import type { SpotifyTrack } from "./types";

export interface SongPool {
  available: readonly SpotifyTrack[];
  used: readonly SpotifyTrack[];
}

export function shuffleSongs(
  songs: readonly SpotifyTrack[],
  random: () => number = Math.random,
): SpotifyTrack[] {
  const shuffled = [...songs];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function createSongPool(songs: readonly SpotifyTrack[], random: () => number = Math.random): SongPool {
  const unique = [...new Map(songs.map((song) => [song.id, song])).values()];
  return { available: shuffleSongs(unique, random), used: [] };
}

export const currentSong = (pool: SongPool): SpotifyTrack | null => pool.available[0] ?? null;

export function consumeCurrentSong(pool: SongPool): SongPool {
  const song = currentSong(pool);
  if (!song) return pool;
  return { available: pool.available.slice(1), used: [...pool.used, song] };
}

/** Skipping rotates the current song to the end without marking it used. */
export function skipCurrentSong(pool: SongPool): SongPool {
  if (pool.available.length < 2) return pool;
  return { ...pool, available: [...pool.available.slice(1), pool.available[0]] };
}

export function restoreLastUsedSong(pool: SongPool): SongPool {
  const song = pool.used.at(-1);
  if (!song) return pool;
  return {
    available: [song, ...pool.available],
    used: pool.used.slice(0, -1),
  };
}
