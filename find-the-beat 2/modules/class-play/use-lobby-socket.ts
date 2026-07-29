"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import type { ClassPlayLobbyState } from "./types";

export function useLobbySocket(
  code: string | null,
  role: "teacher" | "student",
  lobbyChannel: string | null,
  initialLobby: ClassPlayLobbyState | null,
  playerId?: string | null,
) {
  const [lobby, setLobby] = useState(initialLobby);
  const [connection, setConnection] = useState<"connecting" | "connected" | "disconnected">(
    code && lobbyChannel ? "connecting" : "disconnected",
  );
  const onlinePlayersRef = useRef(new Set<string>());

  useEffect(() => {
    if (!code || !lobbyChannel) return;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !publishableKey) return;
    const supabase = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const applyPresence = (current: ClassPlayLobbyState) => ({
      ...current,
      players: current.players.map((player) => ({
        ...player,
        connected: onlinePlayersRef.current.has(player.id),
      })),
    });
    const channel = supabase.channel(`class-play:${lobbyChannel}`, {
      config: { presence: { key: playerId || `teacher-${code}` } },
    });
    channel
      .on("broadcast", { event: "lobby" }, ({ payload }) => {
        const update = payload as { lobby?: ClassPlayLobbyState };
        if (update.lobby) setLobby(applyPresence(update.lobby));
      })
      .on("presence", { event: "sync" }, () => {
        const online = new Set<string>();
        for (const entries of Object.values(channel.presenceState())) {
          for (const entry of entries) {
            const presentPlayerId = (entry as { playerId?: string }).playerId;
            if (presentPlayerId) online.add(presentPlayerId);
          }
        }
        onlinePlayersRef.current = online;
        setLobby((current) => current ? applyPresence(current) : current);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          setConnection("connected");
          if (role === "student" && playerId) {
            await channel.track({ playerId, onlineAt: new Date().toISOString() });
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnection("disconnected");
        } else {
          setConnection("connecting");
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [code, lobbyChannel, playerId, role]);

  return { lobby: lobby ?? initialLobby, connection };
}
