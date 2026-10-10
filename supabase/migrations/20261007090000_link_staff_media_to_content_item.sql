-- Link an owner-approved media asset to an existing content item.
-- Reuses the existing content_items/media_assets linkage and review pipeline.
-- No automatic publishing.

create or replace function public.link_staff_media_to_content_item(
  p_content_item_id uuid,
  p_media_asset_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_item public.content_items%rowtype;
  v_asset public.media_assets%rowtype;
  v_previous_media_id uuid;
  v_previous_status public.content_status;
begin
  if not public.is_active_staff(array['super_admin','admin','content_manager']) then
    raise exception 'STAFF_ACCESS_DENIED' using errcode = '42501';
  end if;

  if p_content_item_id is null or p_media_asset_id is null then
    return jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
  end if;

  select * into v_item
  from public.content_items
  where id = p_content_item_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'code', 'CONTENT_ITEM_NOT_FOUND');
  end if;

  if v_item.status = 'published' then
    return jsonb_build_object('success', false, 'code', 'PUBLISHED_CONTENT_IMMUTABLE');
  end if;

  select * into v_asset
  from public.media_assets
  where id = p_media_asset_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'code', 'MEDIA_ASSET_NOT_FOUND');
  end if;

  if v_asset.asset_type not in ('image','video') then
    return jsonb_build_object('success', false, 'code', 'MEDIA_ASSET_TYPE_UNSUPPORTED');
  end if;

  if coalesce(v_asset.category, 'unclassified') not in ('swimming_business','other_business')
     or coalesce(v_asset.publishability_status, 'blocked') <> 'ready_for_review'
     or coalesce(v_asset.media_status, 'unclassified') in ('rejected','unsuitable')
     or (coalesce(v_asset.category, 'unclassified') = 'swimming_business'
         and coalesce(v_asset.consent_status, 'unknown') <> 'consent_confirmed') then
    return jsonb_build_object('success', false, 'code', 'MEDIA_ASSET_NOT_PUBLISHABLE');
  end if;

  if v_asset.content_item_id is not null and v_asset.content_item_id <> v_item.id then
    return jsonb_build_object('success', false, 'code', 'MEDIA_ASSET_ALREADY_LINKED');
  end if;

  v_previous_media_id := v_item.media_asset_id;
  v_previous_status := v_item.status;

  if v_previous_media_id is not null and v_previous_media_id <> v_asset.id then
    update public.media_assets
    set content_item_id = null, updated_at = now()
    where id = v_previous_media_id
      and content_item_id = v_item.id;
  end if;

  update public.content_items
  set media_asset_id = v_asset.id,
      media_source = 'real',
      media_plan = null,
      status = 'needs_review',
      scheduled_for = null,
      updated_at = now()
  where id = v_item.id;

  update public.media_assets
  set content_item_id = v_item.id,
      updated_at = now()
  where id = v_asset.id;

  insert into public.audit_logs (
    actor_id, actor_type, action, entity_type, entity_id, detail
  ) values (
    auth.uid(), 'user', 'content_media_linked', 'content_item', v_item.id,
    jsonb_build_object(
      'mediaAssetId', v_asset.id,
      'previousMediaAssetId', v_previous_media_id,
      'previousStatus', v_previous_status::text,
      'nextStatus', 'needs_review'
    )
  );

  return jsonb_build_object(
    'success', true,
    'contentItemId', v_item.id,
    'mediaAssetId', v_asset.id,
    'mediaSource', 'real',
    'status', 'needs_review'
  );
end;
$function$;

revoke execute on function public.link_staff_media_to_content_item(uuid, uuid) from public, anon;
grant execute on function public.link_staff_media_to_content_item(uuid, uuid) to authenticated;
