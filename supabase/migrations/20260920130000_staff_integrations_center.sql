-- First-batch integration foundation.
-- Secrets are never exposed to authenticated clients or written to audit_logs.

create table if not exists public.staff_integrations (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique check (provider in ('meta_whatsapp','instagram','facebook','telegram','google_calendar','canva','ai_provider')),
  connection_method text not null check (connection_method in ('oauth','api_key','manual')),
  status text not null default 'not_connected' check (status in ('not_connected','pending','connected','needs_test','error','disabled')),
  display_name text not null,
  account_label text,
  secret_hint text,
  last_tested_at timestamptz,
  last_error_code text,
  metadata jsonb not null default '{}'::jsonb,
  connected_by uuid references auth.users(id),
  connected_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_integration_secrets (
  integration_id uuid primary key references public.staff_integrations(id) on delete cascade,
  secret_value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.staff_integrations enable row level security;
alter table public.staff_integration_secrets enable row level security;
revoke all on public.staff_integrations from public, anon, authenticated;
revoke all on public.staff_integration_secrets from public, anon, authenticated;
grant all on public.staff_integrations, public.staff_integration_secrets to service_role;

create or replace function public.get_staff_integrations()
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_items jsonb;
begin
  if not public.is_active_staff(array['super_admin','admin','content_manager']) then
    return jsonb_build_object('success', false, 'code', 'STAFF_ACCESS_DENIED');
  end if;
  insert into public.staff_integrations (provider, connection_method, display_name)
  values
    ('meta_whatsapp','oauth','WhatsApp / Meta'), ('instagram','oauth','Instagram'), ('facebook','oauth','Facebook'),
    ('telegram','manual','Telegram'), ('google_calendar','oauth','Google Calendar'), ('canva','oauth','Canva'), ('ai_provider','api_key','AI Provider')
  on conflict (provider) do nothing;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', si.id, 'provider', si.provider, 'connectionMethod', si.connection_method, 'status', si.status,
    'displayName', si.display_name, 'accountLabel', si.account_label, 'secretHint', si.secret_hint,
    'lastTestedAt', si.last_tested_at, 'lastErrorCode', si.last_error_code, 'metadata', si.metadata,
    'connectedAt', si.connected_at, 'updatedAt', si.updated_at
  ) order by si.display_name), '[]'::jsonb) into v_items from public.staff_integrations si;
  return jsonb_build_object('success', true, 'items', v_items, 'generatedAt', now());
end;
$function$;

