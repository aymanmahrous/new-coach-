-- Ensure the atomic owner approval+scheduling path creates a publish job
-- compatible with claim_next_publish_job (platform is mandatory there).
CREATE OR REPLACE FUNCTION public.approve_and_schedule_staff_content_item(
  p_content_item_id uuid,
  p_scheduled_for timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  approval_result jsonb;
  schedule_result jsonb;
  v_platform text;
  v_account_or_page text;
  v_job_id uuid;
BEGIN
  BEGIN
    approval_result := public.transition_staff_content_item(
      p_content_item_id,
      'approve',
      NULL
    );

    IF COALESCE((approval_result->>'success')::boolean, false) IS NOT TRUE THEN
      RETURN approval_result;
    END IF;

    schedule_result := public.transition_staff_content_item(
      p_content_item_id,
      'schedule',
      p_scheduled_for
    );

    IF COALESCE((schedule_result->>'success')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'SCHEDULE_AFTER_APPROVAL_FAILED';
    END IF;

    SELECT lower(btrim(platform))
      INTO v_platform
    FROM public.content_items
    WHERE id = p_content_item_id;

    IF v_platform NOT IN ('facebook','instagram') THEN
      RAISE EXCEPTION 'PLATFORM_NOT_SUPPORTED';
    END IF;

    v_account_or_page := CASE
      WHEN v_platform = 'facebook' THEN '1164107840123575'
      ELSE '17841400516801494'
    END;

    SELECT bj.id
      INTO v_job_id
    FROM public.background_jobs bj
    WHERE bj.job_type = 'publish_content'
      AND bj.payload->>'contentItemId' = p_content_item_id::text
      AND bj.status = 'queued'
      AND bj.next_retry_at = p_scheduled_for
    ORDER BY bj.created_at DESC, bj.id DESC
    LIMIT 1;

    IF v_job_id IS NULL THEN
      RAISE EXCEPTION 'SCHEDULE_PUBLISH_JOB_NOT_FOUND';
    END IF;

    UPDATE public.background_jobs
    SET payload = payload || jsonb_build_object(
      'platform', v_platform,
      'pageId', CASE WHEN v_platform = 'facebook' THEN v_account_or_page ELSE NULL END,
      'accountId', CASE WHEN v_platform = 'instagram' THEN v_account_or_page ELSE NULL END,
      'source', 'staff_schedule',
      'idempotencyKey', p_content_item_id::text
    ),
    updated_at = now()
    WHERE id = v_job_id;

    RETURN schedule_result || jsonb_build_object('publishJobId', v_job_id);
  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'APPROVE_AND_SCHEDULE_FAILED'
      );
  END;
END;
$function$;

-- Truth correction: scheduled Instagram items with image media are image posts,
-- not video Reels. No media is deleted or regenerated.
UPDATE public.content_items ci
SET content_type = 'image_post',
    updated_at = now()
FROM public.media_assets ma
WHERE ma.id = ci.media_asset_id
  AND ci.status = 'scheduled'
  AND ci.platform = 'instagram'
  AND ci.content_type = 'reel'
  AND ma.asset_type = 'image';
