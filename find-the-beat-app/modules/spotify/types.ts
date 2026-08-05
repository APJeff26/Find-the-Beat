export interface SpotifyPlaylist {
  id: string;
  name: string;
  imageUrl: string | null;
  trackCount: number;
  spotifyUrl: string;
}

export interface SpotifyTrack {
  id: string;
  uri: string;
  title: string;
  artist: string;
  album: string;
  artworkUrl: string | null;
  spotifyUrl: string;
  durationMs: number;
  isPlayable: boolean;
  bpm: number | null;
}

export interface SpotifyTokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
}

export interface SpotifyConnection {
  status: "unconfigured" | "disconnected" | "connecting" | "connected" | "error";
  displayName: string | null;
  error: string | null;
}
