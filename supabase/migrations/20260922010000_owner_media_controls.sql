-- Owner media controls: give the authenticated Command Center owner a dedicated,
-- audited media-management RPC without widening staff permissions.
-- Additive and non-destructive. Does not publish or contact any external platform.

CREATE OR REPLACE FUNCTION public.update_owner_media_asset(
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
  -- Owner authority is based on the same canonical staff profile role used by
  -- the application session. Staff roles other than super_admin cannot use this RPC.
  if public.command_center_staff_role() <> 'super_admin' then
    raise exception 'OWNER_ACCESS_DENIED' using errcode = '42501';
  end if;

  select * into v_asset
  from public.media_assets
  where id = p_media_asset_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  end if;

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

  if p_content_item_id is not null
     and not exists (select 1 from public.content_items where id = p_content_item_id) then
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
    v_publishability := case
      when v_asset.ai_analysis_status = 'completed' then 'ready_for_review'
      else 'blocked'
    end;
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

  insert into public.audit_logs(actor_id, actor_type, action, entity_type, entity_id, detail)
  values (
    auth.uid(),
    'user',
    'owner_media_asset_updated',
    'media_asset',
    v_asset.id,
    jsonb_build_object(
      'category', v_asset.category,
      'consentStatus', v_asset.consent_status,
      'mediaStatus', v_asset.media_status,
      'publishabilityStatus', v_asset.publishability_status,
      'contentItemId', v_asset.content_item_id
    )
  );

  return jsonb_build_object(
    'success', true,
    'mediaAssetId', v_asset.id,
    'publishabilityStatus', v_asset.publishability_status,
    'consentStatus', v_asset.consent_status,
    'mediaStatus', v_asset.media_status
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.update_owner_media_asset(uuid,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_owner_media_asset(uuid,text,text,text,uuid) TO authenticated;
