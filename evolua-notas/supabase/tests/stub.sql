-- Simula o mínimo do Supabase (roles, auth, storage) para testar as migrações em Postgres puro.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean);
grant usage on schema public, auth to anon, authenticated, service_role;
grant select on auth.users to service_role;
