import type { SpotifyTokenSet } from "./types";

const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const TOKEN_KEY = "find-the-beat:spotify-tokens";
const VERIFIER_KEY = "find-the-beat:spotify-verifier";
const STATE_KEY = "find-the-beat:spotify-state";

export const SPOTIFY_SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "streaming",
  "user-read-private",
  "user-modify-playback-state",
  "user-read-playback-state",
].join(" ");

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

export function createRandomString(length = 64): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return toBase64Url(bytes).slice(0, length);
}

export async function createCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return toBase64Url(new Uint8Array(digest));
}

export async function createAuthorizationUrl(
  clientId: string,
  redirectUri: string,
): Promise<string> {
  const verifier = createRandomString(64);
  const state = createRandomString(32);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  const challenge = await createCodeChallenge(verifier);
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
    show_dialog: "true",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function tokenRequest(body: URLSearchParams): Promise<SpotifyTokenSet> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`Spotify authorization failed (${response.status}).`);
  const data = await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function exchangeAuthorizationCode(
  clientId: string,
  redirectUri: string,
  code: string,
  returnedState: string,
): Promise<SpotifyTokenSet> {
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const expectedState = sessionStorage.getItem(STATE_KEY);
  if (!verifier || !expectedState || returnedState !== expectedState) {
    throw new Error("Spotify connection could not be verified. Please try again.");
  }
  const tokens = await tokenRequest(new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  }));
  saveTokens(tokens);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  return tokens;
}

export async function refreshAccessToken(
  clientId: string,
  refreshToken: string,
): Promise<SpotifyTokenSet> {
  const tokens = await tokenRequest(new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  }));
  const merged = { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
  saveTokens(merged);
  return merged;
}

export function saveTokens(tokens: SpotifyTokenSet): void {
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

export function loadTokens(): SpotifyTokenSet | null {
  try {
    const value = sessionStorage.getItem(TOKEN_KEY);
    return value ? JSON.parse(value) as SpotifyTokenSet : null;
  } catch {
    return null;
  }
}

export function clearTokens(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export async function getValidAccessToken(clientId: string): Promise<string | null> {
  const tokens = loadTokens();
  if (!tokens) return null;
  if (tokens.expiresAt > Date.now() + 60_000) return tokens.accessToken;
  if (!tokens.refreshToken) {
    clearTokens();
    return null;
  }
  return (await refreshAccessToken(clientId, tokens.refreshToken)).accessToken;
}
