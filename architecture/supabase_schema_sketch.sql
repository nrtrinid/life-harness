-- Supabase schema sketch for future v0.2+.
-- Do not implement in v0.1 unless explicitly ticketed.

create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  area text not null,
  state text not null,
  progress integer not null default 0,
  warmth text not null default 'cold',
  why_it_matters text,
  next_tiny_action text,
  done_for_now text,
  do_lane text,
  improve_lane text,
  last_touched timestamptz,
  recent_wins jsonb not null default '[]'::jsonb,
  open_loops jsonb not null default '[]'::jsonb,
  optimization_ideas jsonb not null default '[]'::jsonb,
  resume_packet jsonb,
  trigger_plan jsonb,
  obstacle_plan jsonb,
  sensitivity text not null default 'S1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  card_id uuid references cards(id) on delete set null,
  timestamp timestamptz not null default now(),
  raw_text text not null,
  area text not null,
  type text not null,
  xp integer not null default 0,
  money_delta numeric,
  leak_type text,
  proof_item_id uuid,
  sensitivity text not null default 'S1',
  created_at timestamptz not null default now()
);

create table if not exists proof_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  card_id uuid references cards(id) on delete set null,
  source_log_id uuid references logs(id) on delete set null,
  timestamp timestamptz not null default now(),
  title text not null,
  area text,
  created_at timestamptz not null default now()
);

create table if not exists daily_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  date date not null,
  mode text not null default 'normal',
  main_quest_id uuid references cards(id) on delete set null,
  pounce_mission text,
  smallest_start text,
  pounce_window_start time,
  pounce_window_end time,
  pounce_started boolean not null default false,
  minimum_viable_day_completed boolean not null default false,
  salvage_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  created_at timestamptz not null default now(),
  title text not null default 'While You Were Away',
  updated jsonb not null default '[]'::jsonb,
  detected jsonb not null default '[]'::jsonb,
  prepared jsonb not null default '[]'::jsonb
);

create table if not exists calibration_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  card_id uuid references cards(id) on delete set null,
  task text not null,
  estimate_minutes integer,
  actual_minutes integer,
  why_expanded text,
  patch text,
  created_at timestamptz not null default now()
);
