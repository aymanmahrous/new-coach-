-- Media Library pipeline: additive metadata columns + staff upload/analysis RPCs.
-- Non-destructive. Preserves existing media_assets and content_items rows.

ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS category text NULL,
  ADD COLUMN IF NOT EXISTS media_status text NULL,
  ADD COLUMN IF NOT EXISTS ai_analysis_status text NULL,
  ADD COLUMN IF NOT EXISTS publishability_status text NULL,
  ADD COLUMN IF NOT EXISTS consent_status text NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NULL;

ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS media_asset_id uuid NULL,
  ADD COLUMN IF NOT EXISTS media_source text NULL,
  ADD COLUMN IF NOT EXISTS media_plan jsonb NULL;

CREATE INDEX IF NOT EXISTS media_assets_category_idx
  ON public.media_assets (category)
  WHERE category IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_staff_media_assets()
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
          'id', m.id,
          'createdBy', m.created_by,
          'contentItemId', m.content_item_id,
          'assetType', m.asset_type,
          'source', m.source,
          'storagePath', m.storage_path,
          'provider', m.provider,
          'providerJobId', m.provider_job_id,
          'prompt', m.prompt,
          'metadata', m.metadata,
          'category', coalesce(m.category, 'unclassified'),
          'mediaStatus', coalesce(m.media_status, 'unclassified'),
          'aiAnalysisStatus', coalesce(m.ai_analysis_status, 'not_started'),
          'publishabilityStatus', coalesce(m.publishability_status, 'blocked'),
          'consentStatus', coalesce(m.consent_status, 'unknown'),
          'suggestedPlatforms', coalesce(m.metadata->'analysis'->'suggestedPlatforms', '[]'::jsonb),
          'suggestedFormats', coalesce(m.metadata->'analysis'->'suggestedFormats', '[]'::jsonb),
          'aiNotes', coalesce(m.metadata->'analysis'->>'notes', ''),
          'createdAt', m.created_at,
          'updatedAt', m.updated_at
        )
        order by m.created_at desc, m.id desc
      )
      from (
        select *
        from public.media_assets
        where created_by = auth.uid()
           or (
             created_by is null
             and nullif(btrim(coalesce(storage_path, '')), '') is not null
             and position('://' in storage_path) = 0
             and split_part(storage_path, '/', 1) = auth.uid()::text
             and public.can_manage_relax_fix_media()
           )
        order by created_at desc, id desc
        limit 500
      ) m
    ),
    '[]'::jsonb
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.register_staff_media_upload(
  p_asset_type text,
  p_storage_path text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'storage', 'pg_temp'
AS $function$
declare
  v_asset public.media_assets%rowtype;
  v_prefix text := auth.uid()::text || '/';
begin
  if not public.is_active_staff(array['super_admin','admin','content_manager']) then
    raise exception 'STAFF_ACCESS_DENIED' using errcode = '42501';
  end if;

  if p_asset_type not in ('image','video') then
    return jsonb_build_object('success', false, 'code', 'INVALID_ASSET_TYPE');
  end if;

  if nullif(btrim(coalesce(p_storage_path, '')), '') is null
     or left(p_storage_path, char_length(v_prefix)) <> v_prefix then
    return jsonb_build_object('success', false, 'code', 'INVALID_STORAGE_PATH');
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'relax-fix-media' and o.name = p_storage_path
  ) then
    return jsonb_build_object('success', false, 'code', 'STORAGE_OBJECT_NOT_FOUND');
  end if;

  insert into public.media_assets (
    created_by, asset_type, source, storage_path, metadata,
    category, media_status, ai_analysis_status, publishability_status, consent_status, updated_at
  ) values (
    auth.uid(), p_asset_type, 'upload', p_storage_path, coalesce(p_metadata, '{}'::jsonb),
    'unclassified', 'unclassified', 'not_started', 'blocked', 'unknown', now()
  )
  returning * into v_asset;

  insert into public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, detail)
  values (auth.uid(), 'user', 'media_asset_uploaded', 'media_asset', v_asset.id,
    jsonb_build_object('assetType', v_asset.asset_type, 'storagePath', v_asset.storage_path, 'category', 'unclassified'));

  return jsonb_build_object('success', true, 'mediaAssetId', v_asset.id, 'category', 'unclassified');
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_staff_media_asset(
  p_media_asset_id uuid,
  p_category text DEFAULT NULL,
  p_consent_status text DEFAULT NULL,
  p_media_status text DEFAULT NULL,
  p_content_item_id uuid DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_asset public.media_assets%rowtype;
  v_category text;
  v_consent text;
  v_status text;
  v_publishability text;
begin
  if not public.is_active_staff(array['super_admin','admin','content_manager']) then
    raise exception 'STAFF_ACCESS_DENIED' using errcode = '42501';
  end if;

  select * into v_asset from public.media_assets where id = p_media_asset_id for update;
  if not found then return jsonb_build_object('success', false, 'code', 'NOT_FOUND'); end if;

  v_category := coalesce(nullif(btrim(p_category), ''), v_asset.category, 'unclassified');
  if v_category not in ('swimming_business','family_personal','other_business','other','unclassified') then
    return jsonb_build_object('success', false, 'code', 'INVALID_CATEGORY');
  end if;

  v_consent := coalesce(nullif(btrim(p_consent_status), ''), v_asset.consent_status, 'unknown');
  if v_consent not in ('unknown','consent_required','consent_confirmed','no_consent') then
    return jsonb_build_object('success', false, 'code', 'INVALID_CONSENT');
  end if;

  v_status := coalesce(nullif(btrim(p_media_status), ''), v_asset.media_status, 'unclassified');
  if v_status not in ('unclassified','approved','rejected','unsuitable') then
    return jsonb_build_object('success', false, 'code', 'INVALID_STATUS');
  end if;

  if p_content_item_id is not null and not exists (select 1 from public.content_items where id = p_content_item_id) then
    return jsonb_build_object('success', false, 'code', 'CONTENT_ITEM_NOT_FOUND');
  end if;

  if v_category in ('family_personal','other','unclassified') then
    v_publishability := 'blocked';
  elsif v_status in ('rejected','unsuitable') then
    v_publishability := 'unsuitable';
  elsif v_category = 'swimming_business' and v_consent in ('unknown','consent_required') then
    v_publishability := 'consent_required';
  elsif v_category = 'swimming_business' and v_consent = 'no_consent' then
    v_publishability := 'blocked';
  else
    v_publishability := case when v_asset.ai_analysis_status = 'completed' then 'ready_for_review' else 'blocked' end;
  end if;

  update public.media_assets
  set category = v_category,
      consent_status = v_consent,
      media_status = v_status,
      publishability_status = v_publishability,
      content_item_id = coalesce(p_content_item_id, content_item_id),
      updated_at = now()
  where id = v_asset.id
  returning * into v_asset;

  return jsonb_build_object('success', true, 'mediaAssetId', v_asset.id, 'publishabilityStatus', v_asset.publishability_status);
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_staff_media_ai_analysis(
  p_media_asset_id uuid,
  p_analysis jsonb,
  p_provider text DEFAULT 'local_heuristic'
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_asset public.media_assets%rowtype;
  v_category text;
  v_consent text;
  v_publishability text;
begin
  if not public.is_active_staff(array['super_admin','admin','content_manager']) then
    raise exception 'STAFF_ACCESS_DENIED' using errcode = '42501';
  end if;

  if jsonb_typeof(p_analysis) <> 'object' then
    return jsonb_build_object('success', false, 'code', 'INVALID_ANALYSIS');
  end if;

  select * into v_asset from public.media_assets where id = p_media_asset_id for update;
  if not found then return jsonb_build_object('success', false, 'code', 'NOT_FOUND'); end if;

  v_category := coalesce(v_asset.category, 'unclassified');
  if v_category <> 'swimming_business' then
    return jsonb_build_object('success', false, 'code', 'ANALYSIS_CATEGORY_BLOCKED');
  end if;

  v_consent := coalesce(v_asset.consent_status, 'unknown');
  if (p_analysis->>'containsChildrenGuess') = 'possible' and v_consent = 'unknown' then
    v_consent := 'consent_required';
  end if;

  if v_consent in ('unknown','consent_required') then
    v_publishability := 'consent_required';
  elsif v_consent = 'no_consent' then
    v_publishability := 'blocked';
  else
    v_publishability := 'ready_for_review';
  end if;

  update public.media_assets
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'analysis', p_analysis,
        'analysisProvider', coalesce(nullif(btrim(p_provider), ''), 'local_heuristic'),
        'geminiConnected', false
      ),
      ai_analysis_status = 'completed',
      consent_status = v_consent,
      publishability_status = v_publishability,
      updated_at = now()
  where id = v_asset.id
  returning * into v_asset;

  return jsonb_build_object(
    'success', true,
    'mediaAssetId', v_asset.id,
    'aiAnalysisStatus', v_asset.ai_analysis_status,
    'publishabilityStatus', v_asset.publishability_status,
    'consentStatus', v_asset.consent_status
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION public.register_staff_media_upload(text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_staff_media_asset(uuid, text, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_staff_media_ai_analysis(uuid, jsonb, text) TO authenticated, service_role;

-- Extend content read/write RPCs with media linkage fields (additive).

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
          'mediaAssetId', c.media_asset_id,
          'mediaSource', c.media_source,
          'mediaPlan', c.media_plan,
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
        select * from public.content_items
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
