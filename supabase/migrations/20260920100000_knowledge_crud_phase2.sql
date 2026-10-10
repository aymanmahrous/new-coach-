-- Phase 2 Knowledge CRUD. Reuses knowledge_entries, media_assets, and content_items.
-- Every mutation is staff-gated, RLS-protected by the foundation migration, and audited.

create or replace function public.get_staff_knowledge_management(
  p_search text default null,
  p_language text default null,
  p_status text default 'active'
)
returns jsonb
language plpgsql
security definer
set search_path = public
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
      'relationships', coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at) from public.knowledge_entry_links l where l.knowledge_entry_id = e.id), '[]'::jsonb)
    ) order by e.updated_at desc) from public.knowledge_entries e
    where (p_status = 'all' or (p_status = 'active' and e.is_active = true) or (p_status = 'archived' and e.is_active = false))
      and (p_language is null or e.language = p_language)
      and (v_search is null or e.category ilike '%' || v_search || '%' or coalesce(e.question,'') ilike '%' || v_search || '%' or e.content ilike '%' || v_search || '%')), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(to_jsonb(c) order by c.name) from public.knowledge_categories c), '[]'::jsonb),
    'skills', coalesce((select jsonb_agg(to_jsonb(s) order by s.name) from public.knowledge_skills s), '[]'::jsonb),
    'analytics', jsonb_build_object(
      'activeEntries', (select count(*) from public.knowledge_entries where is_active = true),
      'archivedEntries', (select count(*) from public.knowledge_entries where is_active = false),
      'linkedMedia', (select count(*) from public.knowledge_entry_links where media_asset_id is not null),
      'linkedContent', (select count(*) from public.knowledge_entry_links where content_item_id is not null),
      'status', case when exists(select 1 from public.knowledge_entry_links) then 'available' else 'incomplete_data' end
    )
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.create_staff_knowledge_entry(
  p_category text, p_question text, p_content text, p_language text default 'ar'
)
returns public.knowledge_entries
language plpgsql security definer set search_path = public
as $$
declare v public.knowledge_entries;
begin
  if public.command_center_staff_role() not in ('super_admin','admin','coach','content_manager') then raise exception 'PERMISSION_DENIED'; end if;
  if p_language not in ('ar','en') then raise exception 'INVALID_LANGUAGE'; end if;
  if nullif(btrim(p_category),'') is null or nullif(btrim(p_content),'') is null then raise exception 'INVALID_KNOWLEDGE_INPUT'; end if;
  insert into public.knowledge_entries(category, question, content, language, is_active, updated_at)
  values (btrim(p_category), nullif(btrim(p_question),''), btrim(p_content), p_language, true, now()) returning * into v;
  insert into public.audit_logs(actor_id, actor_type, action, entity_type, entity_id, detail)
  values (auth.uid(), 'user', 'knowledge_entry_created', 'knowledge_entry', v.id, jsonb_build_object('language',p_language));
  return v;
end;
$$;

create or replace function public.update_staff_knowledge_entry(
  p_id uuid, p_category text, p_question text, p_content text, p_language text
)
returns public.knowledge_entries
language plpgsql security definer set search_path = public
as $$
declare v public.knowledge_entries;
begin
  if public.command_center_staff_role() not in ('super_admin','admin','coach','content_manager') then raise exception 'PERMISSION_DENIED'; end if;
  if p_language not in ('ar','en') or nullif(btrim(p_category),'') is null or nullif(btrim(p_content),'') is null then raise exception 'INVALID_KNOWLEDGE_INPUT'; end if;
  update public.knowledge_entries set category=btrim(p_category), question=nullif(btrim(p_question),''), content=btrim(p_content), language=p_language, updated_at=now() where id=p_id returning * into v;
  if not found then raise exception 'KNOWLEDGE_NOT_FOUND'; end if;
  insert into public.audit_logs(actor_id, actor_type, action, entity_type, entity_id, detail)
  values (auth.uid(), 'user', 'knowledge_entry_updated', 'knowledge_entry', v.id, jsonb_build_object('language',p_language));
  return v;
end;
$$;

create or replace function public.duplicate_staff_knowledge_entry(p_id uuid)
returns public.knowledge_entries
language plpgsql security definer set search_path = public
as $$
declare source_row public.knowledge_entries; v public.knowledge_entries;
begin
  if public.command_center_staff_role() not in ('super_admin','admin','coach','content_manager') then raise exception 'PERMISSION_DENIED'; end if;
  select * into source_row from public.knowledge_entries where id=p_id;
  if not found then raise exception 'KNOWLEDGE_NOT_FOUND'; end if;
  insert into public.knowledge_entries(category, question, content, language, is_active, updated_at)
  values (source_row.category || ' (copy)', source_row.question, source_row.content, source_row.language, true, now()) returning * into v;
  insert into public.audit_logs(actor_id, actor_type, action, entity_type, entity_id, detail)
  values (auth.uid(), 'user', 'knowledge_entry_duplicated', 'knowledge_entry', v.id, jsonb_build_object('sourceId',p_id));
  return v;
