-- RiftBuild schema (DECISIONS.md D5, D9, D10). Game data lives in versioned bundles in Storage, not in tables;
-- the database keeps release history, admin corrections, AI cache/quotas/logs and optional user profiles.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------------------------------
-- Admins
-- ---------------------------------------------------------------------------------------------------
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------------------------------
-- Catalog releases and game state (public read)
-- ---------------------------------------------------------------------------------------------------
create table public.catalog_releases (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('catalog', 'meta')),
  patch text not null check (patch ~ '^\d+\.\d+[a-z]?$'),
  hash text not null check (hash ~ '^sha256:[0-9a-f]{64}$'),
  storage_path text not null,
  bytes integer not null check (bytes >= 0),
  schema_version integer not null default 1,
  status text not null default 'published' check (status in ('published', 'blocked', 'superseded')),
  validation_report jsonb not null default '{}'::jsonb,
  published_at timestamptz not null default now(),
  unique (kind, hash)
);
alter table public.catalog_releases enable row level security;
create policy catalog_releases_read on public.catalog_releases for select to anon, authenticated using (true);

create table public.game_state (
  id integer primary key default 1 check (id = 1),
  current_game_patch text not null check (current_game_patch ~ '^\d+\.\d+[a-z]?$'),
  source_url text not null check (source_url like 'https://%'),
  detected_at timestamptz not null
);
alter table public.game_state enable row level security;
create policy game_state_read on public.game_state for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------------------------------
-- Admin-editable data (spec §4.2 item 4, §5.4 alias table)
-- ---------------------------------------------------------------------------------------------------
create table public.champion_aliases (
  id bigint generated always as identity primary key,
  champion_id text not null check (champion_id ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  alias text not null check (length(alias) between 1 and 40),
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (alias)
);
alter table public.champion_aliases enable row level security;
create policy champion_aliases_admin on public.champion_aliases for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create table public.data_overrides (
  id bigint generated always as identity primary key,
  entity_kind text not null check (entity_kind in ('champion', 'item', 'rune', 'spell', 'meta')),
  entity_id text not null,
  field text not null,
  value jsonb not null,
  reason text not null check (length(reason) > 0),
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.data_overrides enable row level security;
create policy data_overrides_admin on public.data_overrides for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create table public.staged_meta (
  id bigint generated always as identity primary key,
  payload jsonb not null,
  source text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);
alter table public.staged_meta enable row level security;
create policy staged_meta_admin on public.staged_meta for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------------------------------
-- AI: cache, quotas and call log (service role only: no policies on purpose)
-- ---------------------------------------------------------------------------------------------------
create table public.ai_cache (
  key text primary key,
  kind text not null check (kind in ('draft', 'build_review', 'meta_tips')),
  patch text not null,
  bundle_hash text not null,
  model text not null,
  prompt_version text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  hit_count integer not null default 0
);
alter table public.ai_cache enable row level security;
create index ai_cache_expires_idx on public.ai_cache (expires_at);

create table public.ai_usage_daily (
  subject text not null,
  day date not null,
  kind text not null,
  count integer not null default 0 check (count >= 0),
  primary key (subject, day, kind)
);
alter table public.ai_usage_daily enable row level security;

create table public.ai_calls (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null,
  subject_hash text not null,
  model text,
  patch text,
  cache_hit boolean not null default false,
  attempts integer not null default 0,
  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer,
  cache_creation_tokens integer,
  ttft_ms integer,
  latency_ms integer,
  status text not null check (status in ('ok', 'incomplete', 'error', 'rate_limited', 'refused', 'timeout')),
  error_code text,
  removed_ids text[] not null default '{}',
  prompt_version text
);
alter table public.ai_calls enable row level security;
create index ai_calls_created_idx on public.ai_calls (created_at);

-- Atomic per-subject daily quota: returns allowed=false once the limit is reached.
create or replace function public.consume_ai_quota(p_subject text, p_kind text, p_limit integer)
returns table (allowed boolean, used integer)
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  insert into public.ai_usage_daily as u (subject, day, kind, count)
  values (p_subject, (now() at time zone 'utc')::date, p_kind, 1)
  on conflict (subject, day, kind) do update set count = u.count + 1
    where u.count < p_limit
  returning u.count into v_count;
  if v_count is null then
    select u.count into v_count from public.ai_usage_daily u
      where u.subject = p_subject and u.day = (now() at time zone 'utc')::date and u.kind = p_kind;
    return query select false, coalesce(v_count, p_limit);
  else
    return query select true, v_count;
  end if;
end;
$$;
revoke all on function public.consume_ai_quota(text, text, integer) from public, anon, authenticated;

create or replace view public.ai_latency_daily with (security_invoker = true) as
select
  date_trunc('day', created_at) as day,
  kind,
  count(*) as calls,
  count(*) filter (where cache_hit) as cache_hits,
  percentile_cont(0.5) within group (order by latency_ms) filter (where not cache_hit) as p50_latency_ms,
  percentile_cont(0.95) within group (order by latency_ms) filter (where not cache_hit) as p95_latency_ms,
  percentile_cont(0.5) within group (order by ttft_ms) filter (where not cache_hit) as p50_ttft_ms,
  sum(input_tokens) as input_tokens,
  sum(output_tokens) as output_tokens
from public.ai_calls
group by 1, 2;
revoke all on public.ai_latency_daily from anon, authenticated;

-- ---------------------------------------------------------------------------------------------------
-- Optional account data (spec §5.6; LGPD: minimal, owner-only, easy deletion)
-- ---------------------------------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  mains text[] not null default '{}',
  role text check (role in ('baron', 'jungle', 'mid', 'dragon', 'support')),
  elo text,
  style text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy profiles_owner on public.profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.shared_builds (
  code text primary key check (code ~ '^[A-Za-z0-9_-]{6,16}$'),
  payload jsonb not null check (pg_column_size(payload) < 8192),
  created_by uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.shared_builds enable row level security;
create policy shared_builds_read on public.shared_builds for select to anon, authenticated using (true);
create policy shared_builds_insert on public.shared_builds for insert to authenticated
  with check (created_by = auth.uid());

-- LGPD: a signed-in user (anonymous included) deletes everything tied to their id.
create or replace function public.delete_my_data() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  delete from public.profiles where user_id = v_uid;
  delete from public.shared_builds where created_by = v_uid;
  delete from public.ai_usage_daily where subject = 'u:' || v_uid::text;
end;
$$;
revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;
