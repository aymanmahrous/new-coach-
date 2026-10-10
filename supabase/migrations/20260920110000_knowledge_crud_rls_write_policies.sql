-- Phase 2 RLS hardening: direct writes remain staff-only even though the UI uses RPC boundaries.
do $$
declare t text;
begin
  foreach t in array array['knowledge_categories','knowledge_skills','knowledge_entry_links'] loop
    execute format('drop policy if exists command_center_staff_write on public.%I', t);
    execute format('create policy command_center_staff_write on public.%I for all to authenticated using (public.command_center_staff_role() in (''super_admin'',''admin'',''coach'',''content_manager'')) with check (public.command_center_staff_role() in (''super_admin'',''admin'',''coach'',''content_manager''))', t);
  end loop;
end $$;
