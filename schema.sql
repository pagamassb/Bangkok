-- ============================================================
-- Bangkok Social Floor — database setup
-- Paste this whole file into Supabase > SQL Editor > New query > Run.
-- Safe to run once on a new project.
-- ============================================================

-- ---------- People ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Dancer',
  avatar_url   text,
  role         text not null default 'dancer' check (role in ('dancer', 'organiser', 'admin')),
  created_at   timestamptz not null default now()
);

-- Create a profile automatically when someone signs in for the first time (Google or LINE).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''),
             nullif(new.raw_user_meta_data ->> 'name', ''),
             'Dancer'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- True when the signed-in person is an organiser or admin.
create or replace function public.is_organiser()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('organiser', 'admin')
  );
$$;

-- ---------- Events ----------
create table if not exists public.events (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  style            text not null default 'Other',
  status           text not null default 'on' check (status in ('on', 'cancelled')),
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  lesson           text,                     -- e.g. 'Beginner 19:15'
  venue            text not null,
  area             text,
  lat              double precision,
  lng              double precision,
  price_text       text,                     -- e.g. '300 THB incl. drink' (shown as text)
  host             text,
  note             text,
  -- Online tickets (switched on later, when payments are connected)
  tickets_enabled  boolean not null default false,
  ticket_price_thb integer check (ticket_price_thb is null or ticket_price_thb >= 0),
  capacity         integer check (capacity is null or capacity > 0),
  -- Change tracking, so dancers see "Moved · was 21:00"
  prev_starts_at   timestamptz,
  changed_at       timestamptz,
  going_count      integer not null default 0,
  is_sample        boolean not null default false,
  created_by       uuid references auth.users (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint ends_after_start check (ends_at > starts_at)
);

create index if not exists events_starts_at_idx on public.events (starts_at);

-- Record the old start time when an organiser moves an event,
-- and stop anyone editing the RSVP counter by hand.
create or replace function public.events_before_update()
returns trigger language plpgsql as $$
begin
  if pg_trigger_depth() = 1 then
    new.going_count := old.going_count;       -- only the RSVP trigger may change this
  end if;
  if new.starts_at is distinct from old.starts_at then
    new.prev_starts_at := old.starts_at;
    new.changed_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists events_before_update on public.events;
create trigger events_before_update
  before update on public.events
  for each row execute function public.events_before_update();

-- ---------- RSVPs (and, later, tickets) ----------
create table if not exists public.rsvps (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events (id) on delete cascade,
  user_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  payment_status text not null default 'free' check (payment_status in ('free', 'pending', 'paid', 'refunded')),
  amount_thb     integer,
  payment_ref    text,                       -- payment provider reference, filled by the server later
  checked_in     boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (event_id, user_id)
);

create index if not exists rsvps_user_idx on public.rsvps (user_id);

-- Keep events.going_count in step with the RSVP table (runs with owner rights).
create or replace function public.refresh_going_count()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  eid uuid := coalesce(new.event_id, old.event_id);
begin
  update public.events
     set going_count = (select count(*) from public.rsvps r
                        where r.event_id = eid and r.payment_status in ('free', 'paid'))
   where id = eid;
  return null;
end $$;

drop trigger if exists rsvps_count on public.rsvps;
create trigger rsvps_count
  after insert or delete or update of payment_status on public.rsvps
  for each row execute function public.refresh_going_count();

-- ---------- Security rules (Row Level Security) ----------
alter table public.profiles enable row level security;
alter table public.events   enable row level security;
alter table public.rsvps    enable row level security;

-- Events: everyone can read; only organisers can add, change or delete.
drop policy if exists "events readable by all" on public.events;
create policy "events readable by all" on public.events
  for select to anon, authenticated using (true);

drop policy if exists "organisers insert events" on public.events;
create policy "organisers insert events" on public.events
  for insert to authenticated with check (public.is_organiser());

drop policy if exists "organisers update events" on public.events;
create policy "organisers update events" on public.events
  for update to authenticated using (public.is_organiser()) with check (public.is_organiser());

drop policy if exists "organisers delete events" on public.events;
create policy "organisers delete events" on public.events
  for delete to authenticated using (public.is_organiser());

-- Profiles: you see yourself; organisers see everyone (for the guest list).
drop policy if exists "read own profile or organiser" on public.profiles;
create policy "read own profile or organiser" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_organiser());

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- People may change only their display name, never their role.
revoke update on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

