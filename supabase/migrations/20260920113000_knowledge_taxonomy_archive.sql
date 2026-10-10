create or replace function public.set_staff_knowledge_category_archived(p_id uuid, p_archived boolean)
returns public.knowledge_categories
language plpgsql security definer set search_path = public
as $$
declare v public.knowledge_categories;
begin
  if public.command_center_staff_role() not in ('super_admin','admin','content_manager') then raise exception 'PERMISSION_DENIED'; end if;
  update public.knowledge_categories set archived_at = case when p_archived then now() else null end, updated_at = now() where id = p_id returning * into v;
  if not found then raise exception 'CATEGORY_NOT_FOUND'; end if;
  insert into public.audit_logs(actor_id,actor_type,action,entity_type,entity_id,detail) values(auth.uid(),'user',case when p_archived then 'knowledge_category_archived' else 'knowledge_category_restored' end,'knowledge_category',v.id,jsonb_build_object('archived',p_archived));
  return v;
end;
$$;

create or replace function public.set_staff_knowledge_skill_archived(p_id uuid, p_archived boolean)
returns public.knowledge_skills
language plpgsql security definer set search_path = public
as $$
declare v public.knowledge_skills;
begin
  if public.command_center_staff_role() not in ('super_admin','admin','coach','content_manager') then raise exception 'PERMISSION_DENIED'; end if;
  update public.knowledge_skills set archived_at = case when p_archived then now() else null end, updated_at = now() where id = p_id returning * into v;
  if not found then raise exception 'SKILL_NOT_FOUND'; end if;
  insert into public.audit_logs(actor_id,actor_type,action,entity_type,entity_id,detail) values(auth.uid(),'user',case when p_archived then 'knowledge_skill_archived' else 'knowledge_skill_restored' end,'knowledge_skill',v.id,jsonb_build_object('archived',p_archived));
  return v;
end;
$$;

revoke all on function public.set_staff_knowledge_category_archived(uuid,boolean) from public;
revoke all on function public.set_staff_knowledge_skill_archived(uuid,boolean) from public;
grant execute on function public.set_staff_knowledge_category_archived(uuid,boolean) to authenticated;
grant execute on function public.set_staff_knowledge_skill_archived(uuid,boolean) to authenticated;
