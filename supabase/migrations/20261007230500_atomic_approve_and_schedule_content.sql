-- Atomic owner action: approval plus scheduling for content that already has a planned time.
-- This composes the existing, authorized transition RPCs so approval cannot be
-- left committed if scheduling fails.
CREATE OR REPLACE FUNCTION public.approve_and_schedule_staff_content_item(
  p_content_item_id uuid,
  p_scheduled_for timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  approval_result jsonb;
  schedule_result jsonb;
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

    RETURN schedule_result;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'APPROVE_AND_SCHEDULE_FAILED'
      );
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_and_schedule_staff_content_item(uuid, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_and_schedule_staff_content_item(uuid, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_and_schedule_staff_content_item(uuid, timestamptz) TO authenticated;
