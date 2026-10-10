-- Idempotently prepare approved FB/IG items for automatic due-time publishing.
-- Mirrors approve_staff_content_batch scheduling without changing approvals or creating owner auth.

CREATE OR REPLACE FUNCTION public.prepare_approved_publish_schedule(p_batch_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_item public.content_items%rowtype;
  v_media public.media_assets%rowtype;
  v_job public.background_jobs%rowtype;
  v_platform text;
  v_planned timestamptz;
  v_page_or_account text;
  v_publish_ready boolean;
  v_now timestamptz := now();
  v_prepared integer := 0;
  v_already_prepared integer := 0;
  v_skipped integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  for v_item in
    select *
    from public.content_items
    where status in ('approved', 'scheduled')
      and platform in ('facebook', 'instagram')
      and planned_for is not null
      and planned_for > v_now
      and published_at is null
      and (p_batch_id is null or batch_id = p_batch_id)
    order by planned_for asc, id asc
    for update
  loop
    v_platform := lower(btrim(v_item.platform));
    v_planned := v_item.planned_for;

    if v_item.status = 'scheduled'
       and v_item.scheduled_for is not distinct from v_planned then
      select bj.*
      into v_job
      from public.background_jobs bj
      where bj.job_type = 'publish_content'
        and bj.payload->>'contentItemId' = v_item.id::text
        and lower(coalesce(bj.payload->>'platform', '')) = v_platform
        and bj.status in ('queued', 'retrying', 'processing')
        and coalesce(bj.next_retry_at, bj.created_at) = v_planned
      order by bj.created_at desc, bj.id desc
      limit 1;

      if found then
        v_already_prepared := v_already_prepared + 1;
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'contentItemId', v_item.id,
          'code', 'ALREADY_PREPARED',
          'scheduledFor', v_item.scheduled_for,
          'jobId', v_job.id
        ));
        continue;
      end if;
    end if;

    v_publish_ready := char_length(btrim(coalesce(v_item.caption, ''))) >= 2
      and not exists (
        select 1
        from public.content_publication_receipts pr
        where pr.content_item_id = v_item.id
          and lower(pr.platform) = v_platform
          and pr.status = 'published'
      );

    if v_publish_ready and v_platform = 'instagram' then
      if v_item.media_asset_id is null then
        v_publish_ready := false;
      else
        select * into v_media from public.media_assets where id = v_item.media_asset_id;
        if not found
           or coalesce(v_media.category, 'unclassified') <> 'swimming_business'
           or coalesce(v_media.publishability_status, 'blocked') <> 'ready_for_review'
           or coalesce(v_media.consent_status, 'unknown') <> 'consent_confirmed' then
          v_publish_ready := false;
        end if;
      end if;
    end if;

    if not v_publish_ready or v_planned > v_now + interval '366 days' then
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'contentItemId', v_item.id,
        'code', 'NOT_PUBLISH_READY',
        'platform', v_platform,
        'plannedFor', v_planned
      ));
      continue;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(v_item.id::text, 0));

    if v_platform = 'facebook' then
      v_page_or_account := '1164107840123575';
    else
      v_page_or_account := '17841400516801494';
    end if;

    update public.background_jobs
    set status = 'dead',
        last_error = 'SCHEDULE_PREP_RESCHEDULED',
        updated_at = v_now
    where job_type = 'publish_content'
      and payload->>'contentItemId' = v_item.id::text
      and status in ('queued', 'processing', 'retrying');

    update public.content_items
    set status = 'scheduled',
        scheduled_for = v_planned,
        updated_at = v_now
    where id = v_item.id
    returning * into v_item;

    insert into public.background_jobs (
      job_type, status, payload, next_retry_at, created_at, updated_at
    ) values (
      'publish_content',
      'queued',
      jsonb_build_object(
        'contentItemId', v_item.id,
        'platform', v_platform,
        'pageId', case when v_platform = 'facebook' then v_page_or_account else null end,
        'accountId', case when v_platform = 'instagram' then v_page_or_account else null end,
        'source', 'schedule_prep_automation',
        'idempotencyKey', v_item.id::text
      ),
      v_planned,
      v_now,
      v_now
    )
    returning * into v_job;

    insert into public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, detail)
    values (
      null,
      'system',
      'content_publish_schedule_prepared',
      'content_item',
      v_item.id,
      jsonb_build_object(
        'publishJobId', v_job.id,
        'platform', v_platform,
        'plannedFor', v_planned,
        'scheduledFor', v_planned,
        'publishPrepOnly', true,
        'authorizationDeferred', true,
        'batchId', v_item.batch_id
      )
    );

    v_prepared := v_prepared + 1;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'contentItemId', v_item.id,
      'code', 'SCHEDULED_FOR_PUBLISH',
      'scheduledFor', v_planned,
      'jobId', v_job.id
    ));
  end loop;

  return jsonb_build_object(
    'success', true,
    'preparedCount', v_prepared,
    'alreadyPreparedCount', v_already_prepared,
    'skippedCount', v_skipped,
    'results', v_results
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION public.prepare_approved_publish_schedule(uuid) TO service_role;

-- One-time repair: schedule publish-ready approved items (migration role; no owner auth created).
WITH candidates AS (
  SELECT ci.id,
         ci.platform,
         ci.planned_for,
         CASE
           WHEN ci.platform = 'facebook' THEN '1164107840123575'
           ELSE '17841400516801494'
         END AS page_or_account
  FROM public.content_items ci
  LEFT JOIN public.background_jobs bj
    ON bj.job_type = 'publish_content'
   AND bj.payload->>'contentItemId' = ci.id::text
   AND bj.status IN ('queued', 'retrying', 'processing')
   AND coalesce(bj.next_retry_at, bj.created_at) = ci.planned_for
  LEFT JOIN public.media_assets ma ON ma.id = ci.media_asset_id
  WHERE ci.status IN ('approved', 'scheduled')
    AND ci.platform IN ('facebook', 'instagram')
    AND ci.planned_for > now()
    AND ci.published_at IS NULL
    AND char_length(btrim(coalesce(ci.caption, ''))) >= 2
    AND bj.id IS NULL
    AND (
      ci.platform = 'facebook'
      OR (
        ci.media_asset_id IS NOT NULL
        AND coalesce(ma.category, 'unclassified') = 'swimming_business'
        AND coalesce(ma.publishability_status, 'blocked') = 'ready_for_review'
        AND coalesce(ma.consent_status, 'unknown') = 'consent_confirmed'
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.content_publication_receipts pr
      WHERE pr.content_item_id = ci.id
        AND lower(pr.platform) = lower(ci.platform)
        AND pr.status = 'published'
    )
)
UPDATE public.background_jobs bj
SET status = 'dead',
    last_error = 'SCHEDULE_PREP_RESCHEDULED',
    updated_at = now()
FROM candidates c
WHERE bj.job_type = 'publish_content'
  AND bj.payload->>'contentItemId' = c.id::text
  AND bj.status IN ('queued', 'retrying', 'processing');

WITH candidates AS (
  SELECT ci.id,
         ci.platform,
         ci.planned_for,
         CASE
           WHEN ci.platform = 'facebook' THEN '1164107840123575'
           ELSE '17841400516801494'
         END AS page_or_account
  FROM public.content_items ci
  LEFT JOIN public.background_jobs bj
    ON bj.job_type = 'publish_content'
   AND bj.payload->>'contentItemId' = ci.id::text
   AND bj.status IN ('queued', 'retrying', 'processing')
   AND coalesce(bj.next_retry_at, bj.created_at) = ci.planned_for
  LEFT JOIN public.media_assets ma ON ma.id = ci.media_asset_id
  WHERE ci.status IN ('approved', 'scheduled')
    AND ci.platform IN ('facebook', 'instagram')
    AND ci.planned_for > now()
    AND ci.published_at IS NULL
    AND char_length(btrim(coalesce(ci.caption, ''))) >= 2
    AND bj.id IS NULL
    AND (
      ci.platform = 'facebook'
      OR (
        ci.media_asset_id IS NOT NULL
        AND coalesce(ma.category, 'unclassified') = 'swimming_business'
        AND coalesce(ma.publishability_status, 'blocked') = 'ready_for_review'
        AND coalesce(ma.consent_status, 'unknown') = 'consent_confirmed'
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.content_publication_receipts pr
      WHERE pr.content_item_id = ci.id
        AND lower(pr.platform) = lower(ci.platform)
        AND pr.status = 'published'
    )
)
UPDATE public.content_items ci
SET status = 'scheduled',
    scheduled_for = c.planned_for,
    updated_at = now()
FROM candidates c
WHERE ci.id = c.id;

WITH candidates AS (
  SELECT ci.id,
         ci.platform,
         ci.planned_for,
         CASE
           WHEN ci.platform = 'facebook' THEN '1164107840123575'
           ELSE '17841400516801494'
         END AS page_or_account
  FROM public.content_items ci
  LEFT JOIN public.background_jobs bj
    ON bj.job_type = 'publish_content'
   AND bj.payload->>'contentItemId' = ci.id::text
   AND bj.status IN ('queued', 'retrying', 'processing')
   AND coalesce(bj.next_retry_at, bj.created_at) = ci.planned_for
  LEFT JOIN public.media_assets ma ON ma.id = ci.media_asset_id
  WHERE ci.status IN ('approved', 'scheduled')
    AND ci.platform IN ('facebook', 'instagram')
    AND ci.planned_for > now()
    AND ci.published_at IS NULL
    AND char_length(btrim(coalesce(ci.caption, ''))) >= 2
    AND bj.id IS NULL
    AND (
      ci.platform = 'facebook'
      OR (
        ci.media_asset_id IS NOT NULL
        AND coalesce(ma.category, 'unclassified') = 'swimming_business'
        AND coalesce(ma.publishability_status, 'blocked') = 'ready_for_review'
        AND coalesce(ma.consent_status, 'unknown') = 'consent_confirmed'
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.content_publication_receipts pr
      WHERE pr.content_item_id = ci.id
        AND lower(pr.platform) = lower(ci.platform)
        AND pr.status = 'published'
    )
)
INSERT INTO public.background_jobs (job_type, status, payload, next_retry_at, created_at, updated_at)
SELECT
  'publish_content',
  'queued',
  jsonb_build_object(
    'contentItemId', c.id,
    'platform', lower(c.platform),
    'pageId', CASE WHEN c.platform = 'facebook' THEN c.page_or_account ELSE NULL END,
    'accountId', CASE WHEN c.platform = 'instagram' THEN c.page_or_account ELSE NULL END,
    'source', 'schedule_prep_automation',
    'idempotencyKey', c.id::text
  ),
  c.planned_for,
  now(),
  now()
FROM candidates c;
