import type { ClassPlayLobbyCommand } from "../../../../../../modules/class-play/types";
import {
  broadcastLobby,
  getActiveSession,
  getClassPlayDatabase,
  getLobby,
  jsonError,
  type SessionRow,
} from "../../../../../../modules/class-play/server/supabase";

export const runtime = "nodejs";

const bearerToken = (request: Request) =>
  request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const session = await getActiveSession(code);
    if (!session) return jsonError("Session expired.", 404);
    if (bearerToken(request) !== session.teacher_token) return jsonError("Teacher access required.", 403);
    const command = await request.json() as ClassPlayLobbyCommand;
    const database = getClassPlayDatabase();

    if (command.type === "remove") {
      const { error } = await database
        .from("class_play_players")
        .delete()
        .eq("session_id", session.id)
        .eq("id", command.playerId);
      if (error) throw error;
    }

    const changes: Partial<SessionRow> = {
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    };
    if (command.type === "lock") changes.locked = command.locked;
    if (command.type === "start") {
      changes.locked = true;
      changes.status = "ready";
    }
    if (command.type === "cancel") {
      changes.locked = true;
      changes.status = "cancelled";
    }

    const { data, error } = await database
      .from("class_play_sessions")
      .update(changes)
      .eq("id", session.id)
      .select("*")
      .single();
    if (error) throw error;
    const updatedSession = data as SessionRow;
    const lobby = await getLobby(updatedSession);
    await broadcastLobby(updatedSession, lobby);
    return Response.json(lobby);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not update the lobby.", 500);
  }
}
