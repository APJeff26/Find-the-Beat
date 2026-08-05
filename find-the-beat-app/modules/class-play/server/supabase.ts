import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { ClassPlayLobbyState, ClassPlayPlayer } from "../types";

export interface SessionRow {
  id: string;
  code: string;
  teacher_token: string;
  lobby_channel: string;
  status: "lobby" | "ready" | "cancelled";
  locked: boolean;
  max_players: number;
  playlist_name: string;
  planned_songs: number;
  updated_at: string;
  expires_at: string;
}

export interface PlayerRow {
  id: string;
  session_id: string;
  reconnect_token: string;
  display_name: string;
  joined_at: string;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function getClassPlayDatabase() {
  return createClient(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 1 } },
    },
  );
}

export async function removeExpiredSessions(): Promise<void> {
  const database = getClassPlayDatabase();
  await database.from("class_play_sessions").delete().lt("expires_at", new Date().toISOString());
}

export async function getActiveSession(code: string): Promise<SessionRow | null> {
  const database = getClassPlayDatabase();
  const { data, error } = await database
    .from("class_play_sessions")
    .select("*")
    .eq("code", code.toUpperCase())
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  return data as SessionRow | null;
}

export async function getLobby(session: SessionRow): Promise<ClassPlayLobbyState> {
  const database = getClassPlayDatabase();
  const { data, error } = await database
    .from("class_play_players")
    .select("id, display_name, joined_at")
    .eq("session_id", session.id)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  const players: ClassPlayPlayer[] = (data ?? []).map((player) => ({
    id: String(player.id),
    displayName: String(player.display_name),
    connected: false,
    joinedAt: new Date(String(player.joined_at)).getTime(),
  }));
  return {
    code: session.code,
    status: session.status,
    locked: session.locked,
    maxPlayers: session.max_players,
    playlistName: session.playlist_name,
    plannedSongs: session.planned_songs,
    players,
  };
}

export async function broadcastLobby(session: SessionRow, lobby: ClassPlayLobbyState): Promise<void> {
  const url = requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(
    `${url}/realtime/v1/api/broadcast/${encodeURIComponent(`class-play:${session.lobby_channel}`)}/events/lobby`,
    {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ lobby }),
    },
  );
  if (!response.ok) throw new Error(`Could not broadcast lobby update (${response.status}).`);
}

export const jsonError = (message: string, status: number) =>
  Response.json({ error: message }, { status });
