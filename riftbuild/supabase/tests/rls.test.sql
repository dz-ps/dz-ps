-- RLS and function tests. Each block raises on failure (psql runs with ON_ERROR_STOP=1).
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-0000000000ad');
insert into public.admins (user_id) values ('00000000-0000-0000-0000-0000000000ad');
insert into public.catalog_releases (kind, patch, hash, storage_path, bytes)
values ('catalog', '7.3b', 'sha256:' || repeat('a', 64), 'catalog/7.3b/x.json.gz', 10);
insert into public.game_state (current_game_patch, source_url, detected_at)
values ('7.3b', 'https://wildrift.leagueoflegends.com/', now());

-- anon can read releases and game state, but not write them
set role anon;
do $$ begin
  if (select count(*) from public.catalog_releases) <> 1 then raise exception 'anon should read catalog_releases'; end if;
  if (select count(*) from public.game_state) <> 1 then raise exception 'anon should read game_state'; end if;
  begin
    insert into public.catalog_releases (kind, patch, hash, storage_path, bytes)
    values ('meta', '7.3b', 'sha256:' || repeat('b', 64), 'x', 1);
    raise exception 'anon must not insert catalog_releases';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.ai_cache) <> 0 then raise exception 'anon must not see ai_cache'; end if;
end $$;
reset role;

-- a regular user cannot touch aliases; an admin can
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  begin
    insert into public.champion_aliases (champion_id, alias) values ('amumu', 'mumu');
    raise exception 'non-admin must not insert aliases';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', false);
insert into public.champion_aliases (champion_id, alias) values ('amumu', 'mumu');
do $$ begin
  if (select count(*) from public.champion_aliases) <> 1 then raise exception 'admin should manage aliases'; end if;
end $$;

-- profiles are owner-only
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.profiles (user_id, mains, role) values ('00000000-0000-0000-0000-00000000000a', '{warwick}', 'jungle');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  if (select count(*) from public.profiles) <> 0 then raise exception 'user b must not see user a profile'; end if;
  begin
    insert into public.profiles (user_id) values ('00000000-0000-0000-0000-00000000000a');
    raise exception 'user b must not write user a profile';
  exception when insufficient_privilege then null;
  end;
end $$;

-- authenticated users cannot call the quota function directly
do $$ begin
  begin
    perform public.consume_ai_quota('u:x', 'draft', 3);
    raise exception 'authenticated must not call consume_ai_quota';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- quota is atomic and stops at the limit (service role path)
do $$
declare r record; i int;
begin
  for i in 1..3 loop
    select * into r from public.consume_ai_quota('u:00000000-0000-0000-0000-00000000000a', 'draft', 3);
    if not r.allowed then raise exception 'call % should be allowed', i; end if;
  end loop;
  select * into r from public.consume_ai_quota('u:00000000-0000-0000-0000-00000000000a', 'draft', 3);
  if r.allowed or r.used <> 3 then raise exception 'fourth call must be refused (allowed=%, used=%)', r.allowed, r.used; end if;
end $$;

-- delete_my_data removes the caller's rows only
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.delete_my_data();
reset role;
do $$ begin
  if exists (select 1 from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a') then
    raise exception 'profile should be deleted';
  end if;
  if exists (select 1 from public.ai_usage_daily where subject = 'u:00000000-0000-0000-0000-00000000000a') then
    raise exception 'quota rows should be deleted';
  end if;
end $$;

-- storage buckets exist and are public
do $$ begin
  if (select count(*) from storage.buckets where id in ('catalog', 'icons') and public) <> 2 then
    raise exception 'catalog and icons buckets must be public';
  end if;
end $$;

select 'all RLS tests passed' as result;
