-- Record the result of a direct Meta publish performed by the authenticated staff member.
-- The Edge Function performs the external Meta call; this RPC is the idempotent,
-- audited database commit that follows it.
create or replace function public.record_staff_content_publish_result(
  p_content_item_id uuid,
  p_success boolean,
  p_provider_external_id text default null,
  p_platform text default null,
  p_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_content public.content_items%rowtype;
  v_platform text;
  v_provider text := 'meta_graph_api';
  v_receipt public.content_publication_receipts%rowtype;
begin
  if not public.is_active_staff(array['super_admin', 'admin', 'content_manager']) then
    return jsonb_build_object('success', false, 'code', 'STAFF_ACCESS_DENIED');
  end if;

  if p_content_item_id is null then
    return jsonb_build_object('success', false, 'code', 'INVALID_CONTENT_ITEM_ID');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_content_item_id::text, 0));

  select * into v_content
  from public.content_items
  where id = p_content_item_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'code', 'CONTENT_NOT_FOUND');
  end if;

  v_platform := lower(btrim(coalesce(p_platform, v_content.platform)));
  if v_platform not in ('facebook', 'instagram') or lower(v_content.platform) <> v_platform then
    return jsonb_build_object('success', false, 'code', 'PLATFORM_MISMATCH');
  end if;

  if p_success then
    if char_length(btrim(coalesce(p_provider_external_id, ''))) < 1 then
      return jsonb_build_object('success', false, 'code', 'EXTERNAL_ID_REQUIRED');
    end if;

    select * into v_receipt
    from public.content_publication_receipts
    where content_item_id = p_content_item_id
      and lower(platform) = v_platform
      and status = 'published'
    order by created_at desc
    limit 1
    for update;

    if found then
      return jsonb_build_object(
        'success', true,
        'code', 'ALREADY_RECORDED',
        'providerExternalId', coalesce(v_receipt.external_post_id, p_provider_external_id),
        'platform', v_platform
      );
    end if;

    insert into public.content_publication_receipts (
      content_item_id, platform, provider, status, external_post_id,
      last_error, created_at, updated_at
    ) values (
      p_content_item_id, v_platform, v_provider, 'published',
      btrim(p_provider_external_id), null, now(), now()
    );

    update public.content_items
    set status = 'published',
        provider_external_id = btrim(p_provider_external_id),
        published_at = coalesce(published_at, now()),
        updated_at = now()
    where id = p_content_item_id;

    insert into public.audit_logs(actor_id, actor_type, action, entity_type, entity_id, detail)
    values (
      auth.uid(), 'user', 'content_published', 'content_item', p_content_item_id,
      jsonb_build_object(
        'platform', v_platform,
        'provider', v_provider,
        'providerExternalId', btrim(p_provider_external_id),
        'source', 'safe-content-publisher'
      )
    );

    return jsonb_build_object(
      'success', true,
      'code', 'PUBLISHED_RECORDED',
      'providerExternalId', btrim(p_provider_external_id),
      'platform', v_platform
    );
  end if;

  insert into public.content_publication_receipts (
    content_item_id, platform, provider, status, external_post_id,
    last_error, created_at, updated_at
  ) values (
    p_content_item_id, v_platform, v_provider, 'failed', null,
    left(coalesce(nullif(btrim(p_error_code), ''), 'META_API_ERROR'), 500), now(), now()
  );

  update public.content_items
  set status = 'failed', updated_at = now()
  where id = p_content_item_id
    and status not in ('published', 'cancelled');

  insert into public.audit_logs(actor_id, actor_type, action, entity_type, entity_id, detail)
  values (
    auth.uid(), 'user', 'content_publish_failed', 'content_item', p_content_item_id,
    jsonb_build_object(
      'platform', v_platform,
      'provider', v_provider,
      'errorCode', left(coalesce(nullif(btrim(p_error_code), ''), 'META_API_ERROR'), 500),
      'source', 'safe-content-publisher'
    )
  );

  return jsonb_build_object(
    'success', true,
    'code', 'PUBLISH_FAILURE_RECORDED',
    'platform', v_platform
  );
end;
$function$;

revoke all on function public.record_staff_content_publish_result(uuid, boolean, text, text, text) from public;
grant execute on function public.record_staff_content_publish_result(uuid, boolean, text, text, text) to authenticated, service_role;

comment on function public.record_staff_content_publish_result(uuid, boolean, text, text, text)
is 'Audited, idempotent result commit for direct Meta publishing. External calls happen only in safe-content-publisher.';

select pg_notify('pgrst', 'reload schema');

-- Verification marker: this migration is additive and does not alter existing rows.
select 1 as migration_applied;

-- Keep migration files POSIX-friendly and explicit.
