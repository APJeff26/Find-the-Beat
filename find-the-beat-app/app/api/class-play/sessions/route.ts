import { DEFAULT_CLASS_PLAY_PLAYER_LIMIT } from "../../../../modules/class-play/config";
import { randomClassPlayJoinCode } from "../../../../modules/class-play/session-codes";
import {
  getClassPlayDatabase,
  getLobby,
  jsonError,
  removeExpiredSessions,
  type SessionRow,
} from "../../../../modules/class-play/server/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = await request.json() as {
      maxPlayers?: number;
      playlistName?: string;
      plannedSongs?: number;
    };
    const configuredMaximum = Math.max(
      1,
      Number(process.env.NEXT_PUBLIC_CLASS_PLAY_MAX_PLAYERS) || DEFAULT_CLASS_PLAY_PLAYER_LIMIT,
    );
    const maxPlayers = Math.min(
      configuredMaximum,
      Math.max(1, Number(input.maxPlayers) || configuredMaximum),
    );
    const playlistName = String(input.playlistName || "Spotify playlist").trim().slice(0, 100);
    const plannedSongs = Math.max(1, Math.min(100, Number(input.plannedSongs) || 1));
    const database = getClassPlayDatabase();
    await removeExpiredSessions();

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const teacherToken = crypto.randomUUID();
      const lobbyChannel = crypto.randomUUID();
      const { data, error } = await database
        .from("class_play_sessions")
        .insert({
          code: randomClassPlayJoinCode(),
          teacher_token: teacherToken,
          lobby_channel: lobbyChannel,
          max_players: maxPlayers,
          playlist_name: playlistName,
          planned_songs: plannedSongs,
        })
        .select("*")
        .single();
      if (error?.code === "23505") continue;
      if (error) throw error;
      const session = data as SessionRow;
      return Response.json({
        teacherToken,
        lobbyChannel,
        lobby: await getLobby(session),
      }, { status: 201 });
    }
    return jsonError("Could not reserve a unique game code. Try again.", 503);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Could not create Class Play.",
      500,
    );
  }
}