-- RSVPs: you see your own; organisers see all for their door list.
drop policy if exists "read own rsvps or organiser" on public.rsvps;
create policy "read own rsvps or organiser" on public.rsvps
  for select to authenticated using (user_id = auth.uid() or public.is_organiser());

-- Free RSVP: only for yourself, only for events that are on and not ticketed.
drop policy if exists "rsvp for yourself" on public.rsvps;
create policy "rsvp for yourself" on public.rsvps
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and payment_status = 'free'
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.status = 'on' and e.tickets_enabled = false and e.ends_at > now()
    )
  );

-- Cancel your own free RSVP (paid tickets are refunded by an organiser instead).
drop policy if exists "cancel own free rsvp" on public.rsvps;
create policy "cancel own free rsvp" on public.rsvps
  for delete to authenticated using (user_id = auth.uid() and payment_status = 'free');

-- Organisers can tick people off at the door.
drop policy if exists "organisers update rsvps" on public.rsvps;
create policy "organisers update rsvps" on public.rsvps
  for update to authenticated using (public.is_organiser()) with check (public.is_organiser());

revoke update on public.rsvps from anon, authenticated;
grant update (checked_in) on public.rsvps to authenticated;

drop policy if exists "organisers remove rsvps" on public.rsvps;
create policy "organisers remove rsvps" on public.rsvps
  for delete to authenticated using (public.is_organiser());

-- ---------- Live updates ----------
-- Every open page hears event changes (new times, cancellations, RSVP counts) instantly.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.events;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- ---------- Sample events (labelled "Sample"; delete them once you add real nights) ----------
-- Dates are set relative to today, Bangkok time.
insert into public.events (title, style, starts_at, ends_at, lesson, venue, area, lat, lng, price_text, host, note, is_sample)
select v.title, v.style,
       ((now() at time zone 'Asia/Bangkok')::date + v.d + v.s) at time zone 'Asia/Bangkok',
       ((now() at time zone 'Asia/Bangkok')::date + v.d + v.s + v.len) at time zone 'Asia/Bangkok',
       v.lesson, v.venue, v.area, v.lat, v.lng, v.price, 'Example host', v.note, true
from (values
  ('Salsa Social',          'Salsa',            0, time '20:00', interval '4 hours 30 minutes', 'Beginner 19:15',        'Casa Clave',     'Thong Lo',     13.7262, 100.5801, '300 THB incl. drink', null),
  ('Bachata Night',         'Bachata',          1, time '20:30', interval '3 hours 30 minutes', 'Sensual basics 19:45',  'Studio Sala',    'Silom',        13.7290, 100.5320, '250 THB',             null),
  ('Ari Swing Night',       'Swing',            2, time '20:00', interval '3 hours',            'Lindy Hop taster 19:00','Hop Hall',       'Ari',          13.7790, 100.5430, '200 THB',             null),
  ('Milonga',               'Tango',            3, time '20:00', interval '4 hours',            null,                    'Salón Abrazo',   'Phrom Phong',  13.7310, 100.5690, '350 THB',             null),
  ('Kizomba & Urban Kiz',   'Kizomba',          4, time '21:00', interval '4 hours',            'Improvers 20:00',       'The Ginga Room', 'Ekkamai',      13.7200, 100.5870, '300 THB',             null),
  ('Latin Night',           'Salsa',            4, time '21:30', interval '4 hours 30 minutes', null,                    'Rooftop 11',     'Sukhumvit 11', 13.7440, 100.5550, '400 THB incl. drink', 'Salsa and bachata, 2:1'),
  ('West Coast Social',     'West Coast Swing', 5, time '19:00', interval '3 hours 30 minutes', 'Open level 18:00',      'Slot Studio',    'Sathorn',      13.7230, 100.5290, '250 THB',             null),
  ('Zouk Afternoon',        'Zouk',             6, time '15:00', interval '4 hours',            null,                    'Onda Studio',    'Ratchathewi',  13.7520, 100.5330, '250 THB',             null)
) as v(title, style, d, s, len, lesson, venue, area, lat, lng, price, note)
where not exists (select 1 from public.events);
