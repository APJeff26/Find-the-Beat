/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import {
  CLASS_PLAY_CODE_LENGTH,
  DEFAULT_CLASS_PLAY_PLAYER_LIMIT,
} from "../modules/class-play/config";
import type {
  ClassPlayLobbyCommand,
  ClassPlayLobbyState,
  ClassPlayPlayer,
} from "../modules/class-play/types";
import {
  cleanClassPlayName,
  isAppropriateClassPlayName,
  makeUniqueClassPlayName,
} from "../modules/class-play/player-names";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  CLASS_SESSIONS: DurableObjectNamespace;
  NEXT_PUBLIC_CLASS_PLAY_MAX_PLAYERS?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface StoredPlayer extends ClassPlayPlayer {
  reconnectToken: string;
}

interface StoredSession {
  code: string;
  teacherToken: string;
  status: "lobby" | "ready" | "cancelled";
  locked: boolean;
  maxPlayers: number;
  playlistName: string;
  plannedSongs: number;
  players: StoredPlayer[];
  lastActivityAt: number;
}

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const JOIN_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function randomJoinCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CLASS_PLAY_CODE_LENGTH));
  return Array.from(bytes, (byte) => JOIN_CODE_ALPHABET[byte % JOIN_CODE_ALPHABET.length]).join("");
}

function bearerToken(request: Request): string {
  return request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
}

