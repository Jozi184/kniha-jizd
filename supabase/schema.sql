create table public.ride_logs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  odometer_km numeric not null default 0 check(odometer_km >= 0),
  trips jsonb not null default '[]'::jsonb check(jsonb_typeof(trips) = 'array'),
  revision bigint not null default 0 check(revision >= 0),
  updated_at timestamptz not null default now()
);
alter table public.ride_logs enable row level security;
revoke all on public.ride_logs from anon;
grant select, insert, update on public.ride_logs to authenticated;
create policy ride_logs_select on public.ride_logs for select to authenticated using ((select auth.uid()) = user_id);
create policy ride_logs_insert on public.ride_logs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy ride_logs_update on public.ride_logs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create function public.save_ride_log(p_odometer numeric, p_trips jsonb, p_revision bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid(); trip jsonb; point jsonb; next_revision bigint;
begin
  if uid is null then raise exception 'Přihlas se.' using errcode='28000'; end if;
  if p_odometer is null or p_odometer < 0 or p_odometer::text in ('NaN','Infinity','-Infinity') or p_revision is null or p_revision < 0
     or p_trips is null or jsonb_typeof(p_trips) <> 'array' or octet_length(p_trips::text) > 1000000 then
    raise exception 'Neplatná kniha jízd.' using errcode='22023';
  end if;
  for trip in select value from jsonb_array_elements(p_trips) loop
    if jsonb_typeof(trip) <> 'object' or jsonb_typeof(trip->'id') is distinct from 'number'
       or jsonb_typeof(trip->'distanceKm') is distinct from 'number' or (trip->>'distanceKm')::numeric <= 0
       or jsonb_typeof(trip->'startedAt') is distinct from 'number' or jsonb_typeof(trip->'endedAt') is distinct from 'number'
       or jsonb_typeof(trip->'odometerStart') is distinct from 'number' or jsonb_typeof(trip->'odometerEnd') is distinct from 'number'
       or jsonb_typeof(trip->'type') is distinct from 'string' or jsonb_typeof(trip->'note') is distinct from 'string'
       or (trip ? 'from' and jsonb_typeof(trip->'from') <> 'string') or (trip ? 'to' and jsonb_typeof(trip->'to') <> 'string') then
      raise exception 'Neplatná jízda.' using errcode='22023';
    end if;
    if trip ? 'route' then
      if jsonb_typeof(trip->'route') <> 'array' or jsonb_array_length(trip->'route') > 1024 then raise exception 'Neplatná trasa.' using errcode='22023'; end if;
      for point in select value from jsonb_array_elements(trip->'route') loop
        if jsonb_typeof(point) <> 'array' or jsonb_array_length(point) <> 3
          or jsonb_typeof(point->0) is distinct from 'number' or jsonb_typeof(point->1) is distinct from 'number' or jsonb_typeof(point->2) is distinct from 'number'
          or abs((point->>0)::numeric) > 90 or abs((point->>1)::numeric) > 180 or (point->>2)::numeric not in (0,1) then
          raise exception 'Neplatný bod trasy.' using errcode='22023';
        end if;
      end loop;
    end if;
  end loop;
  insert into public.ride_logs as existing(user_id,odometer_km,trips,revision)
  select uid,p_odometer,p_trips,1 where p_revision=0 or exists(select 1 from public.ride_logs where user_id=uid)
  on conflict(user_id) do update set odometer_km=excluded.odometer_km,trips=excluded.trips,
     revision=existing.revision+1,updated_at=now()
  where existing.revision=p_revision
  returning revision into next_revision;
  if next_revision is null then raise exception 'Kniha jízd se změnila na jiném zařízení. Obnov ji před uložením.' using errcode='40001'; end if;
  return jsonb_build_object('revision',next_revision);
end; $$;
revoke all on function public.save_ride_log(numeric,jsonb,bigint) from public, anon;
grant execute on function public.save_ride_log(numeric,jsonb,bigint) to authenticated;