end;
$$;

create or replace function public.set_staff_knowledge_entry_archived(p_id uuid, p_archived boolean)
returns public.knowledge_entries
language plpgsql security definer set search_path = public
as $$
declare v public.knowledge_entries;
begin
  if public.command_center_staff_role() not in ('super_admin','admin','coach','content_manager') then raise exception 'PERMISSION_DENIED'; end if;
  update public.knowledge_entries set is_active=not p_archived, updated_at=now() where id=p_id returning * into v;
  if not found then raise exception 'KNOWLEDGE_NOT_FOUND'; end if;
  insert into public.audit_logs(actor_id, actor_type, action, entity_type, entity_id, detail)
  values (auth.uid(), 'user', case when p_archived then 'knowledge_entry_archived' else 'knowledge_entry_restored' end, 'knowledge_entry', v.id, jsonb_build_object('archived',p_archived));
  return v;
end;
$$;

create or replace function public.create_staff_knowledge_category(p_name text, p_slug text, p_description text default null)
returns public.knowledge_categories
language plpgsql security definer set search_path = public
as $$
declare v public.knowledge_categories;
begin
  if public.command_center_staff_role() not in ('super_admin','admin','content_manager') then raise exception 'PERMISSION_DENIED'; end if;
  insert into public.knowledge_categories(name,slug,description,created_by) values (btrim(p_name), lower(btrim(p_slug)), nullif(btrim(p_description),''), auth.uid()) returning * into v;
  insert into public.audit_logs(actor_id,actor_type,action,entity_type,entity_id,detail) values(auth.uid(),'user','knowledge_category_created','knowledge_category',v.id,'{}');
  return v;
end;
$$;

create or replace function public.update_staff_knowledge_category(p_id uuid, p_name text, p_slug text, p_description text default null)
returns public.knowledge_categories
language plpgsql security definer set search_path = public
as $$
declare v public.knowledge_categories;
begin
  if public.command_center_staff_role() not in ('super_admin','admin','content_manager') then raise exception 'PERMISSION_DENIED'; end if;
  update public.knowledge_categories set name=btrim(p_name),slug=lower(btrim(p_slug)),description=nullif(btrim(p_description),''),updated_at=now() where id=p_id returning * into v;
  if not found then raise exception 'CATEGORY_NOT_FOUND'; end if;
  insert into public.audit_logs(actor_id,actor_type,action,entity_type,entity_id,detail) values(auth.uid(),'user','knowledge_category_updated','knowledge_category',v.id,'{}');
  return v;
end;
$$;

create or replace function public.create_staff_knowledge_skill(p_name text, p_category text default null, p_level text default null, p_description text default null)
returns public.knowledge_skills
language plpgsql security definer set search_path = public
as $$
declare v public.knowledge_skills;
begin
  if public.command_center_staff_role() not in ('super_admin','admin','coach','content_manager') then raise exception 'PERMISSION_DENIED'; end if;
  insert into public.knowledge_skills(name,category,level,description,created_by) values (btrim(p_name),nullif(btrim(p_category),''),nullif(btrim(p_level),''),nullif(btrim(p_description),''),auth.uid()) returning * into v;
  insert into public.audit_logs(actor_id,actor_type,action,entity_type,entity_id,detail) values(auth.uid(),'user','knowledge_skill_created','knowledge_skill',v.id,'{}');
  return v;
end;
$$;

create or replace function public.update_staff_knowledge_skill(p_id uuid, p_name text, p_category text default null, p_level text default null, p_description text default null)
returns public.knowledge_skills
language plpgsql security definer set search_path = public
as $$
declare v public.knowledge_skills;
begin
  if public.command_center_staff_role() not in ('super_admin','admin','coach','content_manager') then raise exception 'PERMISSION_DENIED'; end if;
  update public.knowledge_skills set name=btrim(p_name),category=nullif(btrim(p_category),''),level=nullif(btrim(p_level),''),description=nullif(btrim(p_description),''),updated_at=now() where id=p_id returning * into v;
  if not found then raise exception 'SKILL_NOT_FOUND'; end if;
  insert into public.audit_logs(actor_id,actor_type,action,entity_type,entity_id,detail) values(auth.uid(),'user','knowledge_skill_updated','knowledge_skill',v.id,'{}');
  return v;
