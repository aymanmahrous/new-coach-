-- Repair only future scheduled publish jobs that are safely routable.
-- Do not revive overdue/legacy jobs or jobs without approved media.
UPDATE public.background_jobs bj
SET payload = bj.payload || jsonb_build_object(
      'platform', lower(btrim(ci.platform)),
      'pageId', CASE WHEN lower(btrim(ci.platform)) = 'facebook' THEN '1164107840123575' ELSE NULL END,
      'accountId', CASE WHEN lower(btrim(ci.platform)) = 'instagram' THEN '17841400516801494' ELSE NULL END,
      'source', 'legacy_schedule_repair',
      'idempotencyKey', ci.id::text
    ),
    updated_at = now()
FROM public.content_items ci
WHERE bj.job_type = 'publish_content'
  AND bj.status = 'queued'
  AND coalesce(bj.payload->>'platform', '') = ''
  AND bj.payload->>'contentItemId' = ci.id::text
  AND ci.status = 'scheduled'
  AND ci.scheduled_for > now()
  AND ci.platform IN ('facebook', 'instagram')
  AND ci.media_asset_id IS NOT NULL
  AND bj.next_retry_at = ci.scheduled_for;
