import type {
  ClassPlayLobbyCommand,
  ClassPlayLobbyState,
  CreatedClassPlaySession,
  JoinedClassPlaySession,
} from "./types";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Class Play request failed.");
  return data;
}

export function createClassPlaySession(input: {
  maxPlayers: number;
  playlistName: string;
  plannedSongs: number;
}): Promise<CreatedClassPlaySession> {
  return requestJson("/api/class-play/sessions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function joinClassPlaySession(
  code: string,
  displayName: string,
): Promise<JoinedClassPlaySession> {
  return requestJson(`/api/class-play/sessions/${encodeURIComponent(code)}/join`, {
    method: "POST",
    body: JSON.stringify({ displayName }),
  });
}

export function sendClassPlayCommand(
  code: string,
  teacherToken: string,
  command: ClassPlayLobbyCommand,
): Promise<ClassPlayLobbyState> {
  return requestJson(`/api/class-play/sessions/${encodeURIComponent(code)}/command`, {
    method: "POST",
    headers: { Authorization: `Bearer ${teacherToken}` },
    body: JSON.stringify(command),
  });
}
