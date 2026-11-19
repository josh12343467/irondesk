-- =====================================================================================
-- IronDesk · initial schema
--
-- Security model
--   * Row Level Security (RLS) on every table. The browser only ever holds the public
--     (anon/publishable) key, so these policies ARE the authorisation layer.
--   * Roles: admin / staff (rows in public.staff) and member (public.members.user_id = auth.uid()).
--   * Admin actions require MFA (aal2) once the admin has enrolled a factor.
--   * Multi-step business operations (registration, renewal, check-in, booking, erasure)
--     run in SECURITY DEFINER functions that validate the caller and the rules atomically.
--   * activity_log is append-only for clients and is written by triggers.
--   * All "today" logic uses Philippine time (Asia/Manila), not the server's UTC clock.
-- =====================================================================================

-- ---------- helpers that don't depend on tables ----------

create or replace function public.ph_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Manila')::date
$$;

-- ---------- tables ----------

create table public.settings (
  id               int primary key default 1 check (id = 1),
  gym_name         text not null default 'My Gym' check (length(gym_name) between 1 and 80),
  walk_in_price    int  not null default 100 check (walk_in_price between 0 and 100000),
  legal_name       text not null default '' check (length(legal_name) <= 120),
  address          text not null default '' check (length(address) <= 240),
  dpo_name         text not null default '' check (length(dpo_name) <= 120),
  dpo_email        text not null default '' check (length(dpo_email) <= 120),
  retention_months int  not null default 24 check (retention_months between 1 and 120),
  updated_at       timestamptz not null default now()
);
insert into public.settings (id) values (1);

create table public.staff (
  user_id              uuid primary key references auth.users (id) on delete cascade,
  email                text not null,
  name                 text not null check (length(name) between 2 and 100),
  role                 text not null check (role in ('admin', 'staff')),
  must_change_password boolean not null default false,
  created_at           timestamptz not null default now()
);

create table public.plans (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(name) between 1 and 60),
  duration_days int  not null check (duration_days between 1 and 3660),
  price         int  not null check (price between 0 and 10000000),
  created_at    timestamptz not null default now()
);

create table public.members (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid unique references auth.users (id) on delete set null,
  name                   text not null check (length(name) between 2 and 120),
  phone                  text not null default '' check (length(phone) <= 20),
  email                  text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' and length(email) <= 254),
  notes                  text not null default '' check (length(notes) <= 1000),
  joined_at              date not null default public.ph_today(),
  plan_id                uuid not null references public.plans (id),
  expiry_date            date not null,
  height_cm              int check (height_cm between 100 and 250),
  birth_date             date,
  guardian_name          text check (length(guardian_name) <= 120),
  health_flagged         boolean not null default false,
  clearance_acknowledged boolean not null default false,
  created_at             timestamptz not null default now()
);
create unique index members_email_key on public.members (lower(email));
create unique index members_phone_key on public.members (right(regexp_replace(phone, '\D', '', 'g'), 10)) where phone <> '';

-- Full health answers are sensitive: separate table, readable by admins and the member only.
create table public.health_declarations (
  member_id              uuid primary key references public.members (id) on delete cascade,
  answers                boolean[] not null,
  flagged                boolean not null,
  clearance_acknowledged boolean not null default false,
  declared_at            timestamptz not null default now()
);

-- Append-only evidence of consent.
create table public.consents (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members (id) on delete cascade,
  type        text not null check (type in ('terms', 'privacy', 'health', 'marketing')),
  version     text not null check (length(version) <= 20),
  granted     boolean not null,
  recorded_by text not null,
  created_at  timestamptz not null default now()
);
create index consents_member_idx on public.consents (member_id, created_at);

-- Financial records are immutable for clients (no update/delete policies).
create table public.payments (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid references public.members (id) on delete set null,
  label       text not null,
  plan_name   text not null,
  amount      int  not null check (amount >= 0),
  method      text not null check (method in ('Cash', 'GCash', 'Card')),
  kind        text not null check (kind in ('new', 'renewal', 'walk-in')),
  received_by text not null,
  created_at  timestamptz not null default now()
);
create index payments_created_idx on public.payments (created_at desc);
create index payments_member_idx on public.payments (member_id);

