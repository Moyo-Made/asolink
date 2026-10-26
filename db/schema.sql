create extension if not exists pgcrypto;

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  admin_token_hash text unique not null,
  title text not null,
  hosts text,
  event_date date,
  deadline date,
  price_naira integer,
  whatsapp text not null,
  sizes text[] not null,
  note text,
  tryon_cap integer not null default 60,
  created_at timestamptz not null default now()
);

create table if not exists looks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  label text not null,
  kind text not null check (kind in ('outfit', 'fabric')),
  source_url text not null,
  silhouette text,
  ref_url text not null,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists looks_event on looks(event_id, sort);

create table if not exists tryons (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  look_id uuid not null references looks(id) on delete cascade,
  device text not null,
  src_url text not null,
  task_id text,
  status text not null default 'queued' check (status in ('queued', 'running', 'success', 'error')),
  error_code text,
  result_url text,
  last_polled_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists tryons_event_device on tryons(event_id, device);
create index if not exists tryons_cache on tryons(look_id, src_url);

create table if not exists guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  device text not null,
  name text not null,
  look_id uuid references looks(id) on delete set null,
  size text,
  qty integer not null default 1,
  tryon_id uuid references tryons(id) on delete set null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, device)
);

create table if not exists visits (
  event_id uuid not null references events(id) on delete cascade,
  device text not null,
  first_seen timestamptz not null default now(),
  primary key (event_id, device)
);
