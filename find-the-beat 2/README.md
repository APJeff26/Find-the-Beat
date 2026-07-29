# Find the Beat

A deliberately small Next.js, React, TypeScript, and Tailwind prototype for
validating the core elementary steady-beat learning loop.

## Current experience

The home screen offers Solo Practice, teacher-led Team Mode, and Class Play.
The existing
solo activity supports touch, mouse, trackpad, and spacebar input, a four-beat
count-in, start/pause/resume/restart controls, progress, and encouraging
results.

Team Mode can use the local demo groove or a teacher's Spotify Premium
playlists. Before a game, the teacher connects Spotify, chooses a playlist,
enters any missing BPM values, chooses the number of turns, and names the
teams. Students only see the existing tapping experience.

There are no student accounts, classroom management features, uploads,
subscriptions, or server-side student records.

## Class Play — Phase 1

Class Play Phase 1 provides a teacher-hosted setup and live lobby. It reuses
the Spotify playlist and Track-ID BPM preparation already used by Team Mode.
The teacher creates a temporary session, receives a six-character code and
join URL, and sees students appear in real time at `/join`.

Each active join code maps to temporary records in Supabase Postgres. Vercel
Route Handlers are the authoritative owners of lobby mutations, capacity, lock
state, sanitized display names, and private connection credentials. Supabase
Realtime broadcasts lobby changes over an unguessable per-session topic.
No student account, email, password, Spotify credential, score, or permanent
profile is created. Inactive sessions expire after two hours.

Lobby controls include Remove Student, Lock/Unlock Joining, Cancel Session, and
Start Game. In Phase 1, Start Game locks the lobby and enters a Phase-2-ready
state; it does not start music or rhythm gameplay yet.

The default capacity is configured once rather than embedded throughout the
networking code:

`NEXT_PUBLIC_CLASS_PLAY_MAX_PLAYERS=30`

Set the same environment variable to a higher value for a future 40-, 50-, or
60-player deployment. Each session can still choose a lower limit.

Authoritative session data lives in Supabase, not browser storage.
The student browser keeps only its temporary reconnect credential in
`sessionStorage`, allowing the live service to recognize the same device
without creating an account.

## Spotify setup

Spotify uses Authorization Code with PKCE. This is a browser-safe OAuth flow:
the application needs a public client ID but does not use or expose a client
secret. Access and refresh tokens are kept in browser session storage and the
access token is refreshed automatically.

1. Create an app in the Spotify Developer Dashboard.
2. Add these redirect URIs:
   - `http://127.0.0.1:3000/api/spotify/callback` for local development.
   - The exact deployed site origin followed by
     `/api/spotify/callback` for production.
3. Add your Spotify account to the app's allowlist while the Spotify app is in
   Development Mode.
4. Copy `.env.example` to `.env.local` and set:

   `NEXT_PUBLIC_SPOTIFY_CLIENT_ID=your_spotify_client_id`

   `NEXT_PUBLIC_SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/api/spotify/callback`

   `NEXT_PUBLIC_CLASS_PLAY_MAX_PLAYERS=30`

5. Restart/rebuild the app. Open Team Mode and choose Connect Spotify Premium.

Spotify Premium is required by the Web Playback SDK. The application requests
playlist read, streaming, profile, and playback-control scopes. No Spotify
password or client secret enters this application.

## Spotify music architecture

- `modules/spotify/auth.ts`: PKCE authorization, state verification, browser
  token storage, and automatic refresh.
- `modules/spotify/api.ts`: paginated playlist/track loading and Web API
  playback commands.
- `modules/spotify/sdk-player.ts`: one teacher-computer Web Playback SDK device.
- `modules/spotify/bpm-store.ts`: local metadata keyed by exact Spotify Track
  ID.
- `modules/spotify/song-pool.ts`: per-game shuffle, consume, skip/rotate, and
  undo restoration.
- `modules/audio/spotify-track-player.ts`: adapts Spotify to the same timeline
  contract as the existing demo player.