create table public.check_ins (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid references public.members (id) on delete cascade,
  guest_name text check (length(guest_name) <= 120),
  via        text check (via in ('search', 'qr')),
  created_at timestamptz not null default now(),
  check (member_id is not null or guest_name is not null)
);
create index check_ins_created_idx on public.check_ins (created_at desc);
create index check_ins_member_idx on public.check_ins (member_id, created_at desc);

create table public.trainers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(name) between 2 and 120),
  specialty  text not null default '' check (length(specialty) <= 120),
  phone      text not null default '' check (length(phone) <= 20),
  created_at timestamptz not null default now()
);

create table public.classes (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(name) between 1 and 60),
  trainer_id   uuid not null references public.trainers (id),
  weekday      int  not null check (weekday between 0 and 6),
  start_time   text not null check (start_time ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  duration_min int  not null check (duration_min between 5 and 600),
  capacity     int  not null check (capacity between 1 and 500),
  tone         text not null default 'lime' check (tone in ('lime', 'sky', 'violet', 'amber', 'rose', 'teal')),
  created_at   timestamptz not null default now()
);

create table public.bookings (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references public.classes (id) on delete cascade,
  member_id    uuid not null references public.members (id) on delete cascade,
  session_date date not null,
  created_at   timestamptz not null default now(),
  unique (class_id, member_id, session_date)
);
create index bookings_session_idx on public.bookings (class_id, session_date);

create table public.measurements (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members (id) on delete cascade,
  measured_on date not null,
  weight_kg   numeric(5, 1) not null check (weight_kg > 20 and weight_kg < 350),
  created_at  timestamptz not null default now()
);
create index measurements_member_idx on public.measurements (member_id, measured_on desc);

create table public.privacy_requests (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid references public.members (id) on delete set null,
  member_name text not null,
  type        text not null check (type in ('erasure', 'correction', 'objection')),
  details     text not null default '' check (length(details) <= 1000),
  status      text not null default 'pending' check (status in ('pending', 'completed', 'rejected')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text,
  note        text check (length(note) <= 1000)
);

create table public.activity_log (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id   uuid,
  actor_name text not null,
  action     text not null,
  summary    text not null
);
create index activity_created_idx on public.activity_log (created_at desc);

-- ---------- identity helpers (SECURITY DEFINER so they can read tables under RLS) ----------

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff where user_id = auth.uid())
$$;

-- Admins who enrolled MFA must be on an aal2 session for admin privileges.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and role = 'admin')
     and (
       coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
       or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
     )
$$;

create or replace function public.my_member_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.members where user_id = auth.uid()
$$;

create or replace function public.actor_name() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select name from public.staff where user_id = auth.uid()),
    (select name || ' (member)' from public.members where user_id = auth.uid()),
    'System'
  )
$$;

-- ---------- link member records to auth accounts (by verified email only) ----------

create or replace function public.link_member_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is not null then
    update public.members set user_id = new.id
     where lower(email) = lower(new.email) and user_id is null;
  end if;
  return new;
end $$;

create trigger on_auth_user_confirmed
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.link_member_account();

-- When staff register or change a member's email, (re)link to an existing verified account.
create or replace function public.members_sync_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or lower(new.email) <> lower(old.email) then
    new.user_id := (select u.id from auth.users u
                     where lower(u.email) = lower(new.email) and u.email_confirmed_at is not null
                     limit 1);
  end if;
  return new;
end $$;

create trigger members_sync_account
  before insert or update of email on public.members
  for each row execute function public.members_sync_account();

-- ---------- audit trail ----------

create or replace function public.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  j   jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  who text;
  s   text;
