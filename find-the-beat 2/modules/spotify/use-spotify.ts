"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearTokens,
  createAuthorizationUrl,
  exchangeAuthorizationCode,
  getValidAccessToken,
  loadTokens,
} from "./auth";
import { getAllPlaylistTracks, getAllPlaylists, getSpotifyProfile } from "./api";
import { attachSavedBpms, readSavedTracks, saveTrackBpm } from "./bpm-store";
import { SpotifyPlaybackController } from "./sdk-player";
import type { SpotifyConnection, SpotifyPlaylist, SpotifyTrack } from "./types";

const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? "";
const configuredRedirectUri = process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI ?? "";

function getRedirectUri(): string {
  return configuredRedirectUri || `${window.location.origin}/api/spotify/callback`;
}

export function useSpotify() {
  const [connection, setConnection] = useState<SpotifyConnection>({
    status: clientId ? "disconnected" : "unconfigured",
    displayName: null,
    error: null,
  });
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [loading, setLoading] = useState(false);
  const playbackRef = useRef<SpotifyPlaybackController | null>(null);

  const getToken = useCallback(() => getValidAccessToken(clientId), []);

  useEffect(() => {
    playbackRef.current = new SpotifyPlaybackController(getToken);
    return () => playbackRef.current?.disconnect();
  }, [getToken]);

  const establishConnection = useCallback(async () => {
    if (!clientId) return;
    const token = await getToken();
    if (!token) {
      setConnection({ status: "disconnected", displayName: null, error: null });
      return;
    }
    try {
      const profile = await getSpotifyProfile(token);
      if (profile.product !== "premium") {
        clearTokens();
        setConnection({
          status: "error",
          displayName: null,
          error: "Spotify Premium is required for classroom playback.",
        });
        return;
      }
      setConnection({ status: "connected", displayName: profile.displayName, error: null });
    } catch (error) {
      clearTokens();
      setConnection({
        status: "error",
        displayName: null,
        error: error instanceof Error ? error.message : "Spotify disconnected.",
      });
    }
  }, [getToken]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const oauthError = params.get("error");
    if (oauthError) {
      setConnection({ status: "error", displayName: null, error: "Spotify connection was cancelled." });
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }
    if (code && state && clientId) {
      setConnection({ status: "connecting", displayName: null, error: null });
      void exchangeAuthorizationCode(clientId, getRedirectUri(), code, state)
        .then(establishConnection)
        .catch((error: unknown) => setConnection({
          status: "error",
          displayName: null,
          error: error instanceof Error ? error.message : "Spotify connection failed.",
        }))
        .finally(() => window.history.replaceState({}, "", window.location.pathname));
    } else if (loadTokens()) {
      void establishConnection();
    }
  }, [establishConnection]);

  const connect = useCallback(async () => {
    if (!clientId) return;
    setConnection({ status: "connecting", displayName: null, error: null });
    window.location.assign(await createAuthorizationUrl(clientId, getRedirectUri()));
  }, []);

  const disconnect = useCallback(() => {
    playbackRef.current?.disconnect();
    clearTokens();
    setConnection({ status: clientId ? "disconnected" : "unconfigured", displayName: null, error: null });
    setPlaylists([]);
    setTracks([]);
    setSelectedPlaylistId("");
  }, []);

  const loadPlaylists = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Connect Spotify to view playlists.");
      setPlaylists(await getAllPlaylists(token));
    } catch (error) {
      setConnection((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Could not load playlists.",
      }));
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const loadPlaylist = useCallback(async (playlistId: string) => {
    setSelectedPlaylistId(playlistId);
    setTracks([]);
    if (!playlistId) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Spotify is disconnected.");
      const loaded = await getAllPlaylistTracks(playlistId, token);
      setTracks(attachSavedBpms(loaded, readSavedTracks()));
    } catch (error) {
      setConnection((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Could not load playlist songs.",
      }));
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const updateBpm = useCallback((trackId: string, bpm: number) => {
    setTracks((current) => current.map((track) => {
      if (track.id !== trackId) return track;
      saveTrackBpm(track, bpm);
      return { ...track, bpm };
    }));
  }, []);

  const selectedPlaylist = useMemo(
    () => playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? null,
    [playlists, selectedPlaylistId],
  );

  return {
    clientConfigured: Boolean(clientId),
    connection,
    playlists,
    tracks,
    selectedPlaylist,
    selectedPlaylistId,
    loading,
    playback: playbackRef,
    connect,
    disconnect,
    loadPlaylists,
    loadPlaylist,
    updateBpm,
    getToken,
  };
}
