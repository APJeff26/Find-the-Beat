import type { SpotifyPlaylist, SpotifyTrack } from "./types";

const API_URL = "https://api.spotify.com/v1";

async function spotifyFetch<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  if (!response.ok) {
    const message = response.status === 403
      ? "Spotify only allows this app to load playlists you own or collaborate on."
      : `Spotify request failed (${response.status}).`;
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

interface Page<T> {
  items: T[];
  next: string | null;
  offset: number;
  limit: number;
  total: number;
}

interface SpotifyPlaylistApiItem {
  id: string;
  name: string;
  images: { url: string }[] | null;
  items?: { total: number } | null;
  tracks?: { total: number } | null;
  external_urls?: { spotify?: string } | null;
}

/**
 * Spotify may return null artwork (especially for empty or newly-created
 * playlists). Normalize API data at this boundary so the UI never has to
 * understand Spotify's nullable response shapes.
 */
export function normalizePlaylist(playlist: SpotifyPlaylistApiItem): SpotifyPlaylist {
  return {
    id: playlist.id,
    name: playlist.name,
    imageUrl: playlist.images?.[0]?.url ?? null,
    trackCount: playlist.items?.total ?? playlist.tracks?.total ?? 0,
    spotifyUrl: playlist.external_urls?.spotify ?? `https://open.spotify.com/playlist/${playlist.id}`,
  };
}

export async function getSpotifyProfile(accessToken: string): Promise<{ displayName: string; product: string }> {
  const data = await spotifyFetch<{ display_name: string | null; product?: string }>("/me", accessToken);
  return {
    displayName: data.display_name || "Spotify teacher",
    product: data.product || "unknown",
  };
}

export async function getAllPlaylists(accessToken: string): Promise<SpotifyPlaylist[]> {
  const playlists: SpotifyPlaylist[] = [];
  let offset = 0;
  while (true) {
    const page = await spotifyFetch<Page<SpotifyPlaylistApiItem>>(
      `/me/playlists?limit=50&offset=${offset}`,
      accessToken,
    );
    playlists.push(...page.items.map(normalizePlaylist));
    if (!page.next) break;
    offset += page.limit;
  }
  return playlists;
}

export async function getAllPlaylistTracks(
  playlistId: string,
  accessToken: string,
): Promise<SpotifyTrack[]> {
  const tracks: SpotifyTrack[] = [];
  let offset = 0;
  while (true) {
    const page = await spotifyFetch<Page<{
      item?: {
        id: string | null;
        uri: string;
        name: string;
        type: string;
        duration_ms: number;
        is_playable?: boolean;
        is_local?: boolean;
        external_urls?: { spotify?: string } | null;
        artists?: { name: string }[];
        album?: { name: string; images: { url: string }[] | null } | null;
      } | null;
      track?: {
        id: string | null;
        uri: string;
        name: string;
        type: string;
        duration_ms: number;
        is_playable?: boolean;
        is_local?: boolean;
        external_urls?: { spotify?: string } | null;
        artists?: { name: string }[];
        album?: { name: string; images: { url: string }[] | null } | null;
      } | null;
    }>>(`/playlists/${encodeURIComponent(playlistId)}/items?limit=50&offset=${offset}&additional_types=track`, accessToken);

    for (const wrapper of page.items) {
      const item = wrapper.item ?? wrapper.track;
      if (!item || item.type !== "track" || !item.id || item.is_local) continue;
      tracks.push({
        id: item.id,
        uri: item.uri,
        title: item.name,
        artist: item.artists?.map((artist) => artist.name).join(", ") || "Unknown artist",
        album: item.album?.name || "",
        artworkUrl: item.album?.images?.[0]?.url ?? null,
        spotifyUrl: item.external_urls?.spotify ?? `https://open.spotify.com/track/${item.id}`,
        durationMs: item.duration_ms,
        isPlayable: item.is_playable !== false,
        bpm: null,
      });
    }
    if (!page.next) break;
    offset += page.limit;
  }
  return tracks.filter((track) => track.isPlayable);
}

export async function transferPlayback(
  accessToken: string,
  deviceId: string,
): Promise<void> {
  await spotifyFetch<void>("/me/player", accessToken, {
    method: "PUT",
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
  });
}

export async function playSpotifyTrack(
  accessToken: string,
  deviceId: string,
  uri: string,
): Promise<void> {
  await spotifyFetch<void>(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, accessToken, {
    method: "PUT",
    body: JSON.stringify({ uris: [uri], position_ms: 0 }),
  });
}
