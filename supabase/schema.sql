-- =====================================================================
-- Dashboards Julius — esquema de Supabase
-- Ejecutar completo una sola vez en el SQL Editor (o como migración).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Restringir registros al dominio de Julius
--    Cualquier intento de crear un usuario con otro dominio falla.
-- ---------------------------------------------------------------------
create or replace function public.enforce_julius_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or lower(new.email) not like '%@julius2grow.com' then
    raise exception 'Solo se permiten cuentas @julius2grow.com';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_julius_domain_trigger on auth.users;
create trigger enforce_julius_domain_trigger
  before insert on auth.users
  for each row execute function public.enforce_julius_domain();

-- Helper reutilizable en políticas RLS
create or replace function public.is_julius_user()
returns boolean
language sql
stable
as $$
  select coalesce(
    lower(auth.jwt() ->> 'email') like '%@julius2grow.com',
    false
  );
$$;

-- ---------------------------------------------------------------------
-- 2. Tablas
-- ---------------------------------------------------------------------
create table if not exists public.dashboards (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique
                   check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 80),
  title            text not null check (char_length(title) between 1 and 160),
  client           text not null default '' check (char_length(client) <= 120),
  visibility       text not null default 'team'
                   check (visibility in ('team', 'link', 'public')),
  current_path     text not null,
  version          integer not null default 1,
  size_bytes       bigint not null default 0,
  created_by       uuid references auth.users(id) on delete set null,
  created_by_email text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists dashboards_client_idx on public.dashboards (client);
create index if not exists dashboards_updated_idx on public.dashboards (updated_at desc);

create table if not exists public.dashboard_versions (
  id                 uuid primary key default gen_random_uuid(),
  dashboard_id       uuid not null references public.dashboards(id) on delete cascade,
  version            integer not null,
  storage_path       text not null,
  size_bytes         bigint not null default 0,
  uploaded_by_email  text not null,
  created_at         timestamptz not null default now(),
  unique (dashboard_id, version)
);

create table if not exists public.share_links (
  id            uuid primary key default gen_random_uuid(),
  dashboard_id  uuid not null references public.dashboards(id) on delete cascade,
  token_hash    text not null unique,          -- sha256 del token; el token en claro solo se muestra una vez
  label         text not null default '',
  expires_at    timestamptz,                   -- null = no caduca
  revoked_at    timestamptz,
  created_by_email text not null,
  created_at    timestamptz not null default now()
);

create index if not exists share_links_dashboard_idx on public.share_links (dashboard_id);

-- ---------------------------------------------------------------------
-- 3. Row Level Security
--    Las escrituras pasan por la API de la app (service role) tras validar
--    al usuario, por eso no hay políticas de insert/update/delete.
--    share_links no tiene políticas: solo accesible con service role.
-- ---------------------------------------------------------------------
alter table public.dashboards          enable row level security;
alter table public.dashboard_versions  enable row level security;
alter table public.share_links         enable row level security;

drop policy if exists "team can read dashboards" on public.dashboards;
create policy "team can read dashboards"
  on public.dashboards for select
  to authenticated
  using (public.is_julius_user());

drop policy if exists "team can read versions" on public.dashboard_versions;
create policy "team can read versions"
  on public.dashboard_versions for select
  to authenticated
  using (public.is_julius_user());

-- ---------------------------------------------------------------------
-- 4. Storage: bucket privado "dashboards"
--    - Solo el equipo puede SUBIR (insert) desde el navegador, con URL
--      directa a Storage (evita el límite de 4.5 MB de las funciones de Vercel).
--    - Nadie puede leer desde el navegador: la lectura la hace la app con
--      service role en la ruta /d/[slug].
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dashboards', 'dashboards', false, 26214400, array['text/html'])
on conflict (id) do update
  set public = false,
      file_size_limit = 26214400,
      allowed_mime_types = array['text/html'];

drop policy if exists "team can upload dashboards" on storage.objects;
create policy "team can upload dashboards"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'dashboards'
    and public.is_julius_user()
    and name like '%.html'
  );
