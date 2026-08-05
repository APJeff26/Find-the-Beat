"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { SynthDemoPlayer } from "../modules/audio/audio-player";
import { SpotifyTrackPlayer } from "../modules/audio/spotify-track-player";
import { createFixedTempoBeatMap, type BeatMap } from "../modules/beat-map/beat-map";
import { DEMO_BEAT_MAP } from "../modules/beat-map/demo-beat-map";
import { evaluateTaps } from "../modules/evaluation/tap-evaluation";
import { createActivityResult, type ActivityResult } from "../modules/results/activity-result";
import { TapRecorder } from "../modules/taps/tap-recorder";
import { shouldRecordRhythmPointer } from "../modules/taps/pointer-input";
import {
  createClassPlaySession,
  sendClassPlayCommand,
} from "../modules/class-play/api";
import { DEFAULT_CLASS_PLAY_PLAYER_LIMIT } from "../modules/class-play/config";
import type { CreatedClassPlaySession } from "../modules/class-play/types";
import { useLobbySocket } from "../modules/class-play/use-lobby-socket";
import { useSpotify } from "../modules/spotify/use-spotify";
import {
  createSongPool,
  consumeCurrentSong,
  currentSong,
  restoreLastUsedSong,
  skipCurrentSong,
  type SongPool,
} from "../modules/spotify/song-pool";
import {
  addTurnScore,
  createTeamGame,
  getWinner,
  selectTeam,
  switchTeam,
  undoLastScore,
  type TeamGame,
  type TeamId,
} from "../modules/team/team-game";

type Screen =
  | "home"
  | "solo-welcome"
  | "solo-instructions"
  | "solo-activity"
  | "solo-results"
  | "teacher-setup"
  | "class-config"
  | "class-lobby"
  | "team-setup"
  | "team-turn"
  | "team-activity"
  | "team-results"
  | "team-winner";
type PlaybackState = "ready" | "counting" | "playing" | "paused" | "finished";
type MusicSource = "demo" | "spotify";
type TeacherMode = "team" | "class";
// Class Play remains in the codebase for future deployment, but the temporary
// Vercel production build intentionally exposes only Solo and Team Mode.
const classPlayEnabled = process.env.NODE_ENV !== "production";
const configuredClassPlayerLimit = Math.max(
  1,
  Number(process.env.NEXT_PUBLIC_CLASS_PLAY_MAX_PLAYERS) || DEFAULT_CLASS_PLAY_PLAYER_LIMIT,
);

interface ActivityPlayer {
  start(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  getPositionMs(): number;
  getError?(): Error | null;
  stop(): void;
}

const MusicalNotes = () => (
  <div className="notes" aria-hidden="true">
    <span>♪</span><span>♫</span><span>♩</span><span>♪</span>
  </div>
);

function BpmInput({
  title,
  initialBpm,
  onSave,
}: {
  title: string;
  initialBpm: number | null;
  onSave: (bpm: number) => void;
}) {
  const [draft, setDraft] = useState(initialBpm?.toString() ?? "");

  const save = (input: HTMLInputElement) => {
    const value = Number(draft);
    if (draft !== "" && value >= 30 && value <= 300) {
      onSave(value);
      input.setCustomValidity("");
    } else {
      input.setCustomValidity("Enter a BPM between 30 and 300.");
      input.reportValidity();
    }
  };

  return (
    <input
      type="number"
      min={30}
      max={300}
      step={0.1}
      value={draft}
      placeholder="—"
      aria-label={`BPM for ${title}`}
      onChange={(event) => {
        setDraft(event.target.value);
        event.target.setCustomValidity("");
      }}
      onBlur={(event) => save(event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          save(event.currentTarget);
          if (event.currentTarget.checkValidity()) event.currentTarget.blur();
        }
      }}
    />
  );
}

