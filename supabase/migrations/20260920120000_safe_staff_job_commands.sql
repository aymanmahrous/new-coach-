-- Safe staff job commands: never delete a job and never retry an ambiguous/published item.
-- Retry delegates to the existing enqueue safety contract and only supersedes the old terminal row.

CREATE OR REPLACE FUNCTION public.retry_staff_publish_job(p_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_job public.background_jobs%rowtype;
  v_content_id uuid;
  v_content public.content_items%rowtype;
  v_platform text;
  v_receipt_status text;
  v_result jsonb;
begin
  if not public.is_active_staff(array['super_admin','admin','content_manager']) then
    return jsonb_build_object('success', false, 'code', 'STAFF_ACCESS_DENIED');
  end if;
  if p_job_id is null then
    return jsonb_build_object('success', false, 'code', 'INVALID_JOB_ID');
  end if;

  select * into v_job from public.background_jobs where id = p_job_id for update;
  if not found then
    return jsonb_build_object('success', false, 'code', 'JOB_NOT_FOUND');
  end if;
  if v_job.job_type <> 'publish_content' then
    return jsonb_build_object('success', false, 'code', 'UNSUPPORTED_JOB_TYPE');
  end if;
  if v_job.status not in ('failed','dead') then
    return jsonb_build_object('success', false, 'code', 'JOB_NOT_TERMINAL', 'status', v_job.status::text);
  end if;

  begin
    v_content_id := nullif(v_job.payload->>'contentItemId', '')::uuid;
  exception when others then
    v_content_id := null;
  end;
  if v_content_id is null then
    return jsonb_build_object('success', false, 'code', 'CONTENT_LINK_MISSING');
  end if;

  select * into v_content from public.content_items where id = v_content_id for update;
  if not found then
    return jsonb_build_object('success', false, 'code', 'CONTENT_ITEM_NOT_FOUND');
  end if;
  if v_content.status not in ('approved','scheduled') then
    return jsonb_build_object('success', false, 'code', 'CONTENT_NOT_APPROVED', 'status', v_content.status::text);
  end if;
  if v_content.published_at is not null then
    return jsonb_build_object('success', false, 'code', 'CONTENT_ALREADY_PUBLISHED');
  end if;
  if v_content.planned_for is null or v_content.planned_for <= now() then
    return jsonb_build_object('success', false, 'code', 'PLANNED_FOR_NOT_FUTURE');
  end if;

  v_platform := lower(coalesce(v_job.payload->>'platform', v_content.platform));
  select pr.status into v_receipt_status
  from public.content_publication_receipts pr
  where pr.content_item_id = v_content_id and lower(pr.platform) = v_platform
  order by pr.updated_at desc nulls last
  limit 1;
  if v_receipt_status in ('published','ambiguous') then
    return jsonb_build_object('success', false, 'code', 'PUBLISH_RECEIPT_REQUIRES_MANUAL_CHECK', 'receiptStatus', v_receipt_status);
  end if;
  if exists (
    select 1 from public.background_jobs bj
    where bj.id <> p_job_id
      and bj.job_type = 'publish_content'
      and bj.payload->>'contentItemId' = v_content_id::text
      and bj.status in ('queued','processing','retrying')
  ) then
    return jsonb_build_object('success', false, 'code', 'ACTIVE_JOB_ALREADY_EXISTS');
  end if;

  v_result := public.enqueue_publish_job(v_content_id);
  if coalesce((v_result->>'success')::boolean, false) then
    update public.background_jobs
    set last_error = 'RETRY_SUPERSEDED_BY_' || coalesce(v_result->>'jobId', 'NEW_JOB'), updated_at = now()
    where id = p_job_id;
    insert into public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, detail)
    values (auth.uid(), 'user', 'background_job_retried', 'background_job', p_job_id,
      jsonb_build_object('contentItemId', v_content_id, 'newJobId', v_result->>'jobId', 'previousStatus', v_job.status::text));
  end if;
  return v_result || jsonb_build_object('previousJobId', p_job_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_staff_background_job(p_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_job public.background_jobs%rowtype;
  v_previous text;
begin
  if not public.is_active_staff(array['super_admin','admin','content_manager']) then
    return jsonb_build_object('success', false, 'code', 'STAFF_ACCESS_DENIED');
  end if;
  select * into v_job from public.background_jobs where id = p_job_id for update;
  if not found then return jsonb_build_object('success', false, 'code', 'JOB_NOT_FOUND'); end if;
  if v_job.status not in ('queued','retrying','failed','dead') then
    return jsonb_build_object('success', false, 'code', 'JOB_NOT_CANCELLABLE', 'status', v_job.status::text);
  end if;
  v_previous := v_job.status::text;
  update public.background_jobs
  set status = 'dead', last_error = 'CANCELLED_BY_OWNER', next_retry_at = null, updated_at = now()
  where id = p_job_id;
  insert into public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, detail)
  values (auth.uid(), 'user', 'background_job_cancelled', 'background_job', p_job_id,
    jsonb_build_object('previousStatus', v_previous, 'jobType', v_job.job_type));
  return jsonb_build_object('success', true, 'code', 'JOB_CANCELLED', 'jobId', p_job_id);
end;
$function$;

GRANT EXECUTE ON FUNCTION public.retry_staff_publish_job(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_staff_background_job(uuid) TO authenticated, service_role;
