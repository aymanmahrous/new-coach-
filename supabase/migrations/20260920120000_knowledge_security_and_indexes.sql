-- Phase 2 security/performance hardening.

do $$
declare t text;
begin
  foreach t in array array['knowledge_categories','knowledge_skills','knowledge_entry_links'] loop
    execute format('drop policy if exists command_center_staff_write on public.%I', t);
    execute format('drop policy if exists command_center_staff_insert on public.%I', t);
    execute format('drop policy if exists command_center_staff_update on public.%I', t);
    execute format('drop policy if exists command_center_staff_delete on public.%I', t);
    execute format('create policy command_center_staff_insert on public.%I for insert to authenticated with check (public.command_center_staff_role() in (''super_admin'',''admin'',''coach'',''content_manager''))', t);
    execute format('create policy command_center_staff_update on public.%I for update to authenticated using (public.command_center_staff_role() in (''super_admin'',''admin'',''coach'',''content_manager'')) with check (public.command_center_staff_role() in (''super_admin'',''admin'',''coach'',''content_manager''))', t);
    execute format('create policy command_center_staff_delete on public.%I for delete to authenticated using (public.command_center_staff_role() in (''super_admin'',''admin'',''coach'',''content_manager''))', t);
  end loop;
end $$;

revoke all on function public.get_staff_knowledge_management(text,text,text) from public, anon;
revoke all on function public.create_staff_knowledge_entry(text,text,text,text) from public, anon;
revoke all on function public.update_staff_knowledge_entry(uuid,text,text,text,text) from public, anon;
revoke all on function public.duplicate_staff_knowledge_entry(uuid) from public, anon;
revoke all on function public.set_staff_knowledge_entry_archived(uuid,boolean) from public, anon;
revoke all on function public.create_staff_knowledge_category(text,text,text) from public, anon;
revoke all on function public.update_staff_knowledge_category(uuid,text,text,text) from public, anon;
revoke all on function public.set_staff_knowledge_category_archived(uuid,boolean) from public, anon;
revoke all on function public.create_staff_knowledge_skill(text,text,text,text) from public, anon;
revoke all on function public.update_staff_knowledge_skill(uuid,text,text,text,text) from public, anon;
revoke all on function public.set_staff_knowledge_skill_archived(uuid,boolean) from public, anon;
revoke all on function public.link_staff_knowledge_entry(uuid,uuid,uuid,uuid,uuid) from public, anon;
revoke all on function public.unlink_staff_knowledge_entry(uuid) from public, anon;
revoke all on function public.generate_staff_knowledge_content_draft(uuid) from public, anon;

grant execute on function public.get_staff_knowledge_management(text,text,text) to authenticated;
grant execute on function public.create_staff_knowledge_entry(text,text,text,text) to authenticated;
grant execute on function public.update_staff_knowledge_entry(uuid,text,text,text,text) to authenticated;
grant execute on function public.duplicate_staff_knowledge_entry(uuid) to authenticated;
grant execute on function public.set_staff_knowledge_entry_archived(uuid,boolean) to authenticated;
grant execute on function public.create_staff_knowledge_category(text,text,text) to authenticated;
grant execute on function public.update_staff_knowledge_category(uuid,text,text,text) to authenticated;
grant execute on function public.set_staff_knowledge_category_archived(uuid,boolean) to authenticated;
grant execute on function public.create_staff_knowledge_skill(text,text,text,text) to authenticated;
grant execute on function public.update_staff_knowledge_skill(uuid,text,text,text,text) to authenticated;
grant execute on function public.set_staff_knowledge_skill_archived(uuid,boolean) to authenticated;
grant execute on function public.link_staff_knowledge_entry(uuid,uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.unlink_staff_knowledge_entry(uuid) to authenticated;
grant execute on function public.generate_staff_knowledge_content_draft(uuid) to authenticated;

create index if not exists knowledge_categories_created_by_idx on public.knowledge_categories(created_by);
create index if not exists knowledge_skills_created_by_idx on public.knowledge_skills(created_by);
create index if not exists knowledge_entry_links_category_id_idx on public.knowledge_entry_links(category_id);
create index if not exists knowledge_entry_links_skill_id_idx on public.knowledge_entry_links(skill_id);
create index if not exists knowledge_entry_links_media_asset_id_idx on public.knowledge_entry_links(media_asset_id);
create index if not exists knowledge_entry_links_content_item_id_idx on public.knowledge_entry_links(content_item_id);
create index if not exists knowledge_entry_links_created_by_idx on public.knowledge_entry_links(created_by);
