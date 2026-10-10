-- Media Source Hub: external references are indexed without copying files or granting publish access.
-- Every linked item remains blocked/pending review until the owner updates it through the existing controls.

CREATE OR REPLACE FUNCTION public.register_staff_external_media_asset(
  p_asset_type text,
  p_provider text,
  p_external_id text,
  p_name text,
  p_mime_type text,
  p_web_url text,
  p_preview_url text DEFAULT NULL,
  p_size_bytes bigint DEFAULT NULL,
  p_created_at text DEFAULT NULL,
  p_folder text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_asset public.media_assets%rowtype;
  v_metadata jsonb;
begin
  if not public.is_active_staff(array['super_admin','admin','content_manager']) then
    raise exception 'STAFF_ACCESS_DENIED' using errcode = '42501';
  end if;

  if p_asset_type not in ('image', 'video') then
    return jsonb_build_object('success', false, 'code', 'INVALID_ASSET_TYPE');
  end if;
  if p_provider not in ('google_drive', 'google_photos', 'dropbox', 'onedrive') then
    return jsonb_build_object('success', false, 'code', 'INVALID_PROVIDER');
  end if;
  if nullif(btrim(p_external_id), '') is null or length(p_external_id) > 500 then
    return jsonb_build_object('success', false, 'code', 'INVALID_EXTERNAL_ID');
  end if;
  if p_web_url !~* '^https://' then
    return jsonb_build_object('success', false, 'code', 'INVALID_EXTERNAL_URL');
  end if;

  select * into v_asset
  from public.media_assets
  where created_by = auth.uid()
    and source = 'external'
    and metadata->>'provider' = p_provider
    and metadata->>'external_id' = p_external_id
  order by created_at desc
  limit 1;

  if found then
    return jsonb_build_object('success', true, 'mediaAssetId', v_asset.id, 'duplicate', true);
  end if;

  v_metadata := jsonb_build_object(
    'provider', p_provider,
    'external_id', p_external_id,
    'file_name', left(coalesce(nullif(btrim(p_name), ''), p_external_id), 500),
    'mime_type', left(coalesce(nullif(btrim(p_mime_type), ''), 'application/octet-stream'), 120),
    'external_web_url', p_web_url,
    'external_preview_url', case when p_preview_url ~* '^https://' then p_preview_url else null end,
    'size_bytes', p_size_bytes,
    'created_at', p_created_at,
    'folder', p_folder,
    'review_status', 'needs_review'
  );

  insert into public.media_assets (
    created_by, asset_type, source, storage_path, provider, provider_job_id, metadata,
    category, media_status, ai_analysis_status, publishability_status, consent_status, updated_at
  ) values (
    auth.uid(), p_asset_type, 'external', null, p_provider, p_external_id, v_metadata,
    'unclassified', 'unclassified', 'not_started', 'blocked', 'unknown', now()
  ) returning * into v_asset;

  insert into public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, detail)
  values (auth.uid(), 'user', 'external_media_asset_linked', 'media_asset', v_asset.id,
    jsonb_build_object('provider', p_provider, 'externalId', p_external_id, 'reviewStatus', 'needs_review'));

  return jsonb_build_object('success', true, 'mediaAssetId', v_asset.id, 'duplicate', false, 'reviewStatus', 'needs_review');
end;
$function$;

GRANT EXECUTE ON FUNCTION public.register_staff_external_media_asset(text, text, text, text, text, text, text, bigint, text, text) TO authenticated, service_role;
