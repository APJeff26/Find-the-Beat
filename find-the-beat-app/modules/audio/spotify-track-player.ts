import type { BeatMap } from "../beat-map/beat-map";
import type { SpotifyPlaybackController } from "../spotify/sdk-player";

/**
 * Adapts Spotify playback to the same audio-timeline contract used by the
 * existing activity. The first four beats remain a silent visual count-in.
 * Spotify begins only after it ends, and its playback position becomes the
 * shared tap timeline.
 */
export class SpotifyTrackPlayer {
  private context: AudioContext | null = null;
  private startTimeSeconds = 0;
  private trackStarted = false;
  private startingTrack = false;
  private stopped = false;
  private error: Error | null = null;

  constructor(
    private readonly beatMap: BeatMap,
    private readonly trackUri: string,
    private readonly playback: SpotifyPlaybackController,
  ) {}

  async start(): Promise<void> {
    this.stopped = false;
    this.context = new AudioContext();
    await this.playback.activate();
    await this.context.resume();
    this.startTimeSeconds = this.context.currentTime + 0.08;
  }

  async pause(): Promise<void> {
    if (this.trackStarted) await this.playback.pause();
    else await this.context?.suspend();
  }

  async resume(): Promise<void> {
    if (this.trackStarted) await this.playback.resume();
    else await this.context?.resume();
  }

  getPositionMs(): number {
    if (!this.context) return 0;
    const countInPosition = Math.max(0, (this.context.currentTime - this.startTimeSeconds) * 1000);
    if (!this.trackStarted && countInPosition >= this.beatMap.songStartMs && !this.startingTrack) {
      this.startingTrack = true;
      void this.playback.play(this.trackUri)
        .then(() => {
          if (!this.stopped) this.trackStarted = true;
        })
        .catch((error: unknown) => {
          this.error = error instanceof Error ? error : new Error("Spotify playback failed.");
        })
        .finally(() => { this.startingTrack = false; });
    }
    return this.trackStarted
      ? this.beatMap.songStartMs + this.playback.getPositionMs()
      : Math.min(countInPosition, this.beatMap.songStartMs - 1);
  }

  getError(): Error | null { return this.error; }

  stop(): void {
    this.stopped = true;
    if (this.context) void this.context.close();
    this.context = null;
    void this.playback.stop();
  }
}
