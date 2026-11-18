-- Gatherly — Event Moments: core schema
-- Run this whole file once in Supabase → SQL Editor (or `supabase db push`).
-- It is idempotent where practical, so re-running it is safe.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.gatherly_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- admins: which Supabase Auth users may use /admin
-- ---------------------------------------------------------------------------
create table if not exists public.admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  role text not null default 'admin' check (role in ('owner', 'admin')),
  created_at timestamptz not null default now()
);

create or replace function public.gatherly_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- google_connections: the host's Google Drive OAuth grant (tokens encrypted
-- with TOKEN_ENCRYPTION_KEY by the server before they reach the database)
-- ---------------------------------------------------------------------------
create table if not exists public.google_connections (
  id uuid primary key default gen_random_uuid(),
  account_email text,
  scope text not null,
  refresh_token_enc text not null,
  access_token_enc text,
  access_token_expires_at timestamptz,
  root_folder_id text,
  status text not null default 'active' check (status in ('active', 'error', 'revoked')),
  last_error text,
  connected_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists google_connections_status_idx on public.google_connections (status, created_at desc);
drop trigger if exists google_connections_touch on public.google_connections;
create trigger google_connections_touch before update on public.google_connections
  for each row execute function public.gatherly_touch_updated_at();

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (char_length(event_name) between 1 and 120),
  event_slug text not null unique check (event_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(event_slug) between 3 and 80),
  description text check (description is null or char_length(description) <= 1000),
  event_date date,
  cover_image_url text,
  cover_drive_file_id text,
  google_drive_folder_id text,
  status text not null default 'active' check (status in ('draft', 'active', 'paused', 'ended')),
  upload_enabled boolean not null default true,
  gallery_enabled boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists events_created_at_idx on public.events (created_at desc);
drop trigger if exists events_touch on public.events;
create trigger events_touch before update on public.events
  for each row execute function public.gatherly_touch_updated_at();

-- ---------------------------------------------------------------------------
-- event_access_tokens: QR link tokens and short event codes.
-- token_hash = HMAC-SHA256 of the secret (server pepper) — used for lookup.
-- token_enc  = AES-256-GCM ciphertext so admins can re-display the QR later.
-- ---------------------------------------------------------------------------
create table if not exists public.event_access_tokens (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  kind text not null default 'link' check (kind in ('link', 'code')),
  token_hash text not null unique,
  token_enc text,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists event_access_tokens_event_idx on public.event_access_tokens (event_id, created_at desc);

-- ---------------------------------------------------------------------------
-- photos
-- ---------------------------------------------------------------------------
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  guest_name text check (guest_name is null or char_length(guest_name) <= 60),
  file_name text not null,
  google_drive_file_id text,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  sha256 text,
  client_upload_id text not null,
  upload_status text not null default 'pending' check (upload_status in ('pending', 'uploaded', 'failed')),
  error_message text,
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, client_upload_id)
);
create index if not exists photos_gallery_idx on public.photos (event_id, upload_status, uploaded_at desc, id desc);
create index if not exists photos_sha_idx on public.photos (event_id, sha256);
create index if not exists photos_created_idx on public.photos (event_id, created_at desc);
drop trigger if exists photos_touch on public.photos;
create trigger photos_touch before update on public.photos
  for each row execute function public.gatherly_touch_updated_at();

-- ---------------------------------------------------------------------------
-- upload_logs: append-only activity / error monitoring
-- ---------------------------------------------------------------------------
create table if not exists public.upload_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  photo_id uuid references public.photos (id) on delete set null,
  status text not null,
  error_message text,
  created_at timestamptz not null default now()
);
create index if not exists upload_logs_event_idx on public.upload_logs (event_id, created_at desc);

-- ---------------------------------------------------------------------------
-- rate_limits: fixed-window counters shared by every serverless instance
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

create or replace function public.gatherly_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, current_count integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_window interval := make_interval(secs => p_window_seconds);
  v_count integer;
  v_start timestamptz;
begin
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, v_now, 1)
  on conflict (key) do update set
    count = case when rl.window_start <= v_now - v_window then 1 else rl.count + 1 end,
    window_start = case when rl.window_start <= v_now - v_window then v_now else rl.window_start end
  returning rl.count, rl.window_start into v_count, v_start;

  -- Opportunistic cleanup so the table never grows unbounded.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < v_now - interval '1 day';
  end if;

  return query select v_count <= p_limit, v_count, v_start + v_window;
end;
$$;

-- ---------------------------------------------------------------------------
-- event_stats view for the admin dashboard
-- ---------------------------------------------------------------------------
create or replace view public.event_stats
with (security_invoker = true)
as
select
  e.id as event_id,
  count(p.id) filter (where p.upload_status = 'uploaded') as uploaded_count,
  count(p.id) filter (where p.upload_status = 'failed') as failed_count,
  count(p.id) filter (where p.upload_status = 'pending') as pending_count,
  max(p.uploaded_at) as last_upload_at
from public.events e
left join public.photos p on p.event_id = e.id
group by e.id;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- The Next.js server talks to the database with the service-role key (which
-- bypasses RLS) and enforces admin / guest rules itself. RLS here is the
-- second line of defence: the anon key gets nothing, and signed-in admins may
-- only read.
-- ---------------------------------------------------------------------------
alter table public.admins enable row level security;
alter table public.google_connections enable row level security;
alter table public.events enable row level security;
alter table public.event_access_tokens enable row level security;
alter table public.photos enable row level security;
alter table public.upload_logs enable row level security;
alter table public.rate_limits enable row level security;

revoke all on public.google_connections, public.event_access_tokens, public.rate_limits from anon, authenticated;
revoke all on public.admins, public.events, public.photos, public.upload_logs from anon;
revoke insert, update, delete on public.admins, public.events, public.photos, public.upload_logs from authenticated;
revoke all on public.event_stats from anon;

drop policy if exists "admins read own row" on public.admins;
create policy "admins read own row" on public.admins
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "admins read events" on public.events;
create policy "admins read events" on public.events
  for select to authenticated using (public.gatherly_is_admin());

drop policy if exists "admins read photos" on public.photos;
create policy "admins read photos" on public.photos
  for select to authenticated using (public.gatherly_is_admin());

drop policy if exists "admins read upload logs" on public.upload_logs;
create policy "admins read upload logs" on public.upload_logs
  for select to authenticated using (public.gatherly_is_admin());

revoke all on function public.gatherly_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.gatherly_rate_limit(text, integer, integer) to service_role;
revoke all on function public.gatherly_is_admin() from public, anon;
grant execute on function public.gatherly_is_admin() to authenticated, service_role;
