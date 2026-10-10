-- Allow the existing publish worker to claim the supported Facebook and Instagram jobs.
-- No lock, claim, or attempt-count behavior changes.

CREATE OR REPLACE FUNCTION public.claim_next_publish_job()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_job public.background_jobs%rowtype;
  v_content public.content_items%rowtype;
  v_content_item_id text;
  v_media jsonb;
begin
  select *
  into v_job
  from public.background_jobs
  where job_type = 'publish_content'
    and status in ('queued','retrying')
    and coalesce(next_retry_at, created_at) <= now()
    and coalesce(payload->>'platform', '') in ('facebook', 'instagram')
  order by coalesce(next_retry_at, created_at) asc, created_at asc, id asc
  for update skip locked
  limit 1;

  if not found then
    return jsonb_build_object('claimed', false, 'code', 'NO_JOB');
  end if;

  v_content_item_id := v_job.payload->>'contentItemId';

  select *
  into v_content
  from public.content_items
  where id::text = v_content_item_id
  for update;

  if not found then
    update public.background_jobs
    set status = 'dead', last_error = 'CONTENT_NOT_FOUND', updated_at = now()
    where id = v_job.id;
    return jsonb_build_object('claimed', false, 'code', 'CONTENT_NOT_FOUND', 'jobId', v_job.id);
  end if;

  if v_content.status = 'published' then
    update public.background_jobs
    set status = 'completed',
        result = jsonb_build_object('alreadyPublished', true, 'contentItemId', v_content.id),
        last_error = null,
        updated_at = now()
    where id = v_job.id;
    return jsonb_build_object('claimed', false, 'code', 'ALREADY_PUBLISHED', 'jobId', v_job.id);
  end if;

  if v_content.status <> 'scheduled' or v_content.scheduled_for is null then
    update public.background_jobs
    set status = 'dead', last_error = 'CONTENT_NOT_SCHEDULED', updated_at = now()
    where id = v_job.id;
    return jsonb_build_object('claimed', false, 'code', 'CONTENT_NOT_SCHEDULED', 'jobId', v_job.id);
  end if;

  if v_content.scheduled_for > now() then
    update public.background_jobs
    set status = 'queued', next_retry_at = v_content.scheduled_for, updated_at = now()
    where id = v_job.id;
    return jsonb_build_object('claimed', false, 'code', 'NOT_DUE', 'jobId', v_job.id);
  end if;

  update public.background_jobs
  set status = 'processing',
      attempt_count = attempt_count + 1,
      last_error = null,
      updated_at = now()
  where id = v_job.id
  returning * into v_job;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'assetType', m.asset_type,
        'storagePath', m.storage_path,
        'provider', m.provider
      )
      order by m.created_at asc, m.id asc
    ),
    '[]'::jsonb
  )
  into v_media
  from public.media_assets m
  where m.content_item_id = v_content.id;

  return jsonb_build_object(
    'claimed', true,
    'jobId', v_job.id,
    'attemptCount', v_job.attempt_count,
    'content', jsonb_build_object(
      'contentItemId', v_content.id,
      'platform', v_content.platform,
      'contentType', v_content.content_type,
      'caption', coalesce(v_content.caption, ''),
      'hashtags', to_jsonb(v_content.hashtags),
      'scheduledFor', v_content.scheduled_for,
      'media', v_media
    )
  );
end;
$function$;