begin
  -- Bulk operations (registration, erasure, retention) set this flag and log one summary themselves,
  -- so cascaded child rows don't flood the log. Member and payment rows are always logged.
  if current_setting('irondesk.quiet', true) = 'on' and tg_table_name not in ('members', 'payments') then
    return null;
  end if;

  who := coalesce(
    (select name from public.members where id = (j ->> 'member_id')::uuid),
    j ->> 'guest_name',
    'member');

  s := case tg_table_name
    when 'members' then case tg_op
      when 'INSERT' then 'Registered new member ' || (j ->> 'name')
      when 'UPDATE' then 'Updated profile of ' || (j ->> 'name')
      else 'Erased member record #' || upper(left(j ->> 'id', 6)) end
    when 'payments' then
      format('Recorded %s payment · %s · %s · ₱%s', j ->> 'kind', j ->> 'label', j ->> 'plan_name', j ->> 'amount')
    when 'check_ins' then 'Checked in ' || who || case when j ->> 'via' = 'qr' then ' (QR)' else '' end
    when 'bookings' then
      (case when tg_op = 'DELETE' then 'Cancelled booking of ' else 'Booked ' end) || who || ' · ' ||
      coalesce((select name from public.classes where id = (j ->> 'class_id')::uuid), 'class') || ' · ' || (j ->> 'session_date')
    when 'measurements' then case tg_op
      when 'INSERT' then 'Logged weigh-in for ' || who || ': ' || (j ->> 'weight_kg') || ' kg'
      else 'Removed a weigh-in entry' end
    when 'consents' then
      format('Recorded %s consent (%s) for %s', j ->> 'type', case when (j ->> 'granted')::boolean then 'yes' else 'no' end, who)
    when 'health_declarations' then 'Recorded health screening for ' || who
    when 'privacy_requests' then case tg_op
      when 'INSERT' then 'Submitted a data ' || (j ->> 'type') || ' request'
      else 'Marked a data ' || (j ->> 'type') || ' request as ' || (j ->> 'status') end
    when 'settings' then 'Updated gym settings'
    else initcap(lower(tg_op)) || ' ' || rtrim(tg_table_name, 's') || ' ' || coalesce(j ->> 'name', '')
  end;

  insert into public.activity_log (actor_id, actor_name, action, summary)
  values (auth.uid(), public.actor_name(), lower(tg_op) || ':' || tg_table_name, s);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['members', 'payments', 'check_ins', 'bookings', 'measurements', 'consents',
                           'health_declarations', 'privacy_requests', 'settings', 'plans', 'trainers', 'classes']
  loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I
                    for each row execute function public.audit()', t);
  end loop;
end $$;

-- ---------- row level security ----------

alter table public.settings            enable row level security;
alter table public.staff               enable row level security;
alter table public.plans               enable row level security;
alter table public.members             enable row level security;
alter table public.health_declarations enable row level security;
alter table public.consents            enable row level security;
alter table public.payments            enable row level security;
alter table public.check_ins           enable row level security;
alter table public.trainers            enable row level security;
alter table public.classes             enable row level security;
alter table public.bookings            enable row level security;
alter table public.measurements        enable row level security;
alter table public.privacy_requests    enable row level security;
alter table public.activity_log        enable row level security;

-- settings: public read (gym name + Privacy Notice details on the login screen), admin update
create policy settings_read   on public.settings for select to anon, authenticated using (true);
create policy settings_update on public.settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- staff: read yourself, admins read all. Writes go through the admin-users Edge Function (service role).
create policy staff_read on public.staff for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- catalogue tables: any signed-in user reads, admins write
create policy plans_read     on public.plans    for select to authenticated using (true);
create policy plans_insert   on public.plans    for insert to authenticated with check (public.is_admin());
create policy plans_update   on public.plans    for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy plans_delete   on public.plans    for delete to authenticated using (public.is_admin());
create policy trainers_read  on public.trainers for select to authenticated using (true);
create policy trainers_insert on public.trainers for insert to authenticated with check (public.is_admin());
create policy trainers_update on public.trainers for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy trainers_delete on public.trainers for delete to authenticated using (public.is_admin());
create policy classes_read   on public.classes  for select to authenticated using (true);
create policy classes_insert on public.classes  for insert to authenticated with check (public.is_admin());
create policy classes_update on public.classes  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy classes_delete on public.classes  for delete to authenticated using (public.is_admin());

-- members: staff read all, members read themselves. Inserts via register_member(); deletes via erase_member().
create policy members_read   on public.members for select to authenticated using (public.is_staff() or user_id = auth.uid());
create policy members_update on public.members for update to authenticated using (public.is_staff()) with check (public.is_staff());
-- staff may edit profile fields only (not user_id, plan/expiry, or health flags)
revoke update on public.members from anon, authenticated;
grant update (name, phone, email, notes, height_cm, birth_date, guardian_name) on public.members to authenticated;

create policy health_read on public.health_declarations for select to authenticated
  using (public.is_admin() or member_id = public.my_member_id());

create policy consents_read on public.consents for select to authenticated
  using (public.is_staff() or member_id = public.my_member_id());

