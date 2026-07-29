"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { joinClassPlaySession } from "../../modules/class-play/api";
import { CLASS_PLAY_CODE_LENGTH, CLASS_PLAY_NAME_MAX_LENGTH } from "../../modules/class-play/config";
import type { JoinedClassPlaySession } from "../../modules/class-play/types";
import { useLobbySocket } from "../../modules/class-play/use-lobby-socket";

const RECONNECT_KEY = "find-the-beat:class-play-reconnect:v2";
const classPlayEnabled = process.env.NODE_ENV !== "production";

export default function JoinClassPlay() {
  const [joined, setJoined] = useState<JoinedClassPlaySession | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(RECONNECT_KEY);
      if (saved) {
        const restored = JSON.parse(saved) as JoinedClassPlaySession;
        queueMicrotask(() => setJoined(restored));
      }
    } catch {
      sessionStorage.removeItem(RECONNECT_KEY);
    }
  }, []);

  const { lobby, connection } = useLobbySocket(
    joined?.lobby.code ?? null,
    "student",
    joined?.lobbyChannel ?? null,
    joined?.lobby ?? null,
    joined?.playerId ?? null,
  );

  const join = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setJoining(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await joinClassPlaySession(code, String(form.get("displayName") ?? ""));
      sessionStorage.setItem(RECONNECT_KEY, JSON.stringify(response));
      setJoined(response);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Could not join this game.");
    } finally {
      setJoining(false);
    }
  };

  if (!classPlayEnabled) {
    return (
      <main className="join-shell">
        <section className="join-card" aria-labelledby="join-title">
          <div className="class-play-mark" aria-hidden="true">♪</div>
          <p className="eyebrow">Find the Beat</p>
          <h1 id="join-title">Class Play is coming soon</h1>
          <p className="lead">This temporary version supports Solo Practice and Team Mode.</p>
          <Link className="primary-button classroom-button" href="/">Return to Find the Beat</Link>
        </section>
      </main>
    );
  }

  if (joined && lobby) {
    const player = lobby.players.find((candidate) => candidate.id === joined.playerId);
    return (
      <main className="join-shell">
        <section className="student-lobby-card" aria-labelledby="student-lobby-title">
          <div className="class-play-mark" aria-hidden="true">♪</div>
          <p className="eyebrow">Class Play · {lobby.code}</p>
          <h1 id="student-lobby-title">
            {lobby.status === "cancelled"
              ? "Game cancelled"
              : lobby.status === "ready"
                ? "Get ready!"
                : `You’re in, ${player?.displayName ?? "musician"}!`}
          </h1>
          <p className="lead">
            {lobby.status === "lobby"
              ? "Keep this screen open. Your teacher will start when everyone is ready."
              : lobby.status === "ready"
                ? "The lobby is locked. Round play arrives in Phase 2."
                : "Your teacher ended this session."}
          </p>
          <div className={`connection-badge connection-${connection}`}>
            <span aria-hidden="true" />
            {connection === "connected" ? "Connected" : connection === "connecting" ? "Reconnecting…" : "Disconnected"}
          </div>
          <div className="student-count-card">
            <strong>{lobby.players.length}</strong>
            <span>players joined</span>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="join-shell">
      <section className="join-card" aria-labelledby="join-title">
        <div className="class-play-mark" aria-hidden="true">♪</div>
        <p className="eyebrow">Find the Beat</p>
        <h1 id="join-title">Join Class Play</h1>
        <form onSubmit={join}>
          <label>
            <span>Game code</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CLASS_PLAY_CODE_LENGTH))}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="ABC234"
              minLength={CLASS_PLAY_CODE_LENGTH}
              required
              autoFocus
            />
          </label>
          <label>
            <span>Your first name or nickname</span>
            <input
              name="displayName"
              maxLength={CLASS_PLAY_NAME_MAX_LENGTH}
              autoComplete="off"
              placeholder="Jordan"
              required
            />
          </label>
          <p className="student-name-note">
            Students should join using their first name or an appropriate nickname. Full legal names are not required.
          </p>
          {error && <p className="setup-validation" role="alert"><span aria-hidden="true">!</span>{error}</p>}
          <button className="primary-button classroom-button" disabled={joining || code.length !== CLASS_PLAY_CODE_LENGTH}>
            {joining ? "Joining…" : "Join game"} <span aria-hidden="true">→</span>
          </button>
        </form>
      </section>
    </main>
  );
}
