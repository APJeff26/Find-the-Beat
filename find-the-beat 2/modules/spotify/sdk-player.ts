import { playSpotifyTrack, transferPlayback } from "./api";

declare global {
  interface Window {
    Spotify?: {
      Player: new (options: {
        name: string;
        volume: number;
        getOAuthToken: (callback: (token: string) => void) => void;
      }) => SpotifySdkPlayer;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

interface SpotifySdkState {
  position: number;
  duration: number;
  paused: boolean;
}

interface SpotifySdkPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  activateElement(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  getCurrentState(): Promise<SpotifySdkState | null>;
  addListener(event: string, callback: (value: unknown) => void): boolean;
}

let sdkPromise: Promise<void> | null = null;

function loadSpotifySdk(): Promise<void> {
  if (window.Spotify) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = resolve;
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    script.onerror = () => reject(new Error("The Spotify player could not be loaded."));
    document.head.appendChild(script);
  });
  return sdkPromise;
}

export class SpotifyPlaybackController {
  private player: SpotifySdkPlayer | null = null;
  private deviceId: string | null = null;
  private lastState: SpotifySdkState | null = null;
  private stateTimer: number | null = null;

  constructor(private readonly getAccessToken: () => Promise<string | null>) {}

  async connect(): Promise<void> {
    if (this.player && this.deviceId) return;
    await loadSpotifySdk();
    if (!window.Spotify) throw new Error("Spotify playback is not available.");
    this.player = new window.Spotify.Player({
      name: "Find the Beat Classroom",
      volume: 0.8,
      getOAuthToken: (callback) => {
        void this.getAccessToken().then((token) => {
          if (token) callback(token);
        });
      },
    });
    this.player.addListener("ready", (value) => {
      this.deviceId = (value as { device_id: string }).device_id;
    });
    this.player.addListener("not_ready", () => { this.deviceId = null; });
    this.player.addListener("player_state_changed", (value) => {
      this.lastState = value as SpotifySdkState | null;
    });
    this.player.addListener("authentication_error", () => { this.deviceId = null; });
    const connected = await this.player.connect();
    if (!connected) throw new Error("Spotify could not create a classroom player.");
    await this.waitForDevice();
    this.stateTimer = window.setInterval(() => { void this.refreshState(); }, 250);
  }

  async activate(): Promise<void> {
    // The SDK element must be activated from the teacher's Start gesture.
    if (!this.player || !this.deviceId) await this.connect();
    await this.player?.activateElement();
  }

  async play(uri: string): Promise<void> {
    if (!this.player || !this.deviceId) await this.connect();
    const token = await this.getAccessToken();
    if (!token || !this.deviceId) throw new Error("Spotify is disconnected.");
    await transferPlayback(token, this.deviceId);
    await playSpotifyTrack(token, this.deviceId, uri);
  }

  async pause(): Promise<void> { await this.player?.pause(); }
  async resume(): Promise<void> { await this.player?.resume(); }
  async restart(): Promise<void> { await this.player?.seek(0); }
  getPositionMs(): number { return this.lastState?.position ?? 0; }

  async stop(): Promise<void> {
    await this.player?.pause();
    await this.player?.seek(0);
    this.lastState = null;
  }

  disconnect(): void {
    if (this.stateTimer !== null) window.clearInterval(this.stateTimer);
    this.player?.disconnect();
    this.player = null;
    this.deviceId = null;
    this.lastState = null;
  }

  private async refreshState(): Promise<void> {
    this.lastState = await this.player?.getCurrentState() ?? this.lastState;
  }

  private async waitForDevice(): Promise<void> {
    const startedAt = Date.now();
    while (!this.deviceId && Date.now() - startedAt < 10_000) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    if (!this.deviceId) throw new Error("Spotify player did not become ready.");
  }
}
