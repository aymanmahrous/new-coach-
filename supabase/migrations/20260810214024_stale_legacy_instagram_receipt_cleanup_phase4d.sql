-- Phase 4D: finalize single stale legacy Instagram receipt (old account ID era).
-- Does not modify the nine live-ID Instagram authorization RPC gates.

CREATE OR REPLACE FUNCTION public.confirm_stale_legacy_instagram_receipt_not_sent(
  p_receipt_id uuid,
  p_evidence_reference text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stale_receipt_id constant uuid := '4af3b798-b323-4782-ba6b-6b793e9cfed6';
  v_stale_job_id constant uuid := 'eacecf64-357d-4fa7-8b93-399dec0605db';
  v_stale_auth_id constant uuid := 'df4f8446-606e-4fd4-827b-01c90f122df7';
  v_stale_content_item_id constant uuid := '6d88c6fa-2c52-4e44-92c6-d97b0a52b3dc';
  v_legacy_account_id constant text := '17841439747493221';
  v_auth public.owner_publish_authorizations%rowtype;
  v_job public.background_jobs%rowtype;
  v_content public.content_items%rowtype;
  v_receipt public.content_publication_receipts%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if p_receipt_id is distinct from v_stale_receipt_id then
    return jsonb_build_object('success', false, 'code', 'RECEIPT_NOT_ELIGIBLE');
  end if;

  if nullif(btrim(coalesce(p_evidence_reference, '')), '') is null
     or p_evidence_reference ~* 'token|secret|password|bearer|api[_-]?key' then
    raise exception 'INVALID_EVIDENCE_REFERENCE' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_stale_content_item_id::text, 0));

  select *
  into v_receipt
  from public.content_publication_receipts
  where id = p_receipt_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'code', 'RECEIPT_NOT_FOUND');
  end if;

  if v_receipt.content_item_id <> v_stale_content_item_id
     or v_receipt.platform <> 'instagram'
     or v_receipt.authorization_id is distinct from v_stale_auth_id
     or v_receipt.publish_job_id is distinct from v_stale_job_id then
    return jsonb_build_object('success', false, 'code', 'RECEIPT_LINKAGE_MISMATCH');
  end if;

  select *
  into v_auth
  from public.owner_publish_authorizations
  where id = v_stale_auth_id
  for update;

  if not found
     or v_auth.content_item_id <> v_stale_content_item_id
     or v_auth.publish_job_id <> v_stale_job_id
     or v_auth.platform <> 'instagram'
     or v_auth.page_id <> v_legacy_account_id then
    return jsonb_build_object('success', false, 'code', 'AUTHORIZATION_MISMATCH');
  end if;

  select *
  into v_job
  from public.background_jobs
  where id = v_stale_job_id
    and job_type = 'publish_content'
  for update;

  if not found
     or v_job.payload->>'contentItemId' <> v_stale_content_item_id::text
     or v_job.payload->>'accountId' <> v_legacy_account_id then
    return jsonb_build_object('success', false, 'code', 'JOB_MISMATCH');
  end if;

  if v_job.status <> 'dead' then
    return jsonb_build_object('success', false, 'code', 'INVALID_JOB_STATE', 'status', v_job.status::text);
  end if;

  select *
  into v_content
  from public.content_items
  where id = v_stale_content_item_id
  for update;

  if not found or v_content.platform <> 'instagram' then
    return jsonb_build_object('success', false, 'code', 'CONTENT_MISMATCH');
  end if;

  if v_content.status = 'published'
     or v_content.provider_external_id is not null
     or v_content.published_at is not null then
    return jsonb_build_object('success', false, 'code', 'CONTENT_ALREADY_HAS_PUBLICATION_EVIDENCE');
  end if;

  if v_receipt.external_post_id is not null or v_receipt.external_container_id is not null then
    return jsonb_build_object('success', false, 'code', 'RECEIPT_HAS_PROVIDER_EVIDENCE');
  end if;

  if v_receipt.status = 'failed'
     and v_receipt.last_error like 'MANUAL_CONFIRMED_NOT_PUBLISHED:%' then
    return jsonb_build_object(
      'success', true,
      'code', 'ALREADY_CONFIRMED_NOT_PUBLISHED',
      'receiptId', v_receipt.id,
      'status', v_receipt.status
    );
  end if;

  if v_receipt.status not in ('ambiguous', 'failed') then
    return jsonb_build_object('success', false, 'code', 'RECEIPT_STATE_NOT_RECOVERABLE', 'status', v_receipt.status);
  end if;

  update public.content_publication_receipts
  set status = 'failed',
      updated_at = now(),
      last_error = left('MANUAL_CONFIRMED_NOT_PUBLISHED: ' || btrim(p_evidence_reference), 1000)
  where id = v_receipt.id;

  insert into public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, detail)
  values (
    null,
    'system',
    'stale_legacy_instagram_receipt_confirmed_not_sent',
    'content_item',
    v_stale_content_item_id,
    jsonb_build_object(
      'receiptId', v_receipt.id,
      'jobId', v_stale_job_id,
      'authorizationId', v_stale_auth_id,
      'legacyAccountId', v_legacy_account_id,
      'evidenceReference', btrim(p_evidence_reference)
    )
  );

  return jsonb_build_object(
    'success', true,
    'code', 'CONFIRMED_NOT_PUBLISHED',
    'receiptId', v_receipt.id,
    'status', 'failed'
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.confirm_stale_legacy_instagram_receipt_not_sent(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_stale_legacy_instagram_receipt_not_sent(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.confirm_stale_legacy_instagram_receipt_not_sent(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_stale_legacy_instagram_receipt_not_sent(uuid, text) TO service_role;
