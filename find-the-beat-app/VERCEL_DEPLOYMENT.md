# Find the Beat on Vercel

This project deploys as a standard Next.js application. Class Play uses Vercel
Route Handlers for authoritative commands and Supabase for temporary Postgres
state plus Realtime lobby broadcasts.

## 1. Create the Supabase project

1. Create a free project at https://supabase.com/dashboard.
2. Open **SQL Editor**.
3. Copy and run the complete contents of:
   `supabase/migrations/202607290001_class_play_phase1.sql`.
4. Open the project's **Connect** or **API Keys** panel and retain:
   - Project URL
   - Publishable key
   - Server-side service-role/secret key

The service-role key must never be committed, shown in browser code, or given
to student devices.

## 2. Put the existing repository on GitHub

Create an empty personal GitHub repository named `find-the-beat`. Do not add a
README or `.gitignore`, because both already exist.

From this project directory:

```bash
git remote add origin https://github.com/YOUR-NAME/find-the-beat.git
git push -u origin main
```

The ignored `.env.local` file is not pushed.

## 3. Import into Vercel

1. In Vercel choose **Add New → Project**.
2. Import the personal GitHub repository.
3. Use project root `.`.
4. Keep the **Next.js** framework preset.
5. The configured build command is `next build`.
6. Add the Spotify variables below before deploying if Spotify playback is wanted.

## 4. Vercel environment variables

The temporary Solo and Team production version does not require Supabase.
For Spotify Premium playback, add these browser-safe values:

```text
NEXT_PUBLIC_SPOTIFY_CLIENT_ID
NEXT_PUBLIC_SPOTIFY_REDIRECT_URI
```

If Spotify is not configured, Solo and Team Mode remain usable with the built-in
demo song.

The following preserved Class Play variables are not required for this temporary
production version:

```text
NEXT_PUBLIC_CLASS_PLAY_MAX_PLAYERS
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Do not add the Supabase service-role key until Class Play is enabled again.

## 5. Spotify callback

For a Vercel project at `https://YOUR-PROJECT.vercel.app`, use:

```text
NEXT_PUBLIC_SPOTIFY_REDIRECT_URI=https://YOUR-PROJECT.vercel.app/api/spotify/callback
```

Add that exact URI in the Spotify Developer Dashboard and redeploy after
changing it.

## 6. Public classroom check

1. Open the production URL as the teacher.
2. Confirm the home screen offers Solo Practice and Team Mode only.
3. Play the demo song in Solo Practice.
4. Start Team Mode, complete a turn, and confirm the score is added.
5. If Spotify is configured, connect Spotify and test playlist playback.
6. Open `/join` and confirm it displays the temporary Class Play unavailable
   message rather than a join form.

All Class Play source, routes, and database migration files remain in the
repository for a future production release.
