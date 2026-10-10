-- Align publish scheduling with planned_for so daily batch slots fire on the correct day.
-- Repairs future scheduled items that were enqueued with scheduled_for = now().

CREATE OR REPLACE FUNCTION public.enqueue_publish_job(p_content_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_content public.content_items%rowtype;
  v_media public.media_assets%rowtype;
  v_job public.background_jobs%rowtype;
  v_auth public.owner_publish_authorizations%rowtype;
  v_staff public.staff_profiles%rowtype;
  v_now timestamptz := now();
  v_publish_at timestamptz;
  v_platform text;
  v_page_or_account text;
  v_approval_reference text;
  v_authorized_by text;
  v_ttl integer := 30;
begin
  if not public.is_active_staff(array['super_admin', 'admin', 'content_manager']) then
    return jsonb_build_object('success', false, 'code', 'STAFF_ACCESS_DENIED');
  end if;

  if p_content_item_id is null then
    return jsonb_build_object('success', false, 'code', 'INVALID_CONTENT_ITEM_ID');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_content_item_id::text, 0));

  select * into v_staff
  from public.staff_profiles
  where id = auth.uid() and active = true;

  if not found then
    return jsonb_build_object('success', false, 'code', 'STAFF_ACCESS_DENIED');
  end if;

  select * into v_content
  from public.content_items
  where id = p_content_item_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'code', 'CONTENT_ITEM_NOT_FOUND');
  end if;

  v_platform := lower(btrim(v_content.platform));

  if v_platform not in ('facebook', 'instagram') then
    return jsonb_build_object('success', false, 'code', 'PLATFORM_NOT_SUPPORTED');
  end if;

  if v_content.status <> 'approved' then
    return jsonb_build_object('success', false, 'code', 'CONTENT_NOT_APPROVED', 'status', v_content.status::text);
  end if;

  if v_content.published_at is not null then
    return jsonb_build_object('success', false, 'code', 'CONTENT_ALREADY_PUBLISHED');
  end if;

  if exists (
    select 1
    from public.content_publication_receipts pr
    where pr.content_item_id = p_content_item_id
      and lower(pr.platform) = v_platform
      and pr.status = 'published'
  ) then
    return jsonb_build_object('success', false, 'code', 'PUBLISH_RECEIPT_EXISTS');
  end if;

  if char_length(btrim(coalesce(v_content.caption, ''))) < 2 then
    return jsonb_build_object('success', false, 'code', 'CONTENT_NOT_READY');
  end if;

  if v_content.planned_for is null then
    return jsonb_build_object('success', false, 'code', 'PLANNED_FOR_MISSING');
  end if;

  if v_content.planned_for <= v_now then
    return jsonb_build_object(
      'success', false,
      'code', 'PLANNED_FOR_PASSED',
      'plannedFor', v_content.planned_for
    );
  end if;

  v_publish_at := v_content.planned_for;

  if v_platform = 'instagram' and v_content.media_asset_id is null then
    return jsonb_build_object('success', false, 'code', 'MEDIA_ASSET_REQUIRED');
  end if;

  if v_content.media_asset_id is not null then
    select * into v_media
    from public.media_assets
    where id = v_content.media_asset_id;

    if not found then
      return jsonb_build_object('success', false, 'code', 'MEDIA_ASSET_NOT_FOUND');
    end if;

    if coalesce(v_media.category, 'unclassified') <> 'swimming_business'
       or coalesce(v_media.publishability_status, 'blocked') <> 'ready_for_review'
       or coalesce(v_media.consent_status, 'unknown') <> 'consent_confirmed' then
      return jsonb_build_object('success', false, 'code', 'MEDIA_ASSET_NOT_PUBLISHABLE');
    end if;
  end if;

  select bj.*
  into v_job
  from public.background_jobs bj
  where bj.job_type = 'publish_content'
    and bj.payload->>'contentItemId' = p_content_item_id::text
    and bj.status in ('queued', 'retrying', 'processing')
  order by bj.created_at desc, bj.id desc
  limit 1
  for update;

  if found then
    select *
    into v_auth
    from public.owner_publish_authorizations
    where publish_job_id = v_job.id
    order by created_at desc
    limit 1;

    return jsonb_build_object(
      'success', true,
      'code', 'ALREADY_ENQUEUED',
      'contentItemId', p_content_item_id,
      'jobId', v_job.id,
      'authorizationId', v_auth.id,
      'jobStatus', v_job.status::text
    );
  end if;

  select *
  into v_auth
  from public.owner_publish_authorizations
  where content_item_id = p_content_item_id
    and platform = v_platform
    and consumed_at is null
    and revoked_at is null
    and expires_at > v_now
  order by created_at desc
  limit 1
  for update;

  if found then
    select * into v_job
    from public.background_jobs
    where id = v_auth.publish_job_id
      and job_type = 'publish_content';

    if found and v_job.status in ('queued', 'retrying', 'processing') then
      return jsonb_build_object(
        'success', true,
        'code', 'ALREADY_ENQUEUED',
        'contentItemId', p_content_item_id,
        'jobId', v_job.id,
        'authorizationId', v_auth.id,
        'jobStatus', v_job.status::text
      );
    end if;

    return jsonb_build_object('success', false, 'code', 'ACTIVE_AUTHORIZATION_EXISTS');
  end if;

  if v_platform = 'facebook' then
    v_page_or_account := '1164107840123575';
  else
    v_page_or_account := '17841400516801494';
  end if;

  v_approval_reference := 'command-center:request-publish:' || p_content_item_id::text;
  v_authorized_by := coalesce(nullif(btrim(v_staff.display_name), ''), auth.uid()::text);

  update public.content_items
  set status = 'scheduled',
      scheduled_for = v_publish_at,
      updated_at = v_now
  where id = p_content_item_id
  returning * into v_content;

  insert into public.background_jobs (
    job_type, status, payload, next_retry_at, created_at, updated_at
  ) values (
    'publish_content',
    'queued',
    jsonb_build_object(
      'contentItemId', p_content_item_id,
      'platform', v_platform,
      'pageId', case when v_platform = 'facebook' then v_page_or_account else null end,
      'accountId', case when v_platform = 'instagram' then v_page_or_account else null end,
      'source', 'manual_owner_approved',
      'idempotencyKey', p_content_item_id::text
    ),
    v_publish_at,
    v_now,
    v_now
  )
  returning * into v_job;

  insert into public.owner_publish_authorizations (
    content_item_id,
    platform,
    page_id,
    publish_job_id,
    scope,
    authorized_by,
    approval_reference,
    authorized_at,
    expires_at
  ) values (
    p_content_item_id,
    v_platform,
    v_page_or_account,
    v_job.id,
    'single_publish',
    v_authorized_by,
    v_approval_reference,
    v_now,
    v_now + make_interval(mins => v_ttl)
  )
  returning * into v_auth;

  insert into public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, detail)
  values (
    auth.uid(),
    'user',
    'content_publish_job_enqueued',
    'content_item',
    p_content_item_id,
    jsonb_build_object(
      'authorizationId', v_auth.id,
      'publishJobId', v_job.id,
      'platform', v_platform,
      'pageOrAccountId', v_page_or_account,
      'scheduledFor', v_publish_at,
      'expiresAt', v_auth.expires_at,
      'approvalReference', v_approval_reference,
      'idempotencyKey', p_content_item_id::text
    )
  );

  return jsonb_build_object(
    'success', true,
    'code', 'ENQUEUED',
    'contentItemId', p_content_item_id,
    'jobId', v_job.id,
    'authorizationId', v_auth.id,
    'jobStatus', v_job.status::text,
    'scheduledFor', v_publish_at,
    'authorizedAt', v_auth.authorized_at,
    'expiresAt', v_auth.expires_at
  );
end;
$function$;

-- Repair future scheduled items that were enqueued with immediate timestamps.
update public.content_items ci
set scheduled_for = ci.planned_for,
    updated_at = now()
where ci.status = 'scheduled'
  and ci.published_at is null
  and ci.planned_for is not null
  and ci.planned_for > now()
  and ci.scheduled_for is distinct from ci.planned_for;

update public.background_jobs bj
set next_retry_at = ci.planned_for,
    updated_at = now()
from public.content_items ci
where bj.job_type = 'publish_content'
  and bj.payload->>'contentItemId' = ci.id::text
  and bj.status in ('queued', 'retrying')
  and ci.status = 'scheduled'
  and ci.planned_for > now()
  and bj.next_retry_at is distinct from ci.planned_for;
