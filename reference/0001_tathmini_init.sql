-- Tathmini — Phase 1 (MVP) initial migration
-- Implements context.md §7 (data model) and §8 (security / RLS).
-- Run against a fresh Supabase project: SQL Editor > New query, or `supabase db push`.

-- ─────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────
create type app_role        as enum ('supervisor', 'coordinator');
create type track_type      as enum ('TP', 'IPT');
create type trainee_status  as enum ('pending', 'assessed', 'locked');
create type reassign_status as enum ('pending', 'accepted', 'rejected');

-- ─────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────

-- Mirrors auth.users; `id` IS the Supabase Auth uid.
create table public.users (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       app_role not null,
  route_id   uuid,                 -- null for coordinators; FK added after routes exists
  name       text not null,
  email      text not null unique,
  created_at timestamptz not null default now()
);

create table public.routes (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  supervisor_id uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

alter table public.users
  add constraint users_route_fk foreign key (route_id) references public.routes(id) on delete set null;

-- Display-only label per plan.md §2 (informational, not structural).
create table public.centers (
  id   uuid primary key default gen_random_uuid(),
  name text not null
);

create table public.trainees (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  occupation   text not null,             -- pre-loaded, read-only in the UI
  track        track_type not null,       -- determines which form template loads
  center_label text,
  route_id     uuid not null references public.routes(id) on delete restrict,
  status       trainee_status not null default 'pending',
  email        text not null,
  created_at   timestamptz not null default now()
);
create index trainees_route_idx  on public.trainees (route_id);
create index trainees_status_idx on public.trainees (status);

create table public.assessments (
  id            uuid primary key default gen_random_uuid(),
  trainee_id    uuid not null references public.trainees(id) on delete cascade,
  supervisor_id uuid not null references public.users(id),
  route_id      uuid not null references public.routes(id),
  track         track_type not null,

  -- Per-criterion breakdown kept as jsonb so the PDF and auto-comments can be
  -- reconstructed; totals/grades are scalar columns so the coordinator
  -- dashboard can aggregate cheaply (context.md §7).
  theory_sections        jsonb not null default '{}'::jsonb,
  theory_total           numeric(5,2),
  theory_grade           text,
  theory_gpa             numeric(3,2),
  theory_class_of_award  text,

  practical_sections       jsonb not null default '{}'::jsonb,
  practical_total          numeric(5,2),
  practical_grade          text,
  practical_gpa            numeric(3,2),
  practical_class_of_award text,

  standard_attained boolean,
  auto_comments     jsonb not null default '[]'::jsonb,
  manual_comment    text,

  -- Locking is a column so RLS can key off it (context.md §8).
  locked       boolean not null default false,
  submitted_at timestamptz,
  synced_at    timestamptz,
  pdf_path     text,                       -- Supabase Storage object path
  created_at   timestamptz not null default now(),

  constraint assessments_one_per_trainee unique (trainee_id)
);
create index assessments_route_idx     on public.assessments (route_id);
create index assessments_submitted_idx on public.assessments (submitted_at);

create table public.reassignment_requests (
  id                 uuid primary key default gen_random_uuid(),
  trainee_id         uuid not null references public.trainees(id) on delete cascade,
  from_route_id      uuid not null references public.routes(id),
  to_route_id        uuid not null references public.routes(id),
  from_supervisor_id uuid not null references public.users(id),
  to_supervisor_id   uuid not null references public.users(id),
  status             reassign_status not null default 'pending',
  created_at         timestamptz not null default now(),
  resolved_at        timestamptz
);
create index reassign_to_idx on public.reassignment_requests (to_supervisor_id, status);

-- ─────────────────────────────────────────────────────────────
-- Helper functions (security definer, so policies can read
-- public.users without recursing through its own RLS)
-- ─────────────────────────────────────────────────────────────
create or replace function public.current_role_name() returns app_role
  language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.current_route_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select route_id from public.users where id = auth.uid();
$$;

create or replace function public.is_coordinator() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() = 'coordinator', false);
$$;