export class ClassPlaySession {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/exists") {
      return json({ active: Boolean(await this.loadActiveSession()) });
    }
    if (url.pathname === "/create" && request.method === "POST") {
      if (await this.loadActiveSession()) return json({ error: "Join code is already active." }, 409);
      const input = await request.json() as {
        code?: string;
        maxPlayers?: number;
        playlistName?: string;
        plannedSongs?: number;
      };
      const configuredMaximum = Math.max(
        1,
        Number(this.env.NEXT_PUBLIC_CLASS_PLAY_MAX_PLAYERS) || DEFAULT_CLASS_PLAY_PLAYER_LIMIT,
      );
      const session: StoredSession = {
        code: String(input.code || ""),
        teacherToken: crypto.randomUUID(),
        status: "lobby",
        locked: false,
        maxPlayers: Math.min(configuredMaximum, Math.max(1, Number(input.maxPlayers) || configuredMaximum)),
        playlistName: String(input.playlistName || "Spotify playlist").slice(0, 100),
        plannedSongs: Math.max(1, Math.min(100, Number(input.plannedSongs) || 1)),
        players: [],
        lastActivityAt: Date.now(),
      };
      await this.save(session);
      return json({ teacherToken: session.teacherToken, lobby: this.publicLobby(session) }, 201);
    }
    if (url.pathname === "/join" && request.method === "POST") return this.join(request);
    if (url.pathname === "/command" && request.method === "POST") return this.command(request);
    if (url.pathname === "/live" && request.headers.get("Upgrade") === "websocket") {
      return this.connectSocket(request);
    }
    return json({ error: "Class Play session route not found." }, 404);
  }

  async alarm(): Promise<void> {
    const sockets = this.state.getWebSockets();
    for (const socket of sockets) socket.close(1001, "Session expired");
    await this.state.storage.deleteAll();
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    const attachment = socket.deserializeAttachment() as { role?: string; playerId?: string } | null;
    if (attachment?.role !== "student" || !attachment.playerId) return;
    const session = await this.loadActiveSession();
    if (!session) return;
    const player = session.players.find((candidate) => candidate.id === attachment.playerId);
    if (player) {
      player.connected = false;
      await this.save(session);
      this.broadcast(session);
    }
  }

  webSocketMessage(): void {
    // Phase 1 lobby sockets are server-push only.
  }

  private async join(request: Request): Promise<Response> {
    const session = await this.loadActiveSession();
    if (!session) return json({ error: "That game code is no longer active." }, 404);
    if (session.locked || session.status !== "lobby") return json({ error: "Joining is locked." }, 423);
    if (session.players.length >= session.maxPlayers) return json({ error: "This Class Play game is full." }, 409);
    const input = await request.json() as { displayName?: unknown };
    const requestedName = cleanClassPlayName(input.displayName);
    if (!requestedName) return json({ error: "Enter a first name or appropriate nickname." }, 400);
    if (!isAppropriateClassPlayName(requestedName)) return json({ error: "Please choose a different classroom name." }, 400);

    const displayName = makeUniqueClassPlayName(
      requestedName,
      session.players.map((player) => player.displayName),
    );
    const player: StoredPlayer = {
      id: crypto.randomUUID(),
      reconnectToken: crypto.randomUUID(),
      displayName,
      connected: false,
      joinedAt: Date.now(),
    };
    session.players.push(player);
    await this.save(session);
    this.broadcast(session);
    return json({
      playerId: player.id,
      reconnectToken: player.reconnectToken,
      lobby: this.publicLobby(session),
    }, 201);
  }

  private async command(request: Request): Promise<Response> {
    const session = await this.loadActiveSession();
    if (!session) return json({ error: "Session expired." }, 404);
    if (bearerToken(request) !== session.teacherToken) return json({ error: "Teacher access required." }, 403);
    const command = await request.json() as ClassPlayLobbyCommand;
    if (command.type === "lock") session.locked = command.locked;
    if (command.type === "remove") {
      session.players = session.players.filter((player) => player.id !== command.playerId);
      for (const socket of this.state.getWebSockets()) {
        const attachment = socket.deserializeAttachment() as { playerId?: string } | null;
        if (attachment?.playerId === command.playerId) socket.close(4001, "Removed by teacher");
      }
    }
    if (command.type === "start") {
      session.locked = true;
      session.status = "ready";
    }
    if (command.type === "cancel") {
      session.locked = true;
      session.status = "cancelled";
    }
    await this.save(session);
    this.broadcast(session);
    if (command.type === "cancel") {
      for (const socket of this.state.getWebSockets()) socket.close(1000, "Session cancelled");
    }
    return json(this.publicLobby(session));
  }

  private async connectSocket(request: Request): Promise<Response> {
    const session = await this.loadActiveSession();
    if (!session) return new Response("Session expired", { status: 404 });
    const url = new URL(request.url);
    const role = url.searchParams.get("role");
    const credential = url.searchParams.get("credential");
    let playerId: string | undefined;
    if (role === "teacher") {
      if (credential !== session.teacherToken) return new Response("Forbidden", { status: 403 });
    } else if (role === "student") {
      const player = session.players.find((candidate) => candidate.reconnectToken === credential);
      if (!player) return new Response("Forbidden", { status: 403 });
      player.connected = true;
      playerId = player.id;
      await this.save(session);
    } else {
      return new Response("Invalid role", { status: 400 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.serializeAttachment({ role, playerId });
    this.state.acceptWebSocket(server);
    server.send(JSON.stringify({ type: "lobby", lobby: this.publicLobby(session) }));
    this.broadcast(session);
    return new Response(null, { status: 101, webSocket: client });
  }

  private async loadActiveSession(): Promise<StoredSession | null> {
    const session = await this.state.storage.get<StoredSession>("session");
    if (!session || Date.now() - session.lastActivityAt >= SESSION_TTL_MS) return null;
    return session;
  }

  private async save(session: StoredSession): Promise<void> {
    session.lastActivityAt = Date.now();
    await this.state.storage.put("session", session);
    await this.state.storage.setAlarm(Date.now() + SESSION_TTL_MS);
  }

  private publicLobby(session: StoredSession): ClassPlayLobbyState {
    return {
      code: session.code,
      status: session.status,
      locked: session.locked,
      maxPlayers: session.maxPlayers,
      playlistName: session.playlistName,
      plannedSongs: session.plannedSongs,
      players: session.players.map((player) => ({
        id: player.id,
        displayName: player.displayName,
        connected: player.connected,
        joinedAt: player.joinedAt,
      })),
    };
  }

  private broadcast(session: StoredSession): void {
    const message = JSON.stringify({ type: "lobby", lobby: this.publicLobby(session) });
    for (const socket of this.state.getWebSockets()) {
      try { socket.send(message); } catch { /* Socket closed between enumeration and send. */ }
    }
  }
}

async function handleClassPlayRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/class-play/")) return null;

  if (url.pathname === "/api/class-play/sessions" && request.method === "POST") {
    const input = await request.json() as Record<string, unknown>;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = randomJoinCode();
      const id = env.CLASS_SESSIONS.idFromName(code);
      const stub = env.CLASS_SESSIONS.get(id);
      const response = await stub.fetch("https://session/create", {
        method: "POST",
        body: JSON.stringify({ ...input, code }),
      });
      if (response.status !== 409) return response;
    }
    return json({ error: "Could not reserve a unique join code. Try again." }, 503);
  }

  const liveMatch = url.pathname.match(/^\/api\/class-play\/live\/([A-Z0-9]+)$/i);
  const sessionMatch = url.pathname.match(/^\/api\/class-play\/sessions\/([A-Z0-9]+)\/(join|command)$/i);
  const match = liveMatch ?? sessionMatch;
  if (!match) return json({ error: "Class Play route not found." }, 404);
  const code = match[1].toUpperCase();
  const action = liveMatch ? "live" : sessionMatch?.[2];
  const stub = env.CLASS_SESSIONS.get(env.CLASS_SESSIONS.idFromName(code));
  const target = new URL(`https://session/${action}`);
  target.search = url.search;
  return stub.fetch(new Request(target, request));
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const classPlayResponse = await handleClassPlayRequest(request, env);
    if (classPlayResponse) return classPlayResponse;

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
