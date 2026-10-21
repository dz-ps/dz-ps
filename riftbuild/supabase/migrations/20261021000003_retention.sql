-- Retention (LGPD: keep only what is needed). Called daily by the pipeline workflow with the service role.
-- ai_calls rows carry only a salted hash of the caller, never the user id; they are kept 90 days for
-- latency/cost monitoring. Expired cache entries are dropped.
create or replace function public.purge_ai_logs(p_days integer default 90) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_calls integer;
  v_cache integer;
  v_usage integer;
begin
  delete from public.ai_calls where created_at < now() - make_interval(days => p_days);
  get diagnostics v_calls = row_count;
  delete from public.ai_cache where expires_at < now();
  get diagnostics v_cache = row_count;
  delete from public.ai_usage_daily where day < current_date - 7;
  get diagnostics v_usage = row_count;
  return jsonb_build_object('ai_calls', v_calls, 'ai_cache', v_cache, 'ai_usage_daily', v_usage);
end;
$$;
revoke all on function public.purge_ai_logs(integer) from public, anon, authenticated;
grant execute on function public.purge_ai_logs(integer) to service_role;
