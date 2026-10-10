-- Control Tower: exclude archived terminal dead jobs from failed_jobs alert count.
-- Keeps failed status and non-terminal dead jobs visible; hides known cleanup outcomes.

CREATE OR REPLACE FUNCTION public.get_staff_control_tower_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_leads bigint;
  v_customers bigint;
  v_new_leads bigint;
  v_hot_leads bigint;
  v_human_replies bigint;
  v_bookings bigint;
  v_pending_bookings bigint;
  v_confirmed_bookings bigint;
  v_content bigint;
  v_review bigint;
  v_scheduled bigint;
  v_published bigint;
  v_failed_content bigint;
  v_hot_radar bigint;
  v_failed_jobs bigint;
  v_active_jobs bigint;
  v_invoices bigint;
  v_invoice_amount numeric;
  v_paid_invoice_amount numeric;
  v_orders bigint;
  v_order_amount numeric;
  v_alerts jsonb;
begin
  if not public.is_active_staff(array['super_admin','admin','reception','coach','content_manager']) then
    raise exception 'STAFF_ACCESS_DENIED' using errcode = '42501';
  end if;

  select count(*) into v_leads from public.leads;
  select count(*) into v_customers from public.leads where stage = 'customer';
  select count(*) into v_new_leads from public.leads where stage in ('new','contacted');
  select count(*) into v_hot_leads from public.leads where score >= 80;
  select count(*) into v_human_replies from public.conversations where mode in ('human_takeover','human_required');

  select count(*) into v_bookings from public.booking_requests;
  select count(*) into v_pending_bookings from public.booking_requests where status in ('pending','contacted');
  select count(*) into v_confirmed_bookings from public.booking_requests where status = 'confirmed';

  select count(*) into v_content from public.content_items;
  select count(*) into v_review from public.content_items where status in ('draft','generated','needs_review');
  select count(*) into v_scheduled from public.content_items where status = 'scheduled';
  select count(*) into v_published from public.content_items where status = 'published';
  select count(*) into v_failed_content from public.content_items where status = 'failed';

  select count(*) into v_hot_radar from public.radar_opportunities where priority = 'HOT' and status in ('NEW','REVIEWED');
  select count(*) into v_failed_jobs
  from public.background_jobs bj
  where bj.status = 'failed'
     or (
       bj.status = 'dead'
       and not (
         coalesce(bj.last_error, '') like 'CANCELLED_STALE_DUPLICATE%'
         or coalesce(bj.last_error, '') like 'CONTENT_UNSCHEDULED%'
         or coalesce(bj.last_error, '') like 'CONTENT_RESCHEDULED%'
         or coalesce(bj.last_error, '') like 'WHATSAPP_AUTOMATION_PAUSED%'
         or coalesce(bj.last_error, '') like 'OWNER_REJECTED%'
         or coalesce(bj.last_error, '') like 'OWNER_REVOKED%'
         or coalesce(bj.last_error, '') like 'PUBLISHING_PROVIDER_NOT_READY%'
         or coalesce(bj.last_error, '') like 'STALE_ORPHAN_QUEUE_ARCHIVED%'
         or coalesce(bj.last_error, '') like 'MEDIA_ALREADY_GENERATED%'
         or coalesce(bj.last_error, '') like 'CONTENT_RETURNED_TO_REVIEW%'
         or coalesce(bj.last_error, '') like 'AUTHORIZATION_EXPIRED%'
       )
     );
  select count(*) into v_active_jobs from public.background_jobs where status in ('queued','processing','retrying');

  select count(*), coalesce(sum(amount),0) into v_invoices, v_invoice_amount from public.invoices;
  select coalesce(sum(amount),0) into v_paid_invoice_amount from public.invoices where lower(coalesce(status::text,'')) in ('paid','succeeded','completed');
  select count(*) into v_orders from public.orders;
  v_order_amount := 0;

  select coalesce(jsonb_agg(a order by a.priority desc, a.code), '[]'::jsonb)
  into v_alerts
  from (
    select 'human_required'::text as code, 'high'::text as priority, v_human_replies as count,
      'Conversations require human attention'::text as message
    where v_human_replies > 0
    union all
    select 'pending_bookings','high',v_pending_bookings,'Bookings are waiting for action' where v_pending_bookings > 0
    union all
    select 'hot_radar','medium',v_hot_radar,'Hot opportunities need review' where v_hot_radar > 0
    union all
    select 'content_review','medium',v_review,'Content is waiting for review' where v_review > 0
    union all
    select 'failed_jobs','critical',v_failed_jobs,'Background jobs have failed or are dead' where v_failed_jobs > 0
    union all
    select 'failed_content','critical',v_failed_content,'Content items have failed' where v_failed_content > 0
    union all
    select 'new_leads','low',v_new_leads,'New or contacted leads need follow-up' where v_new_leads > 0
  ) a;

  return jsonb_build_object(
    'generatedAt', now(),
    'leads', jsonb_build_object('total',v_leads,'customers',v_customers,'new',v_new_leads,'hot',v_hot_leads),
    'conversations', jsonb_build_object('humanRequired',v_human_replies),
    'bookings', jsonb_build_object('total',v_bookings,'pending',v_pending_bookings,'confirmed',v_confirmed_bookings),
    'content', jsonb_build_object('total',v_content,'review',v_review,'scheduled',v_scheduled,'published',v_published,'failed',v_failed_content),
    'radar', jsonb_build_object('hot',v_hot_radar),
    'automation', jsonb_build_object('failed',v_failed_jobs,'active',v_active_jobs),
    'revenue', jsonb_build_object('invoiceCount',v_invoices,'invoiceTotal',v_invoice_amount,'paidInvoiceTotal',v_paid_invoice_amount,'orderCount',v_orders,'orderTotal',v_order_amount),
    'alerts', v_alerts,
    'attentionScore', (v_new_leads + v_human_replies + v_pending_bookings + v_review + v_hot_radar + v_failed_jobs)
  );
end;
$function$;
