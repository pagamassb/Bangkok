-- ============================================================
-- Organiser sign-up requests + "organisers edit only their own events"
-- Run once in Supabase > SQL Editor > New query. Safe to run again.
-- ============================================================

-- Admin = you. Admins can do everything; organisers only manage their own events.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------- Requests to become an organiser ----------
create table if not exists public.organiser_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique default auth.uid() references public.profiles (id) on delete cascade,
  org_name    text not null check (char_length(org_name) between 1 and 80),
  contact     text not null check (char_length(contact) between 1 and 120),
  styles      text[] not null default '{}',
  message     text check (message is null or char_length(message) <= 500),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.organiser_requests enable row level security;

drop policy if exists "see own request or admin" on public.organiser_requests;
create policy "see own request or admin" on public.organiser_requests
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "send own request" on public.organiser_requests;
create policy "send own request" on public.organiser_requests
  for insert to authenticated with check (user_id = auth.uid() and status = 'pending');

-- A declined person may try again: they can delete their own declined request.
drop policy if exists "remove own declined request" on public.organiser_requests;
create policy "remove own declined request" on public.organiser_requests
  for delete to authenticated using ((user_id = auth.uid() and status = 'declined') or public.is_admin());

revoke update on public.organiser_requests from anon, authenticated;

-- Approve / decline (only admins; runs with owner rights so it can change the role)
create or replace function public.review_organiser(req_id uuid, approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  if not public.is_admin() then raise exception 'Only admins can review requests'; end if;
  update public.organiser_requests
     set status = case when approve then 'approved' else 'declined' end, reviewed_at = now()
   where id = req_id
   returning user_id into uid;
  if uid is null then raise exception 'Request not found'; end if;
  if approve then
    update public.profiles set role = 'organiser' where id = uid and role = 'dancer';
  end if;
end $$;

revoke execute on function public.review_organiser(uuid, boolean) from public, anon;
grant execute on function public.review_organiser(uuid, boolean) to authenticated;

-- ---------- Organisers manage only their own events; admins manage all ----------
drop policy if exists "organisers insert events" on public.events;
create policy "organisers insert events" on public.events
  for insert to authenticated
  with check (public.is_organiser() and created_by = auth.uid());

drop policy if exists "organisers update events" on public.events;
create policy "organisers update events" on public.events
  for update to authenticated
  using (public.is_admin() or (public.is_organiser() and created_by = auth.uid()))
  with check (public.is_admin() or (public.is_organiser() and created_by = auth.uid()));

drop policy if exists "organisers delete events" on public.events;
create policy "organisers delete events" on public.events
  for delete to authenticated
  using (public.is_admin() or (public.is_organiser() and created_by = auth.uid()));

-- Only admins may hand an event to someone else.
create or replace function public.events_keep_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.created_by is distinct from old.created_by and not public.is_admin() then
    new.created_by := old.created_by;
  end if;
  return new;
end $$;
drop trigger if exists events_keep_owner on public.events;
create trigger events_keep_owner before update on public.events
  for each row execute function public.events_keep_owner();

-- Guest lists: only the event's organiser (or an admin) sees and checks people in.
create or replace function public.owns_event(eid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() or exists (select 1 from public.events e where e.id = eid and e.created_by = auth.uid());
$$;

drop policy if exists "read own rsvps or organiser" on public.rsvps;
create policy "read own rsvps or organiser" on public.rsvps
  for select to authenticated using (user_id = auth.uid() or public.owns_event(event_id));

drop policy if exists "organisers update rsvps" on public.rsvps;
create policy "organisers update rsvps" on public.rsvps
  for update to authenticated using (public.owns_event(event_id)) with check (public.owns_event(event_id));

drop policy if exists "organisers remove rsvps" on public.rsvps;
create policy "organisers remove rsvps" on public.rsvps
  for delete to authenticated using (public.owns_event(event_id));

-- Admins see everyone's profile; organisers see only their own guests.
drop policy if exists "read own profile or organiser" on public.profiles;
create policy "read own profile or organiser" on public.profiles
  for select to authenticated using (
    id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.rsvps r where r.user_id = profiles.id and public.owns_event(r.event_id))
  );