-- ─────────────────────────────────────────────────────────────
-- Row Level Security (context.md §8)
-- Principle: route ownership = data isolation, enforced server-side.
-- ─────────────────────────────────────────────────────────────
alter table public.users                 enable row level security;
alter table public.routes                enable row level security;
alter table public.centers               enable row level security;
alter table public.trainees              enable row level security;
alter table public.assessments           enable row level security;
alter table public.reassignment_requests enable row level security;

-- users: read self; coordinators read all. No client-side inserts (seed/admin only).
create policy users_select_self_or_coordinator on public.users
  for select to authenticated
  using (id = auth.uid() or public.is_coordinator());

-- routes: supervisors see only their own route.
create policy routes_select_scoped on public.routes
  for select to authenticated
  using (public.is_coordinator() or id = public.current_route_id());

-- centers: display labels, readable by all authenticated users.
create policy centers_select_all on public.centers
  for select to authenticated using (true);

-- trainees: supervisors are hard-scoped to their route.
create policy trainees_select_scoped on public.trainees
  for select to authenticated
  using (public.is_coordinator() or route_id = public.current_route_id());

-- Supervisors may not move trainees between routes; only coordinators reassign
-- directly (plan.md §3). Supervisors may update status on their own route only.
create policy trainees_update_status_own_route on public.trainees
  for update to authenticated
  using (route_id = public.current_route_id())
  with check (route_id = public.current_route_id());

create policy trainees_coordinator_all on public.trainees
  for all to authenticated
  using (public.is_coordinator()) with check (public.is_coordinator());

-- assessments: read own route (supervisor) or everything (coordinator).
create policy assessments_select_scoped on public.assessments
  for select to authenticated
  using (public.is_coordinator() or route_id = public.current_route_id());

-- Insert: accountability is fixed to the route's assigned supervisor
-- (plan.md §2) — the row must be stamped with the caller's own id and route.
create policy assessments_insert_own_route on public.assessments
  for insert to authenticated
  with check (
    public.current_role_name() = 'supervisor'
    and supervisor_id = auth.uid()
    and route_id = public.current_route_id()
    and exists (
      select 1 from public.trainees t
      where t.id = trainee_id and t.route_id = public.current_route_id()
    )
  );

-- Update: "assessed = locked". A supervisor's write is rejected once the row
-- is locked; only a coordinator can write to a locked row (admin override).
create policy assessments_update_unless_locked on public.assessments
  for update to authenticated
  using (
    public.is_coordinator()
    or (route_id = public.current_route_id() and locked = false)
  )
  with check (
    public.is_coordinator()
    or (route_id = public.current_route_id())
  );

-- No delete path for anyone: assessment records are audit data.

-- reassignment_requests: peer-to-peer, visible to either side.
create policy reassign_select_party on public.reassignment_requests
  for select to authenticated
  using (
    public.is_coordinator()
    or from_supervisor_id = auth.uid()
    or to_supervisor_id = auth.uid()
  );

create policy reassign_insert_initiator on public.reassignment_requests
  for insert to authenticated
  with check (from_supervisor_id = auth.uid() and from_route_id = public.current_route_id());

-- Only the RECEIVING supervisor can accept/reject (plan.md §2).
create policy reassign_update_receiver on public.reassignment_requests
  for update to authenticated
  using (to_supervisor_id = auth.uid() or public.is_coordinator())
  with check (to_supervisor_id = auth.uid() or public.is_coordinator());

-- ─────────────────────────────────────────────────────────────
-- Storage bucket for PDF reports (context.md §11 step 2)
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

create policy reports_read_scoped on storage.objects
  for select to authenticated
  using (bucket_id = 'reports');

create policy reports_write_supervisor on storage.objects
  for insert to authenticated
  with check (bucket_id = 'reports' and public.current_role_name() = 'supervisor');

-- ─────────────────────────────────────────────────────────────
-- Realtime (coordinator dashboard subscriptions, context.md §6)
-- ─────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.assessments;
alter publication supabase_realtime add table public.trainees;
alter publication supabase_realtime add table public.reassignment_requests;