end;
$$;

create or replace function public.link_staff_knowledge_entry(p_entry_id uuid, p_category_id uuid default null, p_skill_id uuid default null, p_media_asset_id uuid default null, p_content_item_id uuid default null)
returns public.knowledge_entry_links
language plpgsql security definer set search_path = public
as $$
declare v public.knowledge_entry_links;
begin
  if public.command_center_staff_role() not in ('super_admin','admin','coach','content_manager') then raise exception 'PERMISSION_DENIED'; end if;
  if p_category_id is null and p_skill_id is null and p_media_asset_id is null and p_content_item_id is null then raise exception 'RELATIONSHIP_TARGET_REQUIRED'; end if;
  insert into public.knowledge_entry_links(knowledge_entry_id,category_id,skill_id,media_asset_id,content_item_id,created_by) values(p_entry_id,p_category_id,p_skill_id,p_media_asset_id,p_content_item_id,auth.uid()) returning * into v;
  insert into public.audit_logs(actor_id,actor_type,action,entity_type,entity_id,detail) values(auth.uid(),'user','knowledge_relationship_created','knowledge_entry_link',v.id,jsonb_build_object('knowledgeEntryId',p_entry_id));
  return v;
end;
$$;

create or replace function public.unlink_staff_knowledge_entry(p_link_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v public.knowledge_entry_links;
begin
  if public.command_center_staff_role() not in ('super_admin','admin','coach','content_manager') then raise exception 'PERMISSION_DENIED'; end if;
  delete from public.knowledge_entry_links where id=p_link_id returning * into v;
  if not found then raise exception 'RELATIONSHIP_NOT_FOUND'; end if;
  insert into public.audit_logs(actor_id,actor_type,action,entity_type,entity_id,detail) values(auth.uid(),'user','knowledge_relationship_removed','knowledge_entry_link',v.id,jsonb_build_object('knowledgeEntryId',v.knowledge_entry_id));
  return true;
end;
$$;

-- Generation remains an explicit draft contract. It refuses to fabricate content when the
-- existing AI/content-factory integration is not configured.
create or replace function public.generate_staff_knowledge_content_draft(p_entry_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if public.command_center_staff_role() not in ('super_admin','admin','content_manager') then raise exception 'PERMISSION_DENIED'; end if;
  if not exists(select 1 from public.knowledge_entries where id=p_entry_id and is_active=true) then raise exception 'KNOWLEDGE_NOT_FOUND'; end if;
  raise exception 'SETUP_REQUIRED: existing content generation provider is not configured';
end;
$$;

revoke all on function public.get_staff_knowledge_management(text,text,text) from public;
revoke all on function public.update_staff_knowledge_entry(uuid,text,text,text,text) from public;
revoke all on function public.duplicate_staff_knowledge_entry(uuid) from public;
revoke all on function public.set_staff_knowledge_entry_archived(uuid,boolean) from public;
revoke all on function public.create_staff_knowledge_category(text,text,text) from public;
revoke all on function public.update_staff_knowledge_category(uuid,text,text,text) from public;
revoke all on function public.create_staff_knowledge_skill(text,text,text,text) from public;
revoke all on function public.update_staff_knowledge_skill(uuid,text,text,text,text) from public;
revoke all on function public.link_staff_knowledge_entry(uuid,uuid,uuid,uuid,uuid) from public;
revoke all on function public.unlink_staff_knowledge_entry(uuid) from public;
revoke all on function public.generate_staff_knowledge_content_draft(uuid) from public;
grant execute on function public.get_staff_knowledge_management(text,text,text) to authenticated;
grant execute on function public.update_staff_knowledge_entry(uuid,text,text,text,text) to authenticated;
grant execute on function public.duplicate_staff_knowledge_entry(uuid) to authenticated;
grant execute on function public.set_staff_knowledge_entry_archived(uuid,boolean) to authenticated;
grant execute on function public.create_staff_knowledge_category(text,text,text) to authenticated;
grant execute on function public.update_staff_knowledge_category(uuid,text,text,text) to authenticated;
grant execute on function public.create_staff_knowledge_skill(text,text,text,text) to authenticated;
grant execute on function public.update_staff_knowledge_skill(uuid,text,text,text,text) to authenticated;
grant execute on function public.link_staff_knowledge_entry(uuid,uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.unlink_staff_knowledge_entry(uuid) to authenticated;
grant execute on function public.generate_staff_knowledge_content_draft(uuid) to authenticated;
