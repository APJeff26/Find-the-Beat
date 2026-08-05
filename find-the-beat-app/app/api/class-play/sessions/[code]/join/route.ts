import {
  cleanClassPlayName,
  isAppropriateClassPlayName,
} from "../../../../../../modules/class-play/player-names";
import {
  broadcastLobby,
  getActiveSession,
  getClassPlayDatabase,
  getLobby,
  jsonError,
} from "../../../../../../modules/class-play/server/supabase";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const session = await getActiveSession(code);
    if (!session) return jsonError("That game code is no longer active.", 404);
    if (session.locked || session.status !== "lobby") return jsonError("Joining is locked.", 423);
    const input = await request.json() as { displayName?: unknown };
    const requestedName = cleanClassPlayName(input.displayName);
    if (!requestedName) return jsonError("Enter a first name or appropriate nickname.", 400);
    if (!isAppropriateClassPlayName(requestedName)) {
      return jsonError("Please choose a different classroom name.", 400);
    }

    const playerId = crypto.randomUUID();
    const reconnectToken = crypto.randomUUID();
    const database = getClassPlayDatabase();
    const { error: joinError } = await database.rpc("join_class_play_session", {
      p_code: code.toUpperCase(),
      p_requested_name: requestedName,
      p_player_id: playerId,
      p_reconnect_token: reconnectToken,
    });
    if (joinError?.message.includes("SESSION_NOT_FOUND")) return jsonError("That game code is no longer active.", 404);
    if (joinError?.message.includes("JOINING_LOCKED")) return jsonError("Joining is locked.", 423);
    if (joinError?.message.includes("SESSION_FULL")) return jsonError("This Class Play game is full.", 409);
    if (joinError) throw joinError;
    const updatedSession = await getActiveSession(code);
    if (!updatedSession) return jsonError("That game code is no longer active.", 404);
    const lobby = await getLobby(updatedSession);
    await broadcastLobby(updatedSession, lobby);
    return Response.json({
      playerId,
      reconnectToken,
      lobbyChannel: session.lobby_channel,
      lobby,
    }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not join this game.", 500);
  }
}
