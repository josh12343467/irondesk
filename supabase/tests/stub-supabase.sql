-- Minimal stand-in for the parts of Supabase the migration relies on, so it can be
-- tested in PGlite (Postgres compiled to WASM) without Docker or a cloud project.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  email_confirmed_at timestamptz
);
create table auth.mfa_factors (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  status  text not null
);

-- Same contract as Supabase: claims come from the request JWT.
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
-- Supabase's default privileges: RLS (not grants) is what protects tables
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create publication supabase_realtime;
