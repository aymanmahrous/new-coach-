-- Command Center Hub: additive real-product foundation for Phases 2-7.
-- No existing table is dropped or redefined. All writes are staff-authenticated,
-- role-gated, audited, and intentionally do not publish or contact customers.

create or replace function public.command_center_staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.staff_profiles where id = auth.uid() and active = true limit 1;
$$;

revoke all on function public.command_center_staff_role() from public;
grant execute on function public.command_center_staff_role() to authenticated;

create table if not exists public.knowledge_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  description text,
  created_by uuid not null references auth.users(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_skills (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  category text,
  level text check (level is null or level in ('beginner','developing','proficient','advanced')),
  description text,
  created_by uuid not null references auth.users(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_entry_links (
  id uuid primary key default gen_random_uuid(),
  knowledge_entry_id uuid not null references public.knowledge_entries(id) on delete cascade,
  category_id uuid references public.knowledge_categories(id) on delete set null,
  skill_id uuid references public.knowledge_skills(id) on delete set null,
  media_asset_id uuid references public.media_assets(id) on delete set null,
  content_item_id uuid references public.content_items(id) on delete set null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
,
  check (category_id is not null or skill_id is not null or media_asset_id is not null or content_item_id is not null)
);

create table if not exists public.student_progress_records (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  booking_id uuid references public.booking_requests(id) on delete set null,
  skill_name text not null check (skill_name in ('First Float','Breathing','Kick','Freestyle','Backstroke','25m','50m')),
  level text not null check (level in ('not_started','developing','achieved')),
  notes text,
  assessed_by uuid not null references auth.users(id),
  assessed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (lead_id is not null or booking_id is not null)
);

create table if not exists public.student_badges (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  booking_id uuid references public.booking_requests(id) on delete set null,
  badge_name text not null check (badge_name in ('Tadpole','Goldfish','Dolphin','Shark')),
  awarded_by uuid not null references auth.users(id),
  awarded_at timestamptz not null default now(),
  evidence jsonb not null default '{}'::jsonb,
  unique (lead_id, booking_id, badge_name),
  check (lead_id is not null or booking_id is not null)
);

create table if not exists public.student_certificates (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  booking_id uuid references public.booking_requests(id) on delete set null,
  achievement text not null check (char_length(btrim(achievement)) between 2 and 240),
  awarded_on date not null default current_date,
  coach_id uuid not null references auth.users(id),
  signature_reference text,
  verification_id text not null unique default encode(gen_random_bytes(16), 'hex'),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (lead_id is not null or booking_id is not null)
);

create table if not exists public.customer_reviews (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  booking_id uuid references public.booking_requests(id) on delete set null,
  rating smallint check (rating between 1 and 5),
  review_text text not null check (char_length(btrim(review_text)) between 2 and 4000),
  source text not null default 'internal',
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected','archived')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  check (lead_id is not null or booking_id is not null)
);

create table if not exists public.campaign_ctwa_drafts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  primary_text text not null,
  headline text not null,
  cta text not null default 'Send WhatsApp message',
  prefilled_whatsapp text not null,
  tracking_id text not null unique,
  creative_reference text,
  meta_status text not null default 'setup_required' check (meta_status in ('setup_required','not_connected','connected','connection_error','ready_for_owner_approval')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attribution_events (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid references public.content_items(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  booking_id uuid references public.booking_requests(id) on delete set null,
  review_id uuid references public.customer_reviews(id) on delete set null,
  event_type text not null check (event_type in ('content_to_lead','lead_to_booking','campaign_to_lead','campaign_to_booking','review_to_content','review_to_booking')),
  source_id text,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (event_type, content_item_id, campaign_id, lead_id, booking_id, review_id)
);

create unique index if not exists knowledge_entry_links_unique_idx on public.knowledge_entry_links(knowledge_entry_id, coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(skill_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(media_asset_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(content_item_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists knowledge_entry_links_category_idx on public.knowledge_entry_links(category_id);
create index if not exists knowledge_entry_links_skill_idx on public.knowledge_entry_links(skill_id);
create index if not exists student_progress_lead_idx on public.student_progress_records(lead_id, assessed_at desc);
create index if not exists student_badges_lead_idx on public.student_badges(lead_id, awarded_at desc);
create index if not exists certificates_verification_idx on public.student_certificates(verification_id);
create index if not exists reviews_status_idx on public.customer_reviews(approval_status, created_at desc);
create index if not exists attribution_lookup_idx on public.attribution_events(lead_id, booking_id, campaign_id, content_item_id);

alter table public.knowledge_categories enable row level security;
alter table public.knowledge_skills enable row level security;
alter table public.knowledge_entry_links enable row level security;
alter table public.student_progress_records enable row level security;
alter table public.student_badges enable row level security;
alter table public.student_certificates enable row level security;
alter table public.customer_reviews enable row level security;
alter table public.campaign_ctwa_drafts enable row level security;
alter table public.attribution_events enable row level security;

-- Existing staff RPCs are the preferred read boundary. These policies protect the
-- tables if a future endpoint accidentally exposes PostgREST access.
do $$
declare t text;
begin
  foreach t in array array['knowledge_categories','knowledge_skills','knowledge_entry_links','student_progress_records','student_badges','student_certificates','customer_reviews','campaign_ctwa_drafts','attribution_events'] loop
    execute format('drop policy if exists command_center_staff_read on public.%I', t);
    execute format('create policy command_center_staff_read on public.%I for select to authenticated using (public.command_center_staff_role() is not null)', t);
    execute format('drop policy if exists command_center_staff_write on public.%I', t);
    execute format('create policy command_center_staff_write on public.%I for all to authenticated using (public.command_center_staff_role() in (''super_admin'',''admin'',''coach'',''content_manager'')) with check (public.command_center_staff_role() in (''super_admin'',''admin'',''coach'',''content_manager''))', t);
  end loop;
end $$;

create or replace function public.get_staff_real_product_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_role text;
begin
  v_role := public.command_center_staff_role();
  if v_role is null then raise exception 'STAFF_ACCESS_DENIED'; end if;
  return jsonb_build_object(
    'knowledge', jsonb_build_object(
      'entries', (select count(*) from public.knowledge_entries where is_active = true),
      'categories', (select count(*) from public.knowledge_categories where archived_at is null),
      'skills', (select count(*) from public.knowledge_skills where archived_at is null),
      'relationships', (select count(*) from public.knowledge_entry_links)
    ),
    'students', jsonb_build_object(
      'progressRecords', (select count(*) from public.student_progress_records),
      'badges', (select count(*) from public.student_badges),
      'certificates', (select count(*) from public.student_certificates where revoked_at is null)
    ),
    'social', jsonb_build_object(
      'reviewsPending', (select count(*) from public.customer_reviews where approval_status = 'pending'),
      'reviewsApproved', (select count(*) from public.customer_reviews where approval_status = 'approved'),
      'ctwaDrafts', (select count(*) from public.campaign_ctwa_drafts),
      'metaSetupRequired', (select count(*) from public.campaign_ctwa_drafts where meta_status = 'setup_required')
    ),
    'attribution', jsonb_build_object(
      'events', (select count(*) from public.attribution_events),
      'status', case when exists(select 1 from public.attribution_events) then 'available' else 'incomplete_data' end
    ),
    'generatedAt', now()
  );
end;
$$;

create or replace function public.create_staff_knowledge_entry(
  p_category text, p_question text, p_content text, p_language text default 'ar'
)
returns public.knowledge_entries
language plpgsql
security definer
set search_path = public
as $$
declare v public.knowledge_entries;
begin
  if public.command_center_staff_role() not in ('super_admin','admin','coach','content_manager') then raise exception 'PERMISSION_DENIED'; end if;
  if p_language not in ('ar','en') then raise exception 'INVALID_LANGUAGE'; end if;
  insert into public.knowledge_entries(category, question, content, language, is_active, updated_at)
  values (btrim(p_category), nullif(btrim(p_question),''), btrim(p_content), p_language, true, now()) returning * into v;
  insert into public.audit_logs(actor_id, actor_type, action, entity_type, entity_id, detail)
  values (auth.uid(), 'user', 'knowledge_entry_created', 'knowledge_entry', v.id, jsonb_build_object('language',p_language));
  return v;
end;
$$;

create or replace function public.create_staff_ctwa_draft(
  p_campaign_id uuid, p_primary_text text, p_headline text, p_prefilled_whatsapp text, p_creative_reference text default null
)
returns public.campaign_ctwa_drafts
language plpgsql
security definer
set search_path = public
as $$
declare v public.campaign_ctwa_drafts;
begin
  if public.command_center_staff_role() not in ('super_admin','admin','content_manager') then raise exception 'PERMISSION_DENIED'; end if;
  insert into public.campaign_ctwa_drafts(campaign_id, primary_text, headline, prefilled_whatsapp, creative_reference, created_by, tracking_id)
  values (p_campaign_id, btrim(p_primary_text), btrim(p_headline), btrim(p_prefilled_whatsapp), nullif(btrim(p_creative_reference),''), auth.uid(), 'ctwa-' || encode(gen_random_bytes(10),'hex'))
  returning * into v;
  insert into public.audit_logs(actor_id, actor_type, action, entity_type, entity_id, detail)
  values (auth.uid(), 'user', 'ctwa_draft_created', 'campaign_ctwa_draft', v.id, jsonb_build_object('meta_status','setup_required'));
  return v;
end;
$$;

revoke all on function public.get_staff_real_product_workspace() from public;
revoke all on function public.create_staff_knowledge_entry(text,text,text,text) from public;
revoke all on function public.create_staff_ctwa_draft(uuid,text,text,text,text) from public;
grant execute on function public.get_staff_real_product_workspace() to authenticated;
grant execute on function public.create_staff_knowledge_entry(text,text,text,text) to authenticated;
grant execute on function public.create_staff_ctwa_draft(uuid,text,text,text,text) to authenticated;
