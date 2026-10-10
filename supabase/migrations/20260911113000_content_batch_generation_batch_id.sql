-- Extend content batch creation RPC to assign one shared batch_id per generated batch.
-- Additive: preserves existing validation, auth, and audit behavior.

CREATE OR REPLACE FUNCTION public.create_staff_generated_content_batch(p_items jsonb, p_provider_external_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_item jsonb;
  v_content public.content_items%rowtype;
  v_ids uuid[] := '{}'::uuid[];
  v_batch_id uuid := gen_random_uuid();
  v_count integer;
  v_platform text;
  v_content_type text;
  v_caption text;
  v_language text;
  v_pillar text;
  v_slot text;
  v_fingerprint text;
  v_planned_for_text text;
  v_planned_for timestamptz;
begin
  if not public.is_active_staff(array['super_admin','admin','content_manager']) then
    raise exception 'STAFF_ACCESS_DENIED' using errcode = '42501';
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('success', false, 'code', 'INVALID_ITEMS');
  end if;

  v_count := jsonb_array_length(p_items);
  if v_count < 1 or v_count > 90 then
    return jsonb_build_object('success', false, 'code', 'INVALID_BATCH_SIZE');
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_platform := v_item->>'platform';
    v_content_type := btrim(coalesce(v_item->>'contentType', ''));
    v_caption := btrim(coalesce(v_item->>'caption', ''));
    v_language := btrim(coalesce(v_item->>'language', ''));
    v_pillar := btrim(coalesce(v_item->>'contentPillar', ''));
    v_slot := btrim(coalesce(v_item->>'contentSlot', ''));
    v_fingerprint := lower(btrim(coalesce(v_item->>'contentFingerprint', '')));
    v_planned_for_text := btrim(coalesce(v_item->>'plannedFor', ''));

    if v_platform not in ('instagram','facebook','tiktok') then
      raise exception 'INVALID_PLATFORM' using errcode = '22023';
    end if;

    if char_length(v_content_type) < 2 or char_length(v_caption) < 2 then
      raise exception 'INVALID_CONTENT' using errcode = '22023';
    end if;

    if v_language not in ('ar', 'en') then
      raise exception 'INVALID_CONTENT_LANGUAGE' using errcode = '22023';
    end if;

    if v_pillar not in (
      'water_fear',
      'parent_concerns',
      'confidence',
      'swimming_education',
      'coach_authority',
      'real_progress',
      'safety_awareness',
      'aqua_training',
      'behind_the_scenes',
      'offer_booking'
    ) then
      raise exception 'INVALID_CONTENT_PILLAR' using errcode = '22023';
    end if;

    if v_slot not in ('trust_morning', 'education_midday', 'conversion_evening') then
      raise exception 'INVALID_CONTENT_SLOT' using errcode = '22023';
    end if;

    if v_fingerprint !~ '^[0-9a-f]{64}$' then
      raise exception 'INVALID_CONTENT_FINGERPRINT' using errcode = '22023';
    end if;

    begin
      v_planned_for := v_planned_for_text::timestamptz;
    exception when others then
      raise exception 'INVALID_PLANNED_TIME' using errcode = '22023';
    end;

    if v_planned_for <= now() or v_planned_for > now() + interval '31 days' then
      raise exception 'INVALID_PLANNED_TIME' using errcode = '22023';
    end if;

    if exists (
      select 1
      from public.content_items existing
      where existing.planned_for = v_planned_for
    ) then
      raise exception 'CONTENT_SLOT_ALREADY_PLANNED' using errcode = '23505';
    end if;

    if exists (
      select 1
      from public.content_items existing
      where existing.content_fingerprint = v_fingerprint
        and existing.created_at >= now() - interval '90 days'
    ) then
      raise exception 'CONTENT_FATIGUE_DUPLICATE' using errcode = '23505';
    end if;

    insert into public.content_items (
      batch_id,
      planned_for,
      platform,
      content_type,
      topic,
      hook,
      caption,
      cta,
      hashtags,
      visual_prompt,
      status,
      provider_external_id,
      language,
      content_pillar,
      content_slot,
      content_fingerprint
    ) values (
      v_batch_id,
      v_planned_for,
      v_platform,
      v_content_type,
      nullif(btrim(coalesce(v_item->>'topic', '')), ''),
      nullif(btrim(coalesce(v_item->>'hook', '')), ''),
      v_caption,
      nullif(btrim(coalesce(v_item->>'cta', '')), ''),
      coalesce(
        array(select jsonb_array_elements_text(coalesce(v_item->'hashtags', '[]'::jsonb))),
        '{}'::text[]
      ),
      nullif(btrim(coalesce(v_item->>'visualPrompt', '')), ''),
      'needs_review',
      nullif(btrim(coalesce(p_provider_external_id, '')), ''),
      v_language,
      v_pillar,
      v_slot,
      v_fingerprint
    )
    returning * into v_content;

    v_ids := array_append(v_ids, v_content.id);
  end loop;

  insert into public.audit_logs (
    actor_id,
    actor_type,
    action,
    entity_type,
    detail
  ) values (
    auth.uid(),
    'user',
    'content_brain_batch_saved_for_review',
    'content_batch',
    jsonb_build_object(
      'batchId', v_batch_id,
      'contentItemIds', to_jsonb(v_ids),
      'count', cardinality(v_ids),
      'dailyCadence', 3,
      'providerExternalId', nullif(btrim(coalesce(p_provider_external_id, '')), '')
    )
  );

  return jsonb_build_object(
    'success', true,
    'batchId', v_batch_id,
    'contentItemIds', to_jsonb(v_ids),
    'count', cardinality(v_ids),
    'status', 'needs_review'
  );
end;
$function$;