function TeamScoreboard({
  game,
  selectable = false,
  onSelect,
}: {
  game: TeamGame;
  selectable?: boolean;
  onSelect?: (teamId: TeamId) => void;
}) {
  return (
    <div className="team-scoreboard" aria-label="Team scores">
      {(["team1", "team2"] as const).map((teamId, index) => {
        const team = game.teams[teamId];
        const active = game.activeTeamId === teamId;
        const content = (
          <>
            <span className="team-badge" aria-hidden="true">{index === 0 ? "★" : "♫"}</span>
            <span className="team-name">{team.name}</span>
            <strong>{team.total}</strong>
            <span className="team-points-label">points</span>
            {active && <span className="active-label">Playing next</span>}
          </>
        );
        return selectable ? (
          <button
            key={teamId}
            className={`team-score team-${index + 1} ${active ? "active" : ""}`}
            onClick={() => onSelect?.(teamId)}
            aria-pressed={active}
          >
            {content}
          </button>
        ) : (
          <div key={teamId} className={`team-score team-${index + 1} ${active ? "active" : ""}`}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [playback, setPlayback] = useState<PlaybackState>("ready");
  const [positionMs, setPositionMs] = useState(0);
  const [tapFlash, setTapFlash] = useState(false);
  const [result, setResult] = useState<ActivityResult | null>(null);
  const [teamGame, setTeamGame] = useState<TeamGame | null>(null);
  const [musicSource, setMusicSource] = useState<MusicSource>("demo");
  const [plannedTurns, setPlannedTurns] = useState(8);
  const [songPool, setSongPool] = useState<SongPool | null>(null);
  const [activeBeatMap, setActiveBeatMap] = useState<BeatMap>(DEMO_BEAT_MAP);
  const [setupMessage, setSetupMessage] = useState("");
  const [playbackMessage, setPlaybackMessage] = useState("");
  const [teacherMode, setTeacherMode] = useState<TeacherMode>("team");
  const [classSession, setClassSession] = useState<CreatedClassPlaySession | null>(null);
  const [classPlayerLimit, setClassPlayerLimit] = useState(configuredClassPlayerLimit);
  const [classSessionBusy, setClassSessionBusy] = useState(false);
  const [classSessionError, setClassSessionError] = useState("");
  const [joinUrl, setJoinUrl] = useState("");
  const spotify = useSpotify();
  const classLobbyConnection = useLobbySocket(
    classSession?.lobby.code ?? null,
    "teacher",
    classSession?.lobbyChannel ?? null,
    classSession?.lobby ?? null,
  );
  const playerRef = useRef<ActivityPlayer | null>(null);
  const beatMapRef = useRef<BeatMap>(DEMO_BEAT_MAP);
  const poolRef = useRef<SongPool | null>(songPool);
  const recorderRef = useRef(new TapRecorder());
  const frameRef = useRef<number | null>(null);
  const monitorRef = useRef<() => void>(() => undefined);
  const screenRef = useRef<Screen>(screen);
  const gameRef = useRef<TeamGame | null>(teamGame);

  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => { gameRef.current = teamGame; }, [teamGame]);
  useEffect(() => { poolRef.current = songPool; }, [songPool]);

  const stopActivity = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    playerRef.current?.stop();
    playerRef.current = null;
    recorderRef.current.clear();
    setPositionMs(0);
    setPlayback("ready");
  }, []);

  const finishActivity = useCallback(() => {
    const taps = recorderRef.current.getTaps();
    const evaluation = evaluateTaps(beatMapRef.current.beatsMs, taps);
    const nextResult = createActivityResult(evaluation, taps.length);
    setResult(nextResult);
    setPlayback("finished");
    playerRef.current?.stop();

    if (screenRef.current === "team-activity" && gameRef.current) {
      const scoredGame = addTurnScore(
        gameRef.current,
        nextResult.accuracyScore,
        nextResult.consistencyScore,
      );
      // Alternate by default; the teacher can still switch the selected team.
      const nextGame = switchTeam(scoredGame);
      gameRef.current = nextGame;
      setTeamGame(nextGame);
      if (musicSource === "spotify" && poolRef.current) {
        const nextPool = consumeCurrentSong(poolRef.current);
        poolRef.current = nextPool;
        setSongPool(nextPool);
      }
      setScreen("team-results");
    } else {
      setScreen("solo-results");
    }
  }, [musicSource]);

  const monitorPlayback = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    const playerError = player.getError?.();
    if (playerError) {
      stopActivity();
      setPlaybackMessage(`${playerError.message} Choose Skip Song or use the demo groove.`);
      return;
    }
    const nextPosition = player.getPositionMs();
    setPositionMs(nextPosition);
    setPlayback(nextPosition < beatMapRef.current.songStartMs ? "counting" : "playing");
    if (nextPosition >= beatMapRef.current.durationMs) {
      finishActivity();
      return;
    }
    frameRef.current = requestAnimationFrame(monitorRef.current);
  }, [finishActivity, stopActivity]);

  useEffect(() => { monitorRef.current = monitorPlayback; }, [monitorPlayback]);

  const start = useCallback(async () => {
    if (playback === "paused" && playerRef.current) {
      await playerRef.current.resume();
      setPlayback(playerRef.current.getPositionMs() < beatMapRef.current.songStartMs ? "counting" : "playing");
      frameRef.current = requestAnimationFrame(monitorPlayback);
      return;
    }
    recorderRef.current.clear();
    setPlaybackMessage("");
    setPositionMs(0);
    setResult(null);
    playerRef.current?.stop();
    const spotifySong = screenRef.current === "team-activity" && musicSource === "spotify" && poolRef.current
      ? currentSong(poolRef.current)
      : null;
    let player: ActivityPlayer;
    if (spotifySong?.bpm && spotify.playback.current) {
      const map = createFixedTempoBeatMap(
        spotifySong.id,
        spotifySong.title,
        spotifySong.bpm,
        spotifySong.durationMs,
      );
      beatMapRef.current = map;
      setActiveBeatMap(map);
      player = new SpotifyTrackPlayer(map, spotifySong.uri, spotify.playback.current);
    } else {
      beatMapRef.current = DEMO_BEAT_MAP;
      setActiveBeatMap(DEMO_BEAT_MAP);
      player = new SynthDemoPlayer(DEMO_BEAT_MAP, {
        silentCountIn: screenRef.current === "team-activity",
      });
    }
    playerRef.current = player;
    try {
      await player.start();
      setPlayback("counting");
      frameRef.current = requestAnimationFrame(monitorPlayback);
    } catch (error) {
      stopActivity();
      setPlaybackMessage(
        `${error instanceof Error ? error.message : "Playback could not start."} Choose Skip Song or use the demo groove.`,
      );
    }
  }, [monitorPlayback, musicSource, playback, spotify.playback, stopActivity]);

  const pause = useCallback(async () => {
    if (!playerRef.current) return;
    await playerRef.current.pause();
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    setPositionMs(playerRef.current.getPositionMs());
    setPlayback("paused");
  }, []);

  const restartSong = useCallback(() => {
    stopActivity();
    setResult(null);
    setPlaybackMessage("");
  }, [stopActivity]);

  const recordTap = useCallback(() => {
    if (playback !== "playing" || !playerRef.current) return;
    recorderRef.current.record(playerRef.current.getPositionMs(), performance.now());
    setTapFlash(true);
    window.setTimeout(() => setTapFlash(false), 90);
  }, [playback]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const activityOpen = screen === "solo-activity" || screen === "team-activity";
      if (event.code !== "Space" || event.repeat || !activityOpen) return;
      event.preventDefault();
      recordTap();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [recordTap, screen]);

  useEffect(() => () => {
    playerRef.current?.stop();
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  const goHome = () => {
    stopActivity();
    setResult(null);
    setTeamGame(null);
    setSongPool(null);
    setClassSession(null);
    setScreen("home");
  };

  const useDemoForTeams = () => {
    setMusicSource("demo");
    setSongPool(null);
    setSetupMessage("");
    setScreen("team-setup");
  };

  const continueWithSpotify = () => {
    const missingBpms = spotify.tracks.filter((track) => !track.bpm);
    if (!spotify.selectedPlaylist || !spotify.tracks.length) {
      setSetupMessage("Choose a playlist with playable songs first.");
      return;
    }
    if (missingBpms.length) {
      setSetupMessage(`Add a BPM for ${missingBpms.length} ${missingBpms.length === 1 ? "song" : "songs"}.`);
      return;
    }
    if (spotify.tracks.length < plannedTurns) {
      setSetupMessage(`This playlist needs ${plannedTurns - spotify.tracks.length} more playable ${spotify.tracks.length + 1 === plannedTurns ? "song" : "songs"} for ${plannedTurns} turns.`);
      return;
    }
    setMusicSource("spotify");
    setSetupMessage("");
    setScreen(teacherMode === "class" ? "class-config" : "team-setup");
  };

  const createClassSession = async () => {
    if (!spotify.selectedPlaylist) return;
    setClassSessionBusy(true);
    setClassSessionError("");
    try {
      const session = await createClassPlaySession({
        maxPlayers: classPlayerLimit,
        playlistName: spotify.selectedPlaylist.name,
        plannedSongs: plannedTurns,
      });
      setClassSession(session);
      setJoinUrl(`${window.location.origin}/join`);
      setScreen("class-lobby");
    } catch (error) {
      setClassSessionError(error instanceof Error ? error.message : "Could not create Class Play.");
    } finally {
      setClassSessionBusy(false);
    }
  };

  const sendLobbyCommand = async (
    command: Parameters<typeof sendClassPlayCommand>[2],
  ) => {
    if (!classSession) return;
    setClassSessionError("");
    try {
      await sendClassPlayCommand(classSession.lobby.code, classSession.teacherToken, command);
    } catch (error) {
      setClassSessionError(error instanceof Error ? error.message : "Could not update the lobby.");
    }
  };

  const startTeamGame = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const game = createTeamGame(String(form.get("team1") ?? ""), String(form.get("team2") ?? ""));
    setTeamGame(game);
    const pool = musicSource === "spotify" ? createSongPool(spotify.tracks) : null;
    poolRef.current = pool;
    setSongPool(pool);
    setScreen("team-turn");
  };

  const beginTeamTurn = () => {
    restartSong();
    setScreen("team-activity");
  };

  const endTeamGame = () => {
    stopActivity();
    setResult(null);
    poolRef.current = null;
    setSongPool(null);
    setScreen("team-winner");
  };

  const undoTeamScore = () => {
    if (!teamGame?.turns.length) return;
    const previousGame = undoLastScore(teamGame);
    if (musicSource === "spotify" && poolRef.current) {
      const restored = restoreLastUsedSong(poolRef.current);
      poolRef.current = restored;
      setSongPool(restored);
    }
    setTeamGame(previousGame);
    setResult(null);
    setScreen("team-turn");
  };

  const skipSong = () => {
    stopActivity();
    if (!poolRef.current) return;
    const nextPool = skipCurrentSong(poolRef.current);
    poolRef.current = nextPool;
    setSongPool(nextPool);
  };

  const replaySong = async () => {
    restartSong();
    await start();
  };

  const playAgain = () => {
    if (!teamGame) return;
    const newGame = createTeamGame(teamGame.teams.team1.name, teamGame.teams.team2.name);
    setTeamGame(newGame);
    if (musicSource === "spotify") {
      const newPool = createSongPool(spotify.tracks);
      poolRef.current = newPool;
      setSongPool(newPool);
    }
    setScreen("team-turn");
  };

  const activeSpotifySong = songPool ? currentSong(songPool) : null;
  const progress = Math.min(100, (positionMs / activeBeatMap.durationMs) * 100);
  const countInBeat = Math.min(4, Math.floor(positionMs / activeBeatMap.beatIntervalMs) + 1);
  const teamActivity = screen === "team-activity";
  const previousTurn = teamGame?.turns.at(-1);

  return (
    <main className={`app-shell ${screen.startsWith("team-") ? "team-mode" : ""} ${screen.startsWith("class-") ? "class-mode" : ""}`}>
      <MusicalNotes />
      <header className="brand" aria-label="Find the Beat">
        <button className="brand-button" onClick={goHome} aria-label="Go to home">
          <span className="brand-mark" aria-hidden="true">♪</span>
          <span>Find the Beat</span>
        </button>
        {screen.startsWith("team-") && <span className="mode-pill">Team Mode</span>}
        {screen.startsWith("class-") && <span className="mode-pill class-mode-pill">Class Play</span>}
      </header>

      {screen === "home" && (
        <section className="screen home-screen" aria-labelledby="home-title">
          <p className="eyebrow">Choose your game</p>
          <h1 id="home-title">Ready to find the beat?</h1>
          <div className="mode-grid">
            <button className="mode-card solo-card" onClick={() => setScreen("solo-welcome")}>
              <span className="mode-icon" aria-hidden="true">♪</span>
              <span className="mode-kicker">One player</span>
              <strong>Solo Practice</strong>
              <span>Listen and tap your best beat</span>
              <b>Play solo <span aria-hidden="true">→</span></b>
            </button>
            <button className="mode-card team-card" onClick={() => { setTeacherMode("team"); setScreen("teacher-setup"); }}>
              <span className="mode-icon" aria-hidden="true">★</span>
              <span className="mode-kicker">Whole class</span>
              <strong>Team Mode</strong>
              <span>Take turns and cheer together</span>
              <b>Start teams <span aria-hidden="true">→</span></b>
            </button>
            {classPlayEnabled && (
              <button className="mode-card class-card" onClick={() => { setTeacherMode("class"); setScreen("teacher-setup"); }}>
                <span className="mode-icon" aria-hidden="true">♬</span>
                <span className="mode-kicker">Everyone joins</span>
                <strong>Class Play</strong>
                <span>Live rhythm fun on every device</span>
                <b>Host a class <span aria-hidden="true">→</span></b>
              </button>
            )}
          </div>
        </section>
      )}

      {screen === "solo-welcome" && (
        <section className="screen welcome-screen" aria-labelledby="welcome-title">
          <div className="hero-art" aria-hidden="true">
            <div className="record"><span>♪</span></div>
            <div className="sound-wave"><i /><i /><i /><i /><i /></div>
          </div>
          <p className="eyebrow">Solo Practice</p>
          <h1 id="welcome-title">Can you find the beat?</h1>
          <p className="lead">Listen closely, tap along, and let your rhythm shine.</p>
          <button className="primary-button" onClick={() => setScreen("solo-instructions")}>
            Let&apos;s play <span aria-hidden="true">→</span>
          </button>
        </section>
      )}

      {screen === "solo-instructions" && (
        <section className="screen" aria-labelledby="instructions-title">
          <p className="step-label">How to play</p>
          <h1 id="instructions-title">Listen. Feel it. Tap it.</h1>
          <div className="instruction-grid">
            <article><span className="instruction-number">1</span><span className="instruction-icon" aria-hidden="true">♫</span><h2>Hear the count-in</h2><p>Four sounds will get you ready.</p></article>
            <article><span className="instruction-number">2</span><span className="instruction-icon tap-mini" aria-hidden="true">●</span><h2>Tap with the beat</h2><p>Press the big button each time you feel it.</p></article>
            <article><span className="instruction-number">3</span><span className="instruction-icon" aria-hidden="true">★</span><h2>Keep it steady</h2><p>Try to make every tap feel even.</p></article>
          </div>
          <p className="keyboard-tip"><kbd>Spacebar</kbd> works too!</p>
          <div className="button-row">
            <button className="text-button" onClick={() => setScreen("solo-welcome")}>Back</button>
            <button className="primary-button" onClick={() => setScreen("solo-activity")}>I&apos;m ready <span aria-hidden="true">→</span></button>
          </div>
        </section>
      )}

      {screen === "teacher-setup" && (
        <section className="screen teacher-setup-screen" aria-labelledby="teacher-setup-title">
          <p className="eyebrow">{teacherMode === "class" ? "Class Play setup" : "Teacher setup"}</p>
          <h1 id="teacher-setup-title">Choose the music</h1>
          <div className={`connection-card connection-${spotify.connection.status}`}>
            <div>
              <span className="status-dot" aria-hidden="true" />
              <strong>
                {spotify.connection.status === "connected"
                  ? `Spotify connected${spotify.connection.displayName ? ` · ${spotify.connection.displayName}` : ""}`
                  : spotify.connection.status === "connecting"
                    ? "Connecting to Spotify…"
                    : spotify.connection.status === "unconfigured"
                      ? "Spotify needs setup"
                      : "Spotify is not connected"}
              </strong>
              <p>
                {spotify.connection.status === "connected"
                  ? "Premium playback is ready on this teacher computer."
                  : "The demo groove is always available if Spotify cannot connect."}
              </p>
              {spotify.connection.error && <p className="setup-error" role="alert">{spotify.connection.error}</p>}
            </div>
            {spotify.connection.status === "connected" ? (
              <div className="connection-actions">
                <button className="secondary-button" onClick={spotify.loadPlaylists} disabled={spotify.loading}>
                  {spotify.loading ? "Loading…" : spotify.playlists.length ? "Refresh playlists" : "Load playlists"}
                </button>
                <button className="text-button" onClick={spotify.disconnect}>Disconnect</button>
              </div>
            ) : (
              <button
                className="spotify-button"
                onClick={spotify.connect}
                disabled={!spotify.clientConfigured || spotify.connection.status === "connecting"}
              >
                Connect Spotify Premium
              </button>
            )}
          </div>

          {spotify.connection.status === "connected" && spotify.playlists.length > 0 && (
            <div className="playlist-setup">
              <label className="playlist-field">
                <span>1. Choose a playlist</span>
                <select
                  value={spotify.selectedPlaylistId}
                  onChange={(event) => {
                    setSetupMessage("");
                    void spotify.loadPlaylist(event.target.value);
                  }}
                >
                  <option value="">Select a playlist…</option>
                  {spotify.playlists.map((playlist) => (
                    <option key={playlist.id} value={playlist.id}>{playlist.name} · {playlist.trackCount} songs</option>
                  ))}
                </select>
              </label>
              <label className="turns-field">
                <span>2. Number of turns</span>
                <input
                  type="number"
                  min={2}
                  max={Math.max(2, spotify.tracks.length || 40)}
                  value={plannedTurns}
                  onChange={(event) => setPlannedTurns(Math.max(2, Number(event.target.value) || 2))}
                />
              </label>
            </div>
          )}

          {spotify.loading && <p className="loading-message" role="status">Loading songs from Spotify…</p>}

          {spotify.selectedPlaylist && !spotify.loading && (
            <div className="track-editor">
              <div className="track-editor-heading">
                <div>
                  <p className="step-label">3. Check each tempo</p>
                  <h2>{spotify.selectedPlaylist.name}</h2>
                </div>
                <a href={spotify.selectedPlaylist.spotifyUrl} target="_blank" rel="noreferrer">Open in Spotify ↗</a>
              </div>
              {spotify.tracks.length ? (
                <div className="track-list">
                  {spotify.tracks.map((track, index) => (
                    <article className="track-row" key={track.id}>
                      <span className="track-number">{index + 1}</span>
                      {track.artworkUrl ? (
                        <a href={track.spotifyUrl} target="_blank" rel="noreferrer" aria-label={`Open ${track.title} in Spotify`}>
                          {/* Spotify artwork is displayed unaltered and links to its Spotify context. */}
                          {/* eslint-disable-next-line @next/next/no-img-element -- Spotify CDN URLs are dynamic and artwork must remain unmodified. */}
                          <img src={track.artworkUrl} alt="" className="album-art" />
                        </a>
                      ) : <span className="album-art album-placeholder" aria-hidden="true">♫</span>}
                      <div className="track-copy">
                        <strong>{track.title}</strong>
                        <span>{track.artist}</span>
                      </div>
                      <label className="bpm-field">
                        <span>BPM</span>
                        <BpmInput
                          title={track.title}
                          initialBpm={track.bpm}
                          onSave={(bpm) => spotify.updateBpm(track.id, bpm)}
                        />
                      </label>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="empty-playlist">No playable tracks were found in this playlist.</p>
              )}
              <p className="spotify-attribution">Album artwork and music provided by Spotify.</p>
            </div>
          )}

          {setupMessage && <p className="setup-validation" role="alert"><span aria-hidden="true">!</span>{setupMessage}</p>}
          <div className="teacher-setup-actions">
            <button className="text-button" onClick={() => setScreen("home")}>Back</button>
            {teacherMode === "team" && <button className="secondary-button demo-fallback" onClick={useDemoForTeams}>Use demo song</button>}
            <button
              className="primary-button"
              onClick={continueWithSpotify}
              disabled={spotify.connection.status !== "connected" || spotify.loading}
            >
              {teacherMode === "class" ? "Continue to session setup" : "Save setup & name teams"} <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>
      )}

      {screen === "class-config" && spotify.selectedPlaylist && (
        <section className="screen class-config-screen" aria-labelledby="class-config-title">
          <p className="eyebrow">Class Play</p>
          <h1 id="class-config-title">Create your live class</h1>
          <div className="class-config-card">
            <div>
              <span>Playlist</span>
              <strong>{spotify.selectedPlaylist.name}</strong>
            </div>
            <div>
              <span>Songs</span>
              <strong>{plannedTurns}</strong>
            </div>
            <label>
              <span>Maximum students</span>
              <input
                type="number"
                min={1}
                max={configuredClassPlayerLimit}
                value={classPlayerLimit}
                onChange={(event) => setClassPlayerLimit(Math.max(1, Math.min(configuredClassPlayerLimit, Number(event.target.value) || 1)))}
              />
            </label>
          </div>
          <p className="privacy-note">Only temporary display names and lobby status are stored. Sessions expire automatically after inactivity.</p>
          {classSessionError && <p className="setup-validation" role="alert"><span aria-hidden="true">!</span>{classSessionError}</p>}
          <div className="button-row">
            <button className="text-button" onClick={() => setScreen("teacher-setup")}>Back</button>
            <button className="primary-button giant-button" onClick={() => void createClassSession()} disabled={classSessionBusy}>
              {classSessionBusy ? "Creating…" : "Create game session"} <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>
      )}

      {screen === "class-lobby" && classSession && classLobbyConnection.lobby && (() => {
        const lobby = classLobbyConnection.lobby;
        return (
          <section className="screen class-lobby-screen" aria-labelledby="class-lobby-title">
            <p className="eyebrow">Live lobby</p>
            <h1 id="class-lobby-title">{lobby.status === "cancelled" ? "Session cancelled" : "Join Class Play"}</h1>
            <div className="lobby-hero">
              <div className="join-code-panel">
                <span>Game code</span>
                <strong>{lobby.code}</strong>
              </div>
              <div className="join-link-panel">
                <span>Students visit</span>
                <strong>{joinUrl}</strong>
                <small>Enter the code and a first name or appropriate nickname.</small>
              </div>
            </div>
            <div className="lobby-status-row">
              <strong>{lobby.players.length} / {lobby.maxPlayers} students</strong>
              <span className={`connection-badge connection-${classLobbyConnection.connection}`}>
                <span aria-hidden="true" />{classLobbyConnection.connection === "connected" ? "Live" : "Reconnecting…"}
              </span>
              <span className={`joining-status ${lobby.locked ? "locked" : ""}`}>{lobby.locked ? "Joining locked" : "Joining open"}</span>
            </div>
            <div className="student-roster">
              {lobby.players.length ? lobby.players.map((player, index) => (
                <article key={player.id}>
                  <span className="roster-number">{index + 1}</span>
                  <strong>{player.displayName}</strong>
                  <span className={player.connected ? "student-online" : "student-offline"}>
                    {player.connected ? "Connected" : "Reconnecting"}
                  </span>
                  <button onClick={() => void sendLobbyCommand({ type: "remove", playerId: player.id })} aria-label={`Remove ${player.displayName}`}>
                    Remove
                  </button>
                </article>
              )) : (
                <div className="empty-lobby"><span aria-hidden="true">♪</span><strong>Waiting for students…</strong><p>Names will appear here as they join.</p></div>
              )}
            </div>
            {lobby.status === "ready" && <p className="phase-note">Lobby locked successfully. Synchronized gameplay will be added in Phase 2.</p>}
            {classSessionError && <p className="setup-validation" role="alert"><span aria-hidden="true">!</span>{classSessionError}</p>}
            {lobby.status !== "cancelled" ? (
              <div className="lobby-controls">
                <button className="secondary-button" onClick={() => void sendLobbyCommand({ type: "lock", locked: !lobby.locked })}>
                  {lobby.locked ? "Unlock Joining" : "Lock Joining"}
                </button>
                <button className="primary-button classroom-button" onClick={() => void sendLobbyCommand({ type: "start" })} disabled={!lobby.players.length || lobby.status !== "lobby"}>
                  Start Game
                </button>
                <button className="danger-action" onClick={() => void sendLobbyCommand({ type: "cancel" })}>Cancel Session</button>
              </div>
            ) : (
              <button className="primary-button" onClick={goHome}>Return Home</button>
            )}
          </section>
        );
      })()}

      {screen === "team-setup" && (
        <section className="screen team-setup-screen" aria-labelledby="team-setup-title">
          <p className="eyebrow">Let&apos;s make some noise!</p>
          <h1 id="team-setup-title">Name your teams</h1>
          <form className="team-form" onSubmit={startTeamGame}>
            <label className="team-name-field team-1-field">
              <span><b aria-hidden="true">★</b> Team 1</span>
              <input name="team1" maxLength={20} placeholder="Rhythm Rockets" autoComplete="off" autoFocus />
            </label>
            <div className="versus" aria-hidden="true">VS</div>
            <label className="team-name-field team-2-field">
              <span><b aria-hidden="true">♫</b> Team 2</span>
              <input name="team2" maxLength={20} placeholder="Beat Bears" autoComplete="off" />
            </label>
            <div className="team-form-actions">
              <button type="button" className="text-button" onClick={() => setScreen("home")}>Back</button>
              <button className="primary-button classroom-button">Start the game <span aria-hidden="true">→</span></button>
            </div>
          </form>
        </section>
      )}

      {screen === "team-turn" && teamGame && (
        <section className="screen team-turn-screen" aria-labelledby="team-turn-title">
          <p className="eyebrow">Choose who plays</p>
          <h1 id="team-turn-title"><span>{teamGame.teams[teamGame.activeTeamId].name}</span>, you&apos;re up!</h1>
          <TeamScoreboard game={teamGame} selectable onSelect={(teamId) => setTeamGame(selectTeam(teamGame, teamId))} />
          {musicSource === "spotify" && activeSpotifySong && (
            <div className="now-playing-card">
              <span>Next song</span>
              <strong>{activeSpotifySong.title}</strong>
              <small>{activeSpotifySong.artist} · {songPool?.available.length ?? 0} songs remaining</small>
            </div>
          )}
          {previousTurn && (
            <div className="previous-turn">
              <span>Last turn</span>
              <strong>{previousTurn.teamName} +{previousTurn.points}</strong>
              <span>{previousTurn.accuracy}% match · {previousTurn.consistency}% steady</span>
            </div>
          )}
          <button className="primary-button giant-button" onClick={beginTeamTurn}>Start this turn <span aria-hidden="true">▶</span></button>
          <div className="teacher-actions">
            <button onClick={() => setTeamGame(switchTeam(teamGame))}>⇄ Switch Team</button>
            <button onClick={undoTeamScore} disabled={!teamGame.turns.length}>↶ Undo Last Score</button>
            <button className="danger-action" onClick={endTeamGame}>■ End Game</button>
          </div>
        </section>
      )}

      {(screen === "solo-activity" || screen === "team-activity") && (
        <section className={`screen activity-screen ${teamActivity ? "team-activity-screen" : ""}`} aria-labelledby="activity-title">
          {teamActivity && teamGame && <TeamScoreboard game={teamGame} />}
          {teamActivity && musicSource === "spotify" && activeSpotifySong && (
            <div className="now-playing-card activity-song-card">
              <span>Now playing</span>
              <strong>{activeSpotifySong.title}</strong>
              <small>{activeSpotifySong.artist} · {songPool?.available.length ?? 0} songs remaining</small>
            </div>
          )}
          <div className="activity-heading">
            <div>
              <p className="step-label">
                {teamActivity && teamGame ? `${teamGame.teams[teamGame.activeTeamId].name} · ` : ""}
                {teamActivity && musicSource === "spotify" && activeSpotifySong
                  ? `${activeSpotifySong.title} · ${activeSpotifySong.bpm} BPM`
                  : "Demo groove · 100 BPM"}
              </p>
              <h1 id="activity-title">
                {playback === "counting" ? "Get ready…" : playback === "paused" ? "Take a breath" : playback === "playing" ? "Tap the steady beat" : "Ready when you are"}
              </h1>
            </div>
            <span className="time-label">{Math.round(progress)}%</span>
          </div>
          <div className="progress-track" role="progressbar" aria-label="Song progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="activity-stage">
            {playback === "counting" && (
              <div className="count-in" role="status" aria-live="polite">
                <span>Count in</span><strong>{countInBeat}</strong>
                <div aria-hidden="true">{[1, 2, 3, 4].map((beat) => <i key={beat} className={beat <= countInBeat ? "filled" : ""} />)}</div>
              </div>
            )}
            <button
              className={`tap-button ${tapFlash ? "is-tapped" : ""}`}
              onPointerDown={(event) => {
                if (!shouldRecordRhythmPointer(event)) return;
                event.preventDefault();
                recordTap();
              }}
              disabled={playback !== "playing"}
              aria-describedby="tap-help"
            >
              <span aria-hidden="true">♪</span><strong>TAP</strong>
            </button>
            <p id="tap-help" className="tap-help">
              {playback === "playing" ? "Tap here or press the spacebar" : playback === "counting" ? "Listen to the four-count" : playback === "paused" ? "Press resume when you’re ready" : "Press start to hear the count-in"}
            </p>
          </div>
          <div className="controls" aria-label="Playback controls">
            <button onClick={start} disabled={playback === "counting" || playback === "playing"}><span aria-hidden="true">{playback === "paused" ? "▶" : "●"}</span> {playback === "paused" ? "Resume" : "Start"}</button>
            <button onClick={pause} disabled={playback !== "counting" && playback !== "playing"}><span aria-hidden="true">Ⅱ</span> Pause</button>
            <button onClick={restartSong} disabled={playback === "ready"}><span aria-hidden="true">↻</span> Restart Song</button>
            {teamActivity && musicSource === "spotify" && (
              <>
                <button onClick={() => void replaySong()} disabled={playback === "counting"}><span aria-hidden="true">↺</span> Replay Song</button>
                <button onClick={skipSong}><span aria-hidden="true">⏭</span> Skip Song</button>
              </>
            )}
            {teamActivity && <button className="danger-control" onClick={endTeamGame}><span aria-hidden="true">■</span> End Game</button>}
          </div>
          {playbackMessage && <p className="setup-validation playback-message" role="alert"><span aria-hidden="true">!</span>{playbackMessage}</p>}
        </section>
      )}

      {screen === "solo-results" && result && (
        <section className="screen results-screen" aria-labelledby="results-title">
          <div className="celebration" aria-hidden="true">★</div>
          <p className="eyebrow">Nice listening!</p>
          <h1 id="results-title">{result.headline}</h1>
          <p className="lead">{result.message}</p>
          <div className="score-grid">
            <article><span className="score-icon" aria-hidden="true">◎</span><div><p>Beat match</p><strong>{result.accuracyScore}<small>%</small></strong></div><span className="score-word">{result.accuracyLabel}</span></article>
            <article><span className="score-icon" aria-hidden="true">≋</span><div><p>Steady taps</p><strong>{result.consistencyScore}<small>%</small></strong></div><span className="score-word">{result.consistencyLabel}</span></article>
          </div>
          <p className="result-detail">You matched <strong>{result.matchedBeats}</strong> of <strong>{result.expectedBeats}</strong> beats with {result.tapCount} taps.</p>
          <div className="button-row">
            <button className="text-button" onClick={goHome}>All done</button>
            <button className="primary-button" onClick={() => { restartSong(); setScreen("solo-activity"); }}>Try again <span aria-hidden="true">↻</span></button>
          </div>
        </section>
      )}

      {screen === "team-results" && result && teamGame && previousTurn && (
        <section className="screen team-results-screen" aria-labelledby="team-results-title">
          <TeamScoreboard game={teamGame} />
          <p className="eyebrow">{previousTurn.teamName}&apos;s turn</p>
          <h1 id="team-results-title">Great tapping!</h1>
          <div className="turn-result-grid">
            <article><span>Beat match</span><strong>{result.accuracyScore}%</strong><small>Accuracy</small></article>
            <article><span>Steady taps</span><strong>{result.consistencyScore}%</strong><small>Consistency</small></article>
            <article className="points-earned"><span>Team points</span><strong>+{previousTurn.points}</strong><small>Points earned!</small></article>
          </div>
          <p className="up-next"><span>Up next:</span> <strong>{teamGame.teams[teamGame.activeTeamId].name}</strong></p>
          <div className="team-result-actions">
            <button className="primary-button giant-button" onClick={() => {
              restartSong();
              if (teamGame.turns.length >= plannedTurns || (musicSource === "spotify" && !songPool?.available.length)) {
                endTeamGame();
              } else {
                setScreen("team-turn");
              }
            }}>
              {teamGame.turns.length >= plannedTurns || (musicSource === "spotify" && !songPool?.available.length)
                ? "See Winner"
                : "Next Turn"} <span aria-hidden="true">→</span>
            </button>
            <button className="switch-button" onClick={() => setTeamGame(switchTeam(teamGame))}>⇄ Switch Team</button>
          </div>
          <div className="teacher-actions compact">
            <button onClick={undoTeamScore}>↶ Undo Last Score</button>
            <button className="danger-action" onClick={endTeamGame}>■ End Game</button>
          </div>
        </section>
      )}

      {screen === "team-winner" && teamGame && (() => {
        const winner = getWinner(teamGame);
        const isTie = winner === "tie";
        return (
          <section className="screen winner-screen" aria-labelledby="winner-title">
            <div className="winner-burst" aria-hidden="true">{isTie ? "♫" : "★"}</div>
            <p className="eyebrow">That&apos;s the game!</p>
            <h1 id="winner-title">{isTie ? "It’s a tie!" : `${teamGame.teams[winner].name} wins!`}</h1>
            <p className="lead">{isTie ? "Both teams kept an amazing beat!" : "Big cheers for both teams!"}</p>
            <TeamScoreboard game={teamGame} />
            <p className="turn-count">{teamGame.turns.length} {teamGame.turns.length === 1 ? "turn" : "turns"} played</p>
            <div className="button-row">
              <button className="text-button" onClick={goHome}>Home</button>
              <button className="primary-button giant-button" onClick={playAgain}>Play Again <span aria-hidden="true">↻</span></button>
            </div>
          </section>
        );
      })()}

      <footer>{screen.startsWith("team-") ? "Teacher-led Team Mode" : screen.startsWith("class-") ? "Teacher-hosted Class Play" : "Classroom beat activity"} · Audio on</footer>
    </main>
  );
}
