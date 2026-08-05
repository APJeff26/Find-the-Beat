create extension if not exists pgcrypto;

create table if not exists public.class_play_sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code) = 6),
  teacher_token uuid not null unique,
  lobby_channel uuid not null unique,
  status text not null default 'lobby' check (status in ('lobby', 'ready', 'cancelled')),
  locked boolean not null default false,
  max_players integer not null check (max_players between 1 and 200),
  playlist_name text not null check (char_length(playlist_name) between 1 and 100),
  planned_songs integer not null check (planned_songs between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours')
);

create table if not exists public.class_play_players (
  id uuid primary key,
  session_id uuid not null references public.class_play_sessions(id) on delete cascade,
  reconnect_token uuid not null unique,
  display_name text not null check (char_length(display_name) between 1 and 20),
  joined_at timestamptz not null default now()
);

create unique index if not exists class_play_player_name_unique
  on public.class_play_players (session_id, lower(display_name));

create index if not exists class_play_sessions_expiry
  on public.class_play_sessions (expires_at);

alter table public.class_play_sessions enable row level security;
alter table public.class_play_players enable row level security;

-- No public table policies are created. Only Vercel Route Handlers using the
-- server-side service-role key may read or mutate authoritative lobby state.

create or replace function public.join_class_play_session(
  p_code text,
  p_requested_name text,
  p_player_id uuid,
  p_reconnect_token uuid
)
returns table(session_id uuid, display_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_session public.class_play_sessions%rowtype;
  candidate_name text := p_requested_name;
  suffix integer := 2;
begin
  select *
    into selected_session
    from public.class_play_sessions
    where code = upper(p_code)
      and expires_at > now()
    for update;

  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  if selected_session.locked or selected_session.status <> 'lobby' then
    raise exception 'JOINING_LOCKED';
  end if;
  if (
    select count(*) from public.class_play_players
    where class_play_players.session_id = selected_session.id
  ) >= selected_session.max_players then
    raise exception 'SESSION_FULL';
  end if;

  while exists (
    select 1 from public.class_play_players
    where class_play_players.session_id = selected_session.id
      and lower(class_play_players.display_name) = lower(candidate_name)
  ) loop
    candidate_name :=
      left(p_requested_name, 20 - char_length(' ' || suffix::text))
      || ' ' || suffix::text;
    suffix := suffix + 1;
  end loop;

  insert into public.class_play_players (
    id,
    session_id,
    reconnect_token,
    display_name
  ) values (
    p_player_id,
    selected_session.id,
    p_reconnect_token,
    candidate_name
  );

  update public.class_play_sessions
    set updated_at = now(),
        expires_at = now() + interval '2 hours'
    where id = selected_session.id;

  return query select selected_session.id, candidate_name;
end;
$$;

revoke all on function public.join_class_play_session(text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.join_class_play_session(text, text, uuid, uuid)
  to service_role;
