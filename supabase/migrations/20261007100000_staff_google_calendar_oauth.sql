create table if not exists public.staff_google_oauth_states (state text primary key, staff_id uuid not null references public.staff_profiles(id) on delete cascade, created_at timestamptz not null default now());
create index if not exists staff_google_oauth_states_created_at_idx on public.staff_google_oauth_states(created_at);
alter table public.staff_google_oauth_states enable row level security;
revoke all on public.staff_google_oauth_states from public, anon, authenticated;
grant all on public.staff_google_oauth_states to service_role;