create or replace function public.get_staff_knowledge_management(
  p_search text default null,
  p_language text default null,
  p_status text default 'active'
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_role text; v_search text := nullif(btrim(coalesce(p_search, '')), ''); v_result jsonb;
begin
  v_role := public.command_center_staff_role();
  if v_role is null then raise exception 'STAFF_ACCESS_DENIED'; end if;
  if p_language is not null and p_language not in ('ar','en') then raise exception 'INVALID_LANGUAGE'; end if;
  if p_status not in ('active','archived','all') then raise exception 'INVALID_STATUS'; end if;
  select jsonb_build_object(
    'entries', coalesce((select jsonb_agg(to_jsonb(e) || jsonb_build_object(
      'kind', case when e.question is null then 'article' else 'faq' end,
      'relationships', coalesce((select jsonb_agg(to_jsonb(l) || jsonb_build_object(
        'media', case when l.media_asset_id is null then null else (select jsonb_build_object('id',m.id,'source',m.source,'provider',m.provider,'aiTags',m.metadata->'aiTags','consent',m.consent_status,'publishability',m.publishability_status,'usage',m.media_status) from public.media_assets m where m.id=l.media_asset_id) end,
        'content', case when l.content_item_id is null then null else (select jsonb_build_object('id',c.id,'status',c.status,'platform',c.platform,'contentType',c.content_type,'campaignId',c.campaign_id,'publicationState',case when c.published_at is null then 'not_published' else 'published' end,'approvalState',case when c.status in ('approved','scheduled','published') then 'approved_or_beyond' else c.status::text end) from public.content_items c where c.id=l.content_item_id) end
      ) order by l.created_at) from public.knowledge_entry_links l where l.knowledge_entry_id=e.id), '[]'::jsonb)
    ) order by e.updated_at desc) from public.knowledge_entries e
    where (p_status='all' or (p_status='active' and e.is_active=true) or (p_status='archived' and e.is_active=false))
      and (p_language is null or e.language=p_language)
      and (v_search is null or e.category ilike '%'||v_search||'%' or coalesce(e.question,'') ilike '%'||v_search||'%' or e.content ilike '%'||v_search||'%')), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(to_jsonb(c) order by c.name) from public.knowledge_categories c), '[]'::jsonb),
    'skills', coalesce((select jsonb_agg(to_jsonb(s) order by s.name) from public.knowledge_skills s), '[]'::jsonb),
    'analytics', jsonb_build_object(
      'activeEntries',(select count(*) from public.knowledge_entries where is_active=true),
      'archivedEntries',(select count(*) from public.knowledge_entries where is_active=false),
      'linkedMedia',(select count(*) from public.knowledge_entry_links where media_asset_id is not null),
      'linkedContent',(select count(*) from public.knowledge_entry_links where content_item_id is not null),
      'campaignRelationships',(select count(*) from public.knowledge_entry_links l join public.content_items c on c.id=l.content_item_id where c.campaign_id is not null),
      'attributionEvents',(select count(*) from public.attribution_events a where a.content_item_id in (select content_item_id from public.knowledge_entry_links where content_item_id is not null)),
      'status',case when exists(select 1 from public.knowledge_entry_links) then 'available' else 'incomplete_data' end
    )
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.get_staff_knowledge_management(text,text,text) from public, anon;
grant execute on function public.get_staff_knowledge_management(text,text,text) to authenticated;
