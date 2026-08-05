export type ClassPlaySessionStatus = "lobby" | "ready" | "cancelled";

export interface ClassPlayPlayer {
  id: string;
  displayName: string;
  connected: boolean;
  joinedAt: number;
}

export interface ClassPlayLobbyState {
  code: string;
  status: ClassPlaySessionStatus;
  locked: boolean;
  maxPlayers: number;
  playlistName: string;
  plannedSongs: number;
  players: ClassPlayPlayer[];
}

export interface CreatedClassPlaySession {
  teacherToken: string;
  lobbyChannel: string;
  lobby: ClassPlayLobbyState;
}

export interface JoinedClassPlaySession {
  playerId: string;
  reconnectToken: string;
  lobbyChannel: string;
  lobby: ClassPlayLobbyState;
}

export type ClassPlayLobbyCommand =
  | { type: "lock"; locked: boolean }
  | { type: "remove"; playerId: string }
  | { type: "start" }
  | { type: "cancel" };