create or replace function public.connect_staff_integration(
  p_provider text, p_connection_method text, p_secret text default null, p_secret_hint text default null, p_account_label text default null, p_metadata jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_id uuid; v_now timestamptz := now(); v_hint text;
begin
  if not public.is_active_staff(array['super_admin','admin','content_manager']) then return jsonb_build_object('success', false, 'code', 'STAFF_ACCESS_DENIED'); end if;
  if p_provider not in ('meta_whatsapp','instagram','facebook','telegram','google_calendar','canva','ai_provider') then return jsonb_build_object('success', false, 'code', 'UNSUPPORTED_PROVIDER'); end if;
  if p_connection_method not in ('oauth','api_key','manual') then return jsonb_build_object('success', false, 'code', 'UNSUPPORTED_METHOD'); end if;
  if p_connection_method = 'api_key' and char_length(trim(coalesce(p_secret,''))) < 12 then return jsonb_build_object('success', false, 'code', 'SECRET_TOO_SHORT'); end if;
  if p_connection_method <> 'api_key' and nullif(trim(coalesce(p_secret,'')), '') is null then return jsonb_build_object('success', false, 'code', 'CREDENTIAL_REQUIRED'); end if;
  v_hint := coalesce(nullif(left(trim(p_secret_hint), 32), ''), case when p_secret is not null then '••••' || right(trim(p_secret), 4) else null end);
  insert into public.staff_integrations(provider, connection_method, status, account_label, secret_hint, metadata, connected_by, connected_at, updated_at)
  values (p_provider, p_connection_method, 'needs_test', nullif(left(trim(p_account_label), 120), ''), v_hint, coalesce(p_metadata, '{}'::jsonb), auth.uid(), v_now, v_now)
  on conflict (provider) do update set connection_method = excluded.connection_method, status = 'needs_test', account_label = excluded.account_label, secret_hint = excluded.secret_hint, metadata = excluded.metadata, connected_by = auth.uid(), connected_at = v_now, last_error_code = null, updated_at = v_now
  returning id into v_id;
  if nullif(trim(coalesce(p_secret,'')), '') is not null then
    insert into public.staff_integration_secrets(integration_id, secret_value, updated_at, updated_by) values (v_id, trim(p_secret), v_now, auth.uid())
    on conflict (integration_id) do update set secret_value = excluded.secret_value, updated_at = v_now, updated_by = auth.uid();
  end if;
  insert into public.audit_logs(actor_id, actor_type, action, entity_type, entity_id, detail) values(auth.uid(), 'user', 'integration_connected', 'staff_integration', v_id, jsonb_build_object('provider', p_provider, 'method', p_connection_method, 'accountLabel', nullif(left(trim(p_account_label), 120), '')));
  return jsonb_build_object('success', true, 'code', 'INTEGRATION_SAVED', 'integrationId', v_id, 'status', 'needs_test', 'secretHint', v_hint);
end;
$function$;

create or replace function public.test_staff_integration(p_provider text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_id uuid; v_status text;
begin
  if not public.is_active_staff(array['super_admin','admin','content_manager']) then return jsonb_build_object('success', false, 'code', 'STAFF_ACCESS_DENIED'); end if;
  select id, status into v_id, v_status from public.staff_integrations where provider = p_provider;
  if not found then return jsonb_build_object('success', false, 'code', 'INTEGRATION_NOT_FOUND'); end if;
  if not exists(select 1 from public.staff_integration_secrets where integration_id = v_id) then return jsonb_build_object('success', false, 'code', 'CREDENTIAL_MISSING'); end if;
  update public.staff_integrations set status = 'connected', last_tested_at = now(), last_error_code = null, updated_at = now() where id = v_id;
  insert into public.audit_logs(actor_id, actor_type, action, entity_type, entity_id, detail) values(auth.uid(), 'user', 'integration_tested', 'staff_integration', v_id, jsonb_build_object('provider', p_provider, 'result', 'configured'));
  return jsonb_build_object('success', true, 'code', 'CONNECTION_CONFIGURED', 'provider', p_provider, 'status', 'connected', 'testedAt', now());
end;
$function$;

create or replace function public.disconnect_staff_integration(p_provider text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_id uuid;
begin
  if not public.is_active_staff(array['super_admin','admin','content_manager']) then return jsonb_build_object('success', false, 'code', 'STAFF_ACCESS_DENIED'); end if;
  select id into v_id from public.staff_integrations where provider = p_provider;
  if not found then return jsonb_build_object('success', false, 'code', 'INTEGRATION_NOT_FOUND'); end if;
  delete from public.staff_integration_secrets where integration_id = v_id;
  update public.staff_integrations set status = 'disabled', secret_hint = null, account_label = null, last_error_code = null, updated_at = now() where id = v_id;
  insert into public.audit_logs(actor_id, actor_type, action, entity_type, entity_id, detail) values(auth.uid(), 'user', 'integration_disconnected', 'staff_integration', v_id, jsonb_build_object('provider', p_provider));
  return jsonb_build_object('success', true, 'code', 'INTEGRATION_DISCONNECTED', 'provider', p_provider);
end;
$function$;

grant execute on function public.get_staff_integrations() to authenticated, service_role;
grant execute on function public.connect_staff_integration(text,text,text,text,text,jsonb) to authenticated, service_role;
grant execute on function public.test_staff_integration(text) to authenticated, service_role;
grant execute on function public.disconnect_staff_integration(text) to authenticated, service_role;
