-- Supabase schema for managed realtime shared rooms.
-- Run in SQL editor before using shared rooms.

create extension if not exists pgcrypto;

create table if not exists public.room_members (
  room_code text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  alias text not null check (char_length(alias) between 1 and 24),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (room_code, user_id)
);

alter table public.room_members alter column user_id set default auth.uid();

create table if not exists public.room_rolls (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  room_name text not null,
  roller_id uuid not null references auth.users (id) on delete cascade,
  roller_alias text not null check (char_length(roller_alias) between 1 and 24),
  secret boolean not null default false,
  source text not null check (source in ('manual', 'formula', 'quick')),
  formula text null,
  modifier integer not null default 0,
  total integer not null,
  dice_pools jsonb not null,
  note text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_room_rolls_room_created on public.room_rolls (room_code, created_at desc, id desc);
create index if not exists idx_room_members_room on public.room_members (room_code);

alter table public.room_members enable row level security;
alter table public.room_rolls enable row level security;

create schema if not exists private;

create or replace function private.is_room_member(target_room_code text, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.room_members rm
    where rm.room_code = target_room_code
      and rm.user_id = target_user_id
  );
$$;

revoke all on function private.is_room_member(text, uuid) from public;
grant execute on function private.is_room_member(text, uuid) to authenticated;

create or replace function public.join_room(target_room_code text, target_alias text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.room_members (room_code, user_id, alias, last_seen_at)
  values (
    upper(trim(target_room_code)),
    auth.uid(),
    left(trim(target_alias), 24),
    now()
  )
  on conflict (room_code, user_id)
  do update set
    alias = excluded.alias,
    last_seen_at = excluded.last_seen_at;
end;
$$;

revoke all on function public.join_room(text, text) from public;
grant execute on function public.join_room(text, text) to authenticated;

create or replace function public.leave_room(target_room_code text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  delete from public.room_members
  where room_code = upper(trim(target_room_code))
    and user_id = auth.uid();
end;
$$;

revoke all on function public.leave_room(text) from public;
grant execute on function public.leave_room(text) to authenticated;

create or replace function public.list_rooms(max_rows integer default 100)
returns table (
  room_code text,
  active_members bigint,
  last_activity_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  with room_codes as (
    select upper(rm.room_code) as room_code
    from public.room_members rm
    union
    select upper(rr.room_code) as room_code
    from public.room_rolls rr
  ),
  member_stats as (
    select
      upper(rm.room_code) as room_code,
      count(*)::bigint as active_members,
      max(rm.last_seen_at) as last_seen_at
    from public.room_members rm
    group by upper(rm.room_code)
  ),
  roll_stats as (
    select
      upper(rr.room_code) as room_code,
      max(rr.created_at) as last_roll_at
    from public.room_rolls rr
    group by upper(rr.room_code)
  )
  select
    rc.room_code,
    coalesce(ms.active_members, 0) as active_members,
    greatest(
      coalesce(ms.last_seen_at, to_timestamp(0)),
      coalesce(rs.last_roll_at, to_timestamp(0))
    ) as last_activity_at
  from room_codes rc
  left join member_stats ms on ms.room_code = rc.room_code
  left join roll_stats rs on rs.room_code = rc.room_code
  order by last_activity_at desc, rc.room_code asc
  limit least(greatest(coalesce(max_rows, 100), 1), 200);
$$;

revoke all on function public.list_rooms(integer) from public;
grant execute on function public.list_rooms(integer) to authenticated;

drop policy if exists room_members_select_same_room on public.room_members;
create policy room_members_select_same_room on public.room_members
for select
to authenticated
using (private.is_room_member(room_code, auth.uid()));

drop policy if exists room_members_insert_self on public.room_members;
create policy room_members_insert_self on public.room_members
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists room_members_update_self on public.room_members;
create policy room_members_update_self on public.room_members
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists room_members_delete_self on public.room_members;
create policy room_members_delete_self on public.room_members
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists room_rolls_select_visible on public.room_rolls;
create policy room_rolls_select_visible on public.room_rolls
for select
to authenticated
using (
  private.is_room_member(room_code, auth.uid())
  and (
    room_rolls.secret = false
    or room_rolls.roller_id = auth.uid()
  )
);

drop policy if exists room_rolls_insert_self_member on public.room_rolls;
create policy room_rolls_insert_self_member on public.room_rolls
for insert
to authenticated
with check (
  roller_id = auth.uid()
  and private.is_room_member(room_code, auth.uid())
);

grant select, insert, update, delete on table public.room_members to authenticated;
grant select, insert on table public.room_rolls to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'room_rolls'
  ) then
    alter publication supabase_realtime add table public.room_rolls;
  end if;
end;
$$;
