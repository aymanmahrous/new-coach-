-- Content batch safety foundation (additive only).
-- Adds nullable batch_id grouping and idempotent batch approval RPC.
-- Does not schedule, publish, or weaken auth/RLS.

ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS batch_id uuid NULL;

COMMENT ON COLUMN public.content_items.batch_id IS
  'Optional staff-facing batch grouping id for 10-day content review cycles.';

CREATE INDEX IF NOT EXISTS content_items_batch_id_idx
  ON public.content_items (batch_id)
  WHERE batch_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_staff_content_items()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.is_active_staff(array['super_admin','admin','reception','coach','content_manager']) then
    raise exception 'STAFF_ACCESS_DENIED' using errcode = '42501';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'batchId', c.batch_id,
          'plannedFor', c.planned_for,
          'scheduledFor', c.scheduled_for,
          'platform', c.platform,
          'contentType', c.content_type,
          'topic', coalesce(c.topic, ''),
          'hook', coalesce(c.hook, ''),
          'caption', coalesce(c.caption, ''),
          'cta', coalesce(c.cta, ''),
          'hashtags', to_jsonb(c.hashtags),
          'visualPrompt', coalesce(c.visual_prompt, ''),
          'status', c.status::text,
          'language', c.language,
          'contentPillar', c.content_pillar,
          'contentSlot', c.content_slot,
          'contentFingerprint', c.content_fingerprint,
          'providerExternalId', c.provider_external_id,
          'publishedAt', c.published_at,
          'createdAt', c.created_at,
          'updatedAt', c.updated_at,
          'receipts', coalesce(r.receipts, '[]'::jsonb)
        )
        order by coalesce(c.scheduled_for, c.planned_for, c.created_at) asc, c.id asc
      )
      from (
        select *
        from public.content_items
        order by coalesce(scheduled_for, planned_for, created_at) desc, id desc
        limit 500
      ) c
      left join lateral (
        select jsonb_agg(
          jsonb_build_object(
            'platform', pr.platform,
            'status', pr.status,
            'externalPostId', pr.external_post_id,
            'externalContainerId', pr.external_container_id,
            'plainLanguageReason', case
              when pr.status not in ('failed', 'ambiguous') then null
              when pr.last_error ilike 'meta_auth_failed%' then 'Facebook/Instagram connection needs to be reconnected (login expired).'
              when pr.status = 'ambiguous' or pr.last_error ilike 'AMBIGUOUS%' then 'Publishing result unclear — needs a manual check to confirm whether it actually posted.'
              when pr.last_error ilike 'AUTHORIZATION_EXPIRED%' then 'Approval expired before publishing finished.'
              when pr.last_error ilike 'OWNER_REJECTED%' then 'This post was rejected in the approval step.'
              when pr.last_error ilike 'OWNER_REVOKED%' then 'Approval was withdrawn before publishing finished.'
              else 'Publishing failed due to a technical issue — safe to retry.'
            end,
            'updatedAt', pr.updated_at
          )
          order by pr.updated_at desc
        ) as receipts
        from public.content_publication_receipts pr
        where pr.content_item_id = c.id
      ) r on true
    ),
    '[]'::jsonb
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.approve_staff_content_batch(p_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_item public.content_items%rowtype;
  v_previous_status public.content_status;
  v_previous_scheduled_for timestamptz;
  v_approved integer := 0;
  v_already_approved integer := 0;
  v_skipped integer := 0;
  v_total integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if not public.is_active_staff(array['super_admin','admin','content_manager']) then
    raise exception 'STAFF_ACCESS_DENIED' using errcode = '42501';
  end if;

  if p_batch_id is null then
    return jsonb_build_object('success', false, 'code', 'INVALID_BATCH_ID');
  end if;

  select count(*)::integer
  into v_total
  from public.content_items
  where batch_id = p_batch_id;

  if v_total = 0 then
    return jsonb_build_object('success', false, 'code', 'BATCH_NOT_FOUND', 'batchId', p_batch_id);
  end if;

  perform 1
  from public.background_jobs bj
  join public.content_items ci on ci.id = (bj.payload->>'contentItemId')::uuid
  where ci.batch_id = p_batch_id
    and bj.job_type = 'publish_content'
    and bj.status in ('queued', 'processing', 'retrying')
  order by bj.id
  for update;

  for v_item in
    select *
    from public.content_items
    where batch_id = p_batch_id
    order by created_at asc, id asc
    for update
  loop
    if v_item.status = 'approved' then
      v_already_approved := v_already_approved + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'contentItemId', v_item.id,
        'code', 'ALREADY_APPROVED',
        'status', v_item.status::text
      ));
      continue;
    end if;

    if v_item.status not in ('draft', 'generated', 'needs_review') then
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'contentItemId', v_item.id,
        'code', 'INVALID_TRANSITION',
        'status', v_item.status::text
      ));
      continue;
    end if;

    v_previous_status := v_item.status;
    v_previous_scheduled_for := v_item.scheduled_for;

    update public.background_jobs
    set status = 'dead', last_error = 'CONTENT_NOT_SCHEDULED', updated_at = now()
    where job_type = 'publish_content'
      and payload->>'contentItemId' = v_item.id::text
      and status in ('queued', 'processing', 'retrying');

    update public.content_items
    set status = 'approved', scheduled_for = null, updated_at = now()
    where id = v_item.id
    returning * into v_item;

    insert into public.audit_logs (
      actor_id, actor_type, action, entity_type, entity_id, detail
    ) values (
      auth.uid(),
      'user',
      'content_item_transitioned',
      'content_item',
      v_item.id,
      jsonb_build_object(
        'requestedAction', 'approve',
        'batchId', p_batch_id,
        'previousStatus', v_previous_status::text,
        'nextStatus', v_item.status::text,
        'previousScheduledFor', v_previous_scheduled_for,
        'nextScheduledFor', v_item.scheduled_for
      )
    );

    v_approved := v_approved + 1;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'contentItemId', v_item.id,
      'code', 'APPROVED',
      'status', v_item.status::text
    ));
  end loop;

  return jsonb_build_object(
    'success', true,
    'batchId', p_batch_id,
    'approvedCount', v_approved,
    'alreadyApprovedCount', v_already_approved,
    'skippedCount', v_skipped,
    'results', v_results
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION public.approve_staff_content_batch(uuid) TO authenticated, service_role;