BPM metadata is stored in `localStorage` under
`find-the-beat:spotify-track-metadata:v1`. Each record contains Spotify Track
ID, song title, artist, BPM, and last-updated time. It persists in the same
browser/profile across sessions, but it is not synced or backed up.

At game start, playable tracks are deduplicated by Spotify Track ID and shuffled
into one pool. Completing a turn removes its song. Skip Song moves the current
song to the end of the unused pool. Undo restores the last used song as well as
the score. A new game creates a fresh shuffle.

## Placeholder audio

No licensed audio file is bundled yet. `SynthDemoPlayer` creates a short local
100 BPM demo with the Web Audio API. It schedules a count-in, low beat pulses,
and a simple pitched pattern against `AudioContext.currentTime`.

This is an intentionally documented placeholder. When a real local demo file
is available, add it beneath `public/audio/` and replace `SynthDemoPlayer` with
an audio-buffer implementation of the same start, pause, resume, stop, and
position contract. The beat map and evaluation logic do not need to change.

## Timing model

The playback clock is the source of truth. Sounds are scheduled in advance
against the Web Audio clock rather than with `setInterval`, which would drift.
Student taps are recorded as positions on that same audio timeline. Suspending
the audio context freezes the timeline, so pause and resume do not require
rewriting captured timestamps.

The fixed demo beat map has 100 BPM, four count-in beats, 24 scored beats, and
the first scored beat at 2,400 ms.

## Preliminary scoring

Each expected beat is paired with the nearest unused tap within ±300 ms.

- **Accuracy** combines beat coverage and closeness. Exact taps get full credit;
  credit falls linearly to zero at the matching-window edge. Misses score zero.
- **Consistency** uses the standard deviation of signed errors, so taps that are
  similarly early or late can still be steady. Its steadiness component falls
  from 100 at 0 ms deviation to zero at 180 ms, then beat coverage is applied.

These values are prototype metrics. They require teacher observation and
device testing before they should be interpreted as mastery scores.

## Team scoring

Team Mode does not modify the tap evaluator. Each student turn first produces
the same accuracy and consistency scores as Solo Practice. Team points are the
rounded average of those two percentages:

`points = round((accuracy + consistency) / 2)`

The score is added to the selected team. A small in-memory turn history makes
Undo Last Score possible. Scores reset when the page reloads, the teacher
returns home, or a new game begins.

## Accessibility

The flow uses semantic headings and buttons, visible focus states, text labels
alongside color, a programmatic progress indicator, keyboard support, live
count-in status, large touch targets, and reduced-motion support.

## Project checks

- `pnpm test`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

## Known limitations

- The synthesized placeholder is not a real classroom song.
- Browser, hardware, and Bluetooth output latency are not calibrated.
- Spotify tracks assume the first beat is at playback position zero. A future
  beat-offset calibration field will be needed for songs with introductions or
  pickups.
- Spotify scoring currently uses the first 30 seconds after the count-in.
- Spotify BPM values are local to one browser profile and can be cleared by
  browser storage controls.
- Spotify playlist item access can be limited to playlists the connected user
  owns or collaborates on.
- Class Play currently stops at the live lobby. Synchronized countdown,
  tapping, scoring, rankings, and multi-round play are intentionally deferred
  to Phases 2 and 3.
- A production Class Play deployment requires the Supabase migration beneath
  `supabase/migrations/` and the documented Vercel environment variables.
- Live Spotify authentication/playback requires a configured Spotify Client ID,
  an allowlisted Premium account, and an online browser; automated tests cover
  local logic but cannot supply those external credentials.
- Classroom use must comply with Spotify's Platform Terms and any applicable
  music/public-performance licensing. Spotify's Web Playback policy restricts
  broadcasting, so confirm that the intended classroom use is permitted before
  relying on it in production.
- Input timing still needs validation on representative iPads and Chromebooks.
- Scoring thresholds have not been validated with elementary music teachers.
- Session results are intentionally not saved.
- Team totals exist only in the current browser session.