create policy payments_read on public.payments for select to authenticated
  using (public.is_staff() or member_id = public.my_member_id());

create policy check_ins_read on public.check_ins for select to authenticated
  using (public.is_staff() or member_id = public.my_member_id());

create policy bookings_read on public.bookings for select to authenticated
  using (public.is_staff() or member_id = public.my_member_id());

create policy measurements_read   on public.measurements for select to authenticated
  using (public.is_staff() or member_id = public.my_member_id());
create policy measurements_insert on public.measurements for insert to authenticated
  with check ((public.is_staff() or member_id = public.my_member_id()) and measured_on <= public.ph_today());
create policy measurements_delete on public.measurements for delete to authenticated
  using (public.is_staff() or member_id = public.my_member_id());

create policy privacy_read on public.privacy_requests for select to authenticated
  using (public.is_admin() or member_id = public.my_member_id());

create policy activity_read on public.activity_log for select to authenticated using (public.is_admin());

-- anonymous visitors get nothing except settings
revoke all on all tables in schema public from anon;
grant select on public.settings to anon;

-- ---------- business operations ----------

create or replace function public.register_member(
  p_name text, p_phone text, p_email text, p_notes text, p_plan_id uuid, p_method text,
  p_height_cm int, p_birth_date date, p_guardian_name text,
  p_health_answers boolean[], p_clearance boolean, p_marketing boolean, p_version text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_plan   public.plans;
  v_id     uuid;
  v_age    int;
  v_flag   boolean := coalesce(true = any (p_health_answers), false);
  v_by     text := public.actor_name();
begin
  if not public.is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_plan from public.plans where id = p_plan_id;
  if not found then raise exception 'unknown plan'; end if;
  if p_birth_date is null or p_birth_date > public.ph_today() then raise exception 'invalid birth date'; end if;
  v_age := date_part('year', age(public.ph_today(), p_birth_date));
  if v_age < 12 then raise exception 'members must be at least 12 years old'; end if;
  if v_age < 18 and coalesce(length(trim(p_guardian_name)), 0) < 2 then raise exception 'a parent or guardian is required for minors'; end if;
  if v_flag and not coalesce(p_clearance, false) then raise exception 'medical clearance advice must be acknowledged'; end if;
  perform set_config('irondesk.quiet', 'on', true); -- log the member + payment only, not each consent row

  insert into public.members (name, phone, email, notes, plan_id, expiry_date, height_cm, birth_date, guardian_name,
                              health_flagged, clearance_acknowledged)
  values (trim(p_name), trim(coalesce(p_phone, '')), lower(trim(p_email)), trim(coalesce(p_notes, '')), p_plan_id,
          public.ph_today() + v_plan.duration_days, p_height_cm, p_birth_date,
          case when v_age < 18 then trim(p_guardian_name) end, v_flag, v_flag and p_clearance)
  returning id into v_id;

  insert into public.health_declarations (member_id, answers, flagged, clearance_acknowledged)
  values (v_id, p_health_answers, v_flag, v_flag and p_clearance);

  insert into public.consents (member_id, type, version, granted, recorded_by) values
    (v_id, 'terms', p_version, true, v_by),
    (v_id, 'privacy', p_version, true, v_by),
    (v_id, 'health', p_version, true, v_by),
    (v_id, 'marketing', p_version, coalesce(p_marketing, false), v_by);

  insert into public.payments (member_id, label, plan_name, amount, method, kind, received_by)
  values (v_id, trim(p_name), v_plan.name, v_plan.price, p_method, 'new', v_by);

  perform set_config('irondesk.quiet', 'off', true);
  return v_id;
end $$;

create or replace function public.renew_membership(p_member_id uuid, p_plan_id uuid, p_method text) returns date
language plpgsql security definer set search_path = '' as $$
declare
  v_plan public.plans;
  v_m    public.members;
  v_new  date;
begin
  if not public.is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_plan from public.plans where id = p_plan_id;
  select * into v_m from public.members where id = p_member_id for update;
  if v_plan.id is null or v_m.id is null then raise exception 'not found'; end if;
  -- active members stack on top of their current expiry; expired members restart today
  v_new := greatest(v_m.expiry_date, public.ph_today()) + v_plan.duration_days;
  update public.members set plan_id = p_plan_id, expiry_date = v_new where id = p_member_id;
  insert into public.payments (member_id, label, plan_name, amount, method, kind, received_by)
  values (p_member_id, v_m.name, v_plan.name, v_plan.price, p_method, 'renewal', public.actor_name());
  return v_new;
end $$;

create or replace function public.check_in_member(p_member_id uuid, p_via text default 'search') returns text
language plpgsql security definer set search_path = '' as $$
declare v_m public.members;
begin
  if not public.is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_m from public.members where id = p_member_id;
  if not found then return 'not-found'; end if;
  if v_m.expiry_date < public.ph_today() then return 'expired'; end if;
  if exists (select 1 from public.check_ins
              where member_id = p_member_id and (created_at at time zone 'Asia/Manila')::date = public.ph_today()) then
    return 'duplicate';
  end if;
  insert into public.check_ins (member_id, via) values (p_member_id, case when p_via = 'qr' then 'qr' else 'search' end);
  return 'ok';
end $$;

create or replace function public.record_walk_in(p_guest_name text, p_method text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_name  text := coalesce(nullif(trim(p_guest_name), ''), 'Walk-in guest');
  v_price int  := (select walk_in_price from public.settings where id = 1);
begin
  if not public.is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into public.check_ins (guest_name) values (v_name);
  insert into public.payments (member_id, label, plan_name, amount, method, kind, received_by)
  values (null, v_name, 'Day Pass', v_price, p_method, 'walk-in', public.actor_name());
end $$;

create or replace function public.book_class(p_class_id uuid, p_member_id uuid, p_date date) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_c     public.classes;
  v_m     public.members;
  v_count int;
begin
  if not (public.is_staff() or p_member_id = public.my_member_id()) then return 'denied'; end if;
  -- lock the class row so two people can't take the last slot at the same time
  select * into v_c from public.classes where id = p_class_id for update;
  select * into v_m from public.members where id = p_member_id;
  if v_c.id is null or v_m.id is null then return 'denied'; end if;
  if p_date < public.ph_today() or p_date > public.ph_today() + 60 then return 'denied'; end if;
  if extract(dow from p_date) <> v_c.weekday then return 'denied'; end if;
  if v_m.expiry_date < p_date then return 'expired'; end if;
  if exists (select 1 from public.bookings where class_id = p_class_id and member_id = p_member_id and session_date = p_date) then
    return 'duplicate';
  end if;
  select count(*) into v_count from public.bookings where class_id = p_class_id and session_date = p_date;
  if v_count >= v_c.capacity then return 'full'; end if;
  insert into public.bookings (class_id, member_id, session_date) values (p_class_id, p_member_id, p_date);
  return 'ok';
end $$;

create or replace function public.cancel_booking(p_booking_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_b public.bookings;
begin
  select * into v_b from public.bookings where id = p_booking_id;
  if not found then return false; end if;
  if not (public.is_staff() or (v_b.member_id = public.my_member_id() and v_b.session_date >= public.ph_today())) then
    return false;
  end if;
  delete from public.bookings where id = p_booking_id;
  return true;
end $$;

-- Slots taken per session, without revealing who booked (members can't read others' bookings).
create or replace function public.session_counts(p_from date, p_to date)
returns table (class_id uuid, session_date date, booked int)
language sql stable security definer set search_path = '' as $$
  select b.class_id, b.session_date, count(*)::int
    from public.bookings b
   where auth.uid() is not null
     and b.session_date between p_from and least(p_to, p_from + 62)
   group by b.class_id, b.session_date
$$;

create or replace function public.update_my_profile(p_phone text, p_height_cm int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.my_member_id() is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_phone !~ '^(09|\+639|639)\d{9}$' then raise exception 'invalid mobile number'; end if;
  update public.members set phone = p_phone, height_cm = p_height_cm where id = public.my_member_id();
end $$;

create or replace function public.set_marketing_consent(p_member_id uuid, p_granted boolean, p_version text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_staff() or p_member_id = public.my_member_id()) then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into public.consents (member_id, type, version, granted, recorded_by)
  values (p_member_id, 'marketing', p_version, p_granted,
          case when public.is_staff() then public.actor_name() else 'member (self)' end);
end $$;

create or replace function public.submit_privacy_request(p_type text, p_details text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_m public.members;
begin
  select * into v_m from public.members where id = public.my_member_id();
  if not found then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_type = 'erasure' and exists (select 1 from public.privacy_requests
                                     where member_id = v_m.id and type = 'erasure' and status = 'pending') then
    raise exception 'an erasure request is already pending';
  end if;
  insert into public.privacy_requests (member_id, member_name, type, details)
  values (v_m.id, v_m.name, p_type, left(coalesce(p_details, ''), 1000))
  returning id into v_id;
  return v_id;
end $$;

-- Right to erasure: delete personal data, keep de-identified payments for accounting.
create or replace function public.erase_member(p_member_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_m     public.members;
  v_alias text;
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_m from public.members where id = p_member_id;
  if not found then return; end if;
  v_alias := 'Deleted member #' || upper(left(v_m.id::text, 6));
  perform set_config('irondesk.quiet', 'on', true);

  update public.payments set member_id = null, label = v_alias where member_id = v_m.id;
  update public.privacy_requests
     set member_id = null, member_name = v_alias, details = replace(details, v_m.name, v_alias)
   where member_id = v_m.id;
  delete from public.members where id = v_m.id;          -- cascades: check-ins, bookings, weigh-ins, consents, health
  if v_m.user_id is not null then
    begin
      delete from auth.users where id = v_m.user_id;    -- removes their login too
    exception when insufficient_privilege then
      null; -- the orphaned login has no data access; an admin can delete it in the Auth dashboard
    end;
  end if;
  perform set_config('irondesk.quiet', 'off', true);
  -- scrub the name from the audit trail (runs last so the erasure entry itself is scrubbed too)
  update public.activity_log
     set summary = replace(summary, v_m.name, v_alias), actor_name = replace(actor_name, v_m.name, v_alias)
   where summary like '%' || v_m.name || '%' or actor_name like '%' || v_m.name || '%';
end $$;

create or replace function public.resolve_privacy_request(p_id uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_r public.privacy_requests;
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_r from public.privacy_requests where id = p_id and status = 'pending' for update;
  if not found then return; end if;
  if not p_approve and length(trim(coalesce(p_note, ''))) < 5 then raise exception 'give a reason when rejecting'; end if;
  update public.privacy_requests
     set status = case when p_approve then 'completed' else 'rejected' end,
         resolved_at = now(), resolved_by = public.actor_name(), note = trim(coalesce(p_note, ''))
   where id = p_id;
  if p_approve and v_r.type = 'erasure' and v_r.member_id is not null then
    perform public.erase_member(v_r.member_id);
  end if;
end $$;

create or replace function public.apply_retention() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cutoff date := (public.ph_today() - make_interval(months => (select retention_months from public.settings where id = 1)))::date;
  v_c int; v_b int; v_a int;
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  perform set_config('irondesk.quiet', 'on', true);
  delete from public.check_ins where created_at < v_cutoff;  get diagnostics v_c = row_count;
  delete from public.bookings  where session_date < v_cutoff; get diagnostics v_b = row_count;
  delete from public.activity_log where created_at < v_cutoff; get diagnostics v_a = row_count;
  perform set_config('irondesk.quiet', 'off', true);
  insert into public.activity_log (actor_id, actor_name, action, summary)
  values (auth.uid(), public.actor_name(), 'retention',
          format('Applied retention: removed %s check-ins, %s bookings, %s log entries', v_c, v_b, v_a));
  return jsonb_build_object('checkIns', v_c, 'bookings', v_b, 'activity', v_a);
end $$;

create or replace function public.password_changed() returns void
language sql security definer set search_path = '' as $$
  update public.staff set must_change_password = false where user_id = auth.uid();
  insert into public.activity_log (actor_id, actor_name, action, summary)
  select auth.uid(), public.actor_name(), 'password', 'Changed their password' where auth.uid() is not null;
$$;

create or replace function public.log_sign_in() returns void
language sql security definer set search_path = '' as $$
  insert into public.activity_log (actor_id, actor_name, action, summary)
  select auth.uid(), public.actor_name(), 'sign-in', 'Signed in' where auth.uid() is not null;
$$;

-- Functions: callable only by signed-in users (helpers stay callable by policies).
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.ph_today() to anon;

-- ---------- realtime: let signed-in screens refresh live (RLS still applies) ----------
alter publication supabase_realtime add table
  public.members, public.payments, public.check_ins, public.bookings, public.measurements,
  public.plans, public.trainers, public.classes, public.settings, public.privacy_requests;
