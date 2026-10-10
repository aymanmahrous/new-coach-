-- WhatsApp human reply + concierge customer memory (additive only).
-- Isolated to WhatsApp / AI Concierge. No publishing, n8n, or unrelated table changes.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS customer_memory jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS question_ledger jsonb NOT NULL DEFAULT '{"questions_asked":[],"questions_answered":[],"known_facts":{}}'::jsonb;

COMMENT ON COLUMN public.leads.customer_memory IS
  'Additive customer facts extracted deterministically from conversation (no guessed values).';

COMMENT ON COLUMN public.leads.question_ledger IS
  'Tracks questions_asked, questions_answered, and known_facts for anti-repetition.';

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS handoff_reason text NULL,
  ADD COLUMN IF NOT EXISTS needs_attention boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.conversations.handoff_reason IS
  'Why the conversation was routed to human attention (AI confusion, customer request, etc.).';

COMMENT ON COLUMN public.conversations.needs_attention IS
  'Immediate staff attention indicator for inbox polling.';

CREATE TABLE IF NOT EXISTS public.staff_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_code text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  lead_id uuid NULL REFERENCES public.leads(id) ON DELETE SET NULL,
  conversation_id uuid NULL REFERENCES public.conversations(id) ON DELETE SET NULL,
  reason text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_alerts_open_dedup_idx
  ON public.staff_alerts (alert_code, entity_id)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS staff_alerts_open_priority_idx
  ON public.staff_alerts (priority, created_at DESC)
  WHERE resolved_at IS NULL;

CREATE OR REPLACE FUNCTION public.upsert_staff_alert(
  p_alert_code text,
  p_priority text,
  p_entity_type text,
  p_entity_id uuid,
  p_lead_id uuid,
  p_conversation_id uuid,
  p_reason text,
  p_detail jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_alert_id uuid;
BEGIN
  SELECT id INTO v_alert_id
  FROM public.staff_alerts
  WHERE alert_code = p_alert_code
    AND entity_id = p_entity_id
    AND resolved_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.staff_alerts
    SET
      priority = p_priority,
      reason = p_reason,
      detail = coalesce(p_detail, '{}'::jsonb),
      lead_id = coalesce(p_lead_id, lead_id),
      conversation_id = coalesce(p_conversation_id, conversation_id),
      updated_at = now()
    WHERE id = v_alert_id;
    RETURN v_alert_id;
  END IF;

  INSERT INTO public.staff_alerts (
    alert_code, priority, entity_type, entity_id, lead_id, conversation_id, reason, detail
  ) VALUES (
    p_alert_code, p_priority, p_entity_type, p_entity_id, p_lead_id, p_conversation_id, p_reason, coalesce(p_detail, '{}'::jsonb)
  )
  RETURNING id INTO v_alert_id;

  RETURN v_alert_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_staff_alerts_for_conversation(
  p_conversation_id uuid,
  p_alert_codes text[] DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.staff_alerts
  SET resolved_at = now(), updated_at = now()
  WHERE conversation_id = p_conversation_id
    AND resolved_at IS NULL
    AND (p_alert_codes IS NULL OR alert_code = ANY (p_alert_codes));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.concierge_extract_facts(p_body text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v_facts jsonb := '{}'::jsonb;
  v_age text;
BEGIN
  IF coalesce(btrim(p_body), '') = '' THEN
    RETURN v_facts;
  END IF;

  v_age := substring(p_body from '(?i)(?:age|عمر)(?:\s+is|\s*[:=])?\s*([0-9]{1,2})');
  IF v_age IS NULL THEN
    v_age := substring(p_body from '(?i)(?:my\s+)?(?:son|daughter|child|kid|boy|girl|ابن(?:ي)?|ابنت(?:ي)?|طفل(?:ي)?|ولد(?:ي)?|بنت(?:ي)?)?\s*(?:is\s+|عمر(?:ه|ها)?\s+|عنده?\s+|عندها\s+)?([0-9]{1,2})\s*(?:years?\s*old|year(?:s)?|yo|سنة|سنوات|سنين|سن)');
  END IF;
  IF v_age IS NOT NULL AND v_age::integer BETWEEN 2 AND 18 THEN
    v_facts := v_facts || jsonb_build_object('child_age', v_age);
  END IF;

  IF p_body ~* '(dubai|abu dhabi|sharjah|ajman|al ain|jumeirah|marina|mirdif|deira|دبي|أبو\s*ظبي|ابو\s*ظبي|الشارقة|عجمان|العين|جميرا|مارينا|مردف|ديرة)' THEN
    v_facts := v_facts || jsonb_build_object('location', substring(p_body from '(?i)(dubai|abu dhabi|sharjah|ajman|al ain|jumeirah|marina|mirdif|deira|دبي|أبو\s*ظبي|ابو\s*ظبي|الشارقة|عجمان|العين|جميرا|مارينا|مردف|ديرة)'));
  END IF;

  IF p_body ~* '(beginner|intermediate|advanced|never swam|first time|can''t swim|cannot swim|مبتدئ|متوسط|متقدم|ما سبق|لم يسبح|أول مرة)' THEN
    v_facts := v_facts || jsonb_build_object('swimming_level', substring(p_body from '(?i)(beginner|intermediate|advanced|never swam|first time|can''t swim|cannot swim|مبتدئ|متوسط|متقدم|ما سبق|لم يسبح|أول مرة)'));
  END IF;

  IF p_body ~* '(fear|afraid|scared|خوف|خايف|خائف)' THEN
    v_facts := v_facts || jsonb_build_object('fear_of_water', 'true');
  ELSIF p_body ~* '(comfortable|fine|no fear|not afraid|مرتاح|ما في خوف|لا خوف|مو خايف)' THEN
    v_facts := v_facts || jsonb_build_object('fear_of_water', 'false');
  END IF;

  IF p_body ~* '(private|individual|one[\s-]?on[\s-]?one|خاص|فردي|حصة خاصة)' THEN
    v_facts := v_facts || jsonb_build_object('lesson_type', 'private');
  ELSIF p_body ~* '(sibling|brother|sister|brothers|sisters|إخوة|أخوات|أشقاء|أخ|أخت)' THEN
    v_facts := v_facts || jsonb_build_object('lesson_type', 'siblings');
  ELSIF p_body ~* '(group|family|up to 5|مجموعة|عائلة|جماعي)' THEN
    v_facts := v_facts || jsonb_build_object('lesson_type', 'group');
  END IF;

  IF p_body ~ '[ء-ي]' THEN
    v_facts := v_facts || jsonb_build_object('preferred_language', 'ar');
  ELSIF p_body ~* '[a-z]' THEN
    v_facts := v_facts || jsonb_build_object('preferred_language', 'en');
  END IF;

  RETURN v_facts;
END;
$function$;

CREATE OR REPLACE FUNCTION public.concierge_merge_memory(
  p_existing_memory jsonb,
  p_existing_ledger jsonb,
  p_extracted jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v_memory jsonb := coalesce(p_existing_memory, '{}'::jsonb);
  v_ledger jsonb := coalesce(p_existing_ledger, '{"questions_asked":[],"questions_answered":[],"known_facts":{}}'::jsonb);
  v_known jsonb := coalesce(v_ledger->'known_facts', '{}'::jsonb);
  v_answered jsonb := coalesce(v_ledger->'questions_answered', '[]'::jsonb);
  v_key text;
  v_value text;
  v_conflicts jsonb := '[]'::jsonb;
BEGIN
  FOR v_key, v_value IN SELECT * FROM jsonb_each_text(coalesce(p_extracted, '{}'::jsonb))
  LOOP
    IF v_known ? v_key AND v_known->>v_key IS DISTINCT FROM v_value THEN
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('key', v_key, 'existing', v_known->>v_key, 'incoming', v_value));
      CONTINUE;
    END IF;
    v_known := v_known || jsonb_build_object(v_key, v_value);
    v_memory := v_memory || jsonb_build_object(v_key, v_value);
    IF NOT (v_answered @> to_jsonb(v_key)) THEN
      v_answered := v_answered || to_jsonb(v_key);
    END IF;
  END LOOP;

  v_ledger := jsonb_build_object(
    'questions_asked', coalesce(v_ledger->'questions_asked', '[]'::jsonb),
    'questions_answered', v_answered,
    'known_facts', v_known
  );

  RETURN jsonb_build_object('memory', v_memory, 'ledger', v_ledger, 'conflicts', v_conflicts);
END;
$function$;

CREATE OR REPLACE FUNCTION public.concierge_fact_known(p_key text, p_ledger jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(p_ledger->'known_facts'->>p_key, '') <> ''
     OR coalesce(p_ledger->'questions_answered', '[]'::jsonb) @> to_jsonb(p_key);
$$;

CREATE OR REPLACE FUNCTION public.route_conversation_to_human(
  p_conversation_id uuid,
  p_lead_id uuid,
  p_reason text,
  p_alert_code text DEFAULT 'human_required',
  p_priority text DEFAULT 'high',
  p_detail jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.conversations
  SET mode = 'human_required', handoff_reason = p_reason, needs_attention = true, updated_at = now()
  WHERE id = p_conversation_id;

  UPDATE public.leads
  SET human_required = true, updated_at = now()
  WHERE id = p_lead_id;

  PERFORM public.upsert_staff_alert(
    p_alert_code,
    p_priority,
    'conversation',
    p_conversation_id,
    p_lead_id,
    p_conversation_id,
    p_reason,
    p_detail
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_staff_inbox()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_active_staff(ARRAY['super_admin','admin','reception','coach','content_manager']) THEN
    RAISE EXCEPTION 'STAFF_ACCESS_DENIED' USING errcode = '42501';
  END IF;

  RETURN coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'leadId', c.lead_id,
          'leadName', coalesce(l.name, l.full_name, 'Unknown'),
          'channel', c.channel::text,
          'mode', c.mode::text,
          'unread', coalesce(c.unread_count, 0),
          'lastMessage', coalesce(last_msg.body, ''),
          'updatedAt', c.updated_at,
          'leadScore', coalesce(l.score, 0),
          'intent', coalesce(l.intent, ''),
          'humanRequired', coalesce(l.human_required, false),
          'needsAttention', coalesce(c.needs_attention, false) OR c.mode::text IN ('human_required', 'human_takeover') OR coalesce(l.human_required, false),
          'handoffReason', c.handoff_reason
        )
        ORDER BY coalesce(c.needs_attention, false) DESC, coalesce(c.unread_count, 0) DESC, c.updated_at DESC
      )
      FROM public.conversations c
      JOIN public.leads l ON l.id = c.lead_id
      LEFT JOIN LATERAL (
        SELECT m.body
        FROM public.messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 1
      ) last_msg ON true
    ),
    '[]'::jsonb
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.take_over_staff_conversation(p_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_conversation public.conversations%rowtype;
BEGIN
  IF NOT public.is_active_staff(ARRAY['super_admin','admin','reception','coach','content_manager']) THEN
    RAISE EXCEPTION 'STAFF_ACCESS_DENIED' USING errcode = '42501';
  END IF;

  SELECT * INTO v_conversation
  FROM public.conversations
  WHERE id = p_conversation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  END IF;

  UPDATE public.conversations
  SET mode = 'human_takeover', needs_attention = true, updated_at = now()
  WHERE id = p_conversation_id;

  UPDATE public.leads
  SET human_required = true, updated_at = now()
  WHERE id = v_conversation.lead_id;

  INSERT INTO public.audit_logs(actor_id, actor_type, action, entity_type, entity_id, detail)
  VALUES (
    auth.uid(), 'user', 'conversation_takeover', 'conversation', p_conversation_id,
    jsonb_build_object('previousMode', v_conversation.mode::text, 'nextMode', 'human_takeover')
  );

  RETURN jsonb_build_object('success', true, 'conversationId', p_conversation_id, 'mode', 'human_takeover');
END;
$function$;

CREATE OR REPLACE FUNCTION public.return_staff_conversation_to_ai(p_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_conversation public.conversations%rowtype;
BEGIN
  IF NOT public.is_active_staff(ARRAY['super_admin','admin','reception','coach','content_manager']) THEN
    RAISE EXCEPTION 'STAFF_ACCESS_DENIED' USING errcode = '42501';
  END IF;

  SELECT * INTO v_conversation
  FROM public.conversations
  WHERE id = p_conversation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  END IF;

  UPDATE public.conversations
  SET mode = 'ai_active', handoff_reason = NULL, needs_attention = false, updated_at = now()
  WHERE id = p_conversation_id;

  UPDATE public.leads
  SET human_required = false, updated_at = now()
  WHERE id = v_conversation.lead_id;

  PERFORM public.resolve_staff_alerts_for_conversation(p_conversation_id, ARRAY['human_required', 'customer_at_risk']);

  INSERT INTO public.audit_logs(actor_id, actor_type, action, entity_type, entity_id, detail)
  VALUES (
    auth.uid(), 'user', 'conversation_returned_to_ai', 'conversation', p_conversation_id,
    jsonb_build_object('previousMode', v_conversation.mode::text, 'nextMode', 'ai_active')
  );

  RETURN jsonb_build_object('success', true, 'conversationId', p_conversation_id, 'mode', 'ai_active');
END;
$function$;

CREATE OR REPLACE FUNCTION public.assert_staff_whatsapp_send_allowed(p_conversation_id uuid, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_conversation public.conversations%rowtype;
  v_lead public.leads%rowtype;
  v_body text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
     AND NOT public.is_active_staff(ARRAY['super_admin','admin','reception','content_manager']) THEN
    RAISE EXCEPTION 'STAFF_ACCESS_DENIED' USING errcode = '42501';
  END IF;

  v_body := btrim(coalesce(p_body, ''));
  IF v_body = '' OR char_length(v_body) > 4096 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_BODY');
  END IF;

  SELECT * INTO v_conversation
  FROM public.conversations
  WHERE id = p_conversation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  END IF;

  IF v_conversation.channel::text <> 'whatsapp' THEN
    RETURN jsonb_build_object('success', false, 'code', 'CHANNEL_NOT_WHATSAPP');
  END IF;

  IF v_conversation.mode::text NOT IN ('human_takeover', 'human_required') THEN
    RETURN jsonb_build_object('success', false, 'code', 'HUMAN_MODE_REQUIRED');
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE id = v_conversation.lead_id;
  IF NOT FOUND OR coalesce(v_lead.normalized_phone, '') = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'LEAD_PHONE_MISSING');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'conversationId', v_conversation.id,
    'leadId', v_lead.id,
    'recipientPhone', v_lead.normalized_phone,
    'externalThreadId', v_conversation.external_thread_id,
    'mode', v_conversation.mode::text
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_staff_whatsapp_outbound(
  p_conversation_id uuid,
  p_body text,
  p_external_message_id text,
  p_staff_user_id uuid,
  p_staff_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_message_id uuid;
  v_conversation public.conversations%rowtype;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING errcode = '42501';
  END IF;

  SELECT * INTO v_conversation FROM public.conversations WHERE id = p_conversation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  END IF;

  INSERT INTO public.messages (
    conversation_id,
    external_message_id,
    direction,
    author_type,
    body,
    safety_classification
  ) VALUES (
    p_conversation_id,
    coalesce(nullif(btrim(p_external_message_id), ''), gen_random_uuid()::text),
    'outbound',
    'staff',
    btrim(p_body),
    'staff_manual_reply'
  )
  RETURNING id INTO v_message_id;

  UPDATE public.conversations
  SET unread_count = 0, needs_attention = false, updated_at = now()
  WHERE id = p_conversation_id;

  INSERT INTO public.audit_logs(actor_id, actor_type, action, entity_type, entity_id, detail)
  VALUES (
    p_staff_user_id,
    'user',
    'staff_whatsapp_outbound_recorded',
    'conversation',
    p_conversation_id,
    jsonb_build_object('messageId', v_message_id, 'staffRole', p_staff_role, 'dryRun', p_external_message_id LIKE 'dry_run_%')
  );

  RETURN jsonb_build_object('success', true, 'messageId', v_message_id, 'conversationId', p_conversation_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_staff_control_tower_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_alerts jsonb := '[]'::jsonb;
  v_human_required integer;
  v_customer_at_risk integer;
  v_new_customers integer;
  v_attention integer;
BEGIN
  IF NOT public.is_active_staff(ARRAY['super_admin','admin','reception','coach','content_manager']) THEN
    RAISE EXCEPTION 'STAFF_ACCESS_DENIED' USING errcode = '42501';
  END IF;

  SELECT count(*)::integer INTO v_human_required
  FROM public.conversations c
  JOIN public.leads l ON l.id = c.lead_id
  WHERE c.mode::text = 'human_required' OR coalesce(l.human_required, false);

  SELECT count(*)::integer INTO v_customer_at_risk
  FROM public.staff_alerts
  WHERE alert_code = 'customer_at_risk' AND resolved_at IS NULL;

  SELECT count(*)::integer INTO v_new_customers
  FROM public.staff_alerts
  WHERE alert_code = 'new_customer' AND resolved_at IS NULL;

  IF v_new_customers > 0 THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'code', 'new_customer',
      'priority', 'medium',
      'count', v_new_customers,
      'message', 'New WhatsApp customers need a first human check-in'
    ));
  END IF;

  IF v_human_required > 0 THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'code', 'human_required',
      'priority', 'high',
      'count', v_human_required,
      'message', 'Conversations waiting for staff takeover or reply'
    ));
  END IF;

  IF v_customer_at_risk > 0 THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'code', 'customer_at_risk',
      'priority', 'critical',
      'count', v_customer_at_risk,
      'message', 'Customers showing confusion or repeated-question risk'
    ));
  END IF;

  v_attention := v_human_required + v_customer_at_risk + v_new_customers;

  RETURN jsonb_build_object(
    'generatedAt', now(),
    'leads', jsonb_build_object(
      'total', (SELECT count(*) FROM public.leads),
      'customers', (SELECT count(*) FROM public.leads WHERE stage = 'customer'),
      'new', (SELECT count(*) FROM public.leads WHERE stage = 'new'),
      'hot', (SELECT count(*) FROM public.leads WHERE score >= 70)
    ),
    'conversations', jsonb_build_object('humanRequired', v_human_required),
    'bookings', jsonb_build_object(
      'total', (SELECT count(*) FROM public.booking_requests),
      'pending', (SELECT count(*) FROM public.booking_requests WHERE status = 'pending'),
      'confirmed', (SELECT count(*) FROM public.booking_requests WHERE status = 'confirmed')
    ),
    'content', jsonb_build_object(
      'total', (SELECT count(*) FROM public.content_items),
      'review', (SELECT count(*) FROM public.content_items WHERE status IN ('needs_review', 'generated', 'draft')),
      'scheduled', (SELECT count(*) FROM public.content_items WHERE status = 'scheduled'),
      'published', (SELECT count(*) FROM public.content_items WHERE status = 'published'),
      'failed', (SELECT count(*) FROM public.content_items WHERE status = 'failed')
    ),
    'radar', jsonb_build_object('hot', (SELECT count(*) FROM public.radar_opportunities WHERE priority = 'HOT' AND status = 'NEW')),
    'automation', jsonb_build_object(
      'failed', (SELECT count(*) FROM public.background_jobs WHERE status IN ('failed', 'dead')),
      'active', (SELECT count(*) FROM public.background_jobs WHERE status IN ('queued', 'processing', 'retrying'))
    ),
    'revenue', jsonb_build_object(
      'invoiceCount', coalesce((SELECT count(*) FROM public.invoices), 0),
      'invoiceTotal', coalesce((SELECT sum(total_amount) FROM public.invoices), 0),
      'paidInvoiceTotal', coalesce((SELECT sum(total_amount) FROM public.invoices WHERE status = 'paid'), 0),
      'orderCount', coalesce((SELECT count(*) FROM public.orders), 0),
      'orderTotal', coalesce((SELECT sum(total_amount) FROM public.orders), 0)
    ),
    'alerts', v_alerts,
    'attentionScore', v_attention
  );
END;
$function$;

-- Replace concierge turn with memory-aware, anti-repetition, and human handoff routing.
CREATE OR REPLACE FUNCTION public.process_ai_sales_concierge_turn(
  p_conversation_id uuid,
  p_message_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_conversation public.conversations%rowtype;
  v_lead public.leads%rowtype;
  v_message public.messages%rowtype;
  v_language text;
  v_body text;
  v_state text;
  v_service text;
  v_stage text;
  v_score integer;
  v_fear boolean;
  v_draft text;
  v_human_handoff boolean := false;
  v_processed boolean := false;
  v_skipped boolean := false;
  v_skip_reason text;
  v_draft_message_id uuid;
  v_extracted jsonb;
  v_merge jsonb;
  v_memory jsonb;
  v_ledger jsonb;
  v_conflicts jsonb;
  v_handoff_reason text;
  v_alert_code text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING errcode = '42501';
  END IF;

  SELECT * INTO v_conversation FROM public.conversations WHERE id = p_conversation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'CONVERSATION_NOT_FOUND');
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE id = v_conversation.lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'LEAD_NOT_FOUND');
  END IF;

  IF p_message_id IS NOT NULL THEN
    SELECT * INTO v_message FROM public.messages
    WHERE id = p_message_id AND conversation_id = p_conversation_id AND direction = 'inbound' AND author_type = 'customer';
  ELSE
    SELECT * INTO v_message FROM public.messages
    WHERE conversation_id = p_conversation_id AND direction = 'inbound' AND author_type = 'customer'
    ORDER BY created_at DESC, id DESC LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'INBOUND_MESSAGE_NOT_FOUND');
  END IF;

  v_body := btrim(coalesce(v_message.body, ''));
  IF v_body = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'EMPTY_MESSAGE_BODY');
  END IF;

  v_language := CASE WHEN v_body ~ '[ء-ي]' THEN 'ar' ELSE 'en' END;
  v_extracted := public.concierge_extract_facts(v_body);
  v_merge := public.concierge_merge_memory(v_lead.customer_memory, v_lead.question_ledger, v_extracted);
  v_memory := v_merge->'memory';
  v_ledger := v_merge->'ledger';
  v_conflicts := v_merge->'conflicts';

  v_service := coalesce(nullif(btrim(coalesce(v_lead.service, '')), ''), v_memory->>'lesson_type');
  v_stage := v_lead.stage::text;
  v_score := coalesce(v_lead.score, 0);
  v_fear := v_lead.fear_of_water;
  v_state := CASE
    WHEN coalesce(v_lead.intent, '') LIKE 'concierge:%' THEN substring(v_lead.intent FROM 11)
    ELSE 'greeting'
  END;

  IF v_conversation.mode::text <> 'ai_active' THEN
    RETURN jsonb_build_object(
      'success', true, 'code', 'SKIPPED', 'processed', false, 'skipped', true,
      'skipReason', 'CONVERSATION_NOT_AI_ACTIVE', 'conversationId', v_conversation.id,
      'leadId', v_lead.id, 'messageId', v_message.id, 'channel', v_conversation.channel::text,
      'language', v_language, 'outboundEnabled', false
    );
  END IF;

  IF jsonb_array_length(v_conflicts) > 0 THEN
    v_draft := CASE WHEN v_language = 'ar'
      THEN 'لاحظت معلومات مختلفة. هل يمكنك توضيح الإجابة الصحيحة؟'
      ELSE 'I noticed different details. Could you clarify the correct answer?'
    END;
    v_processed := true;
  ELSIF v_body ~* '(already told you|i told you|i said|as i said|قلت لك|سبق وقلت|ذكرت)' THEN
    v_human_handoff := true;
    v_handoff_reason := 'customer_already_told';
    v_alert_code := 'customer_at_risk';
  ELSIF v_body ~* '(human|person|coach|ayman|speak to someone|talk to someone|موظف|بشري|كوتش|أيمن|مدرب|تحدث مع)' THEN
    v_human_handoff := true;
    v_handoff_reason := 'customer_requested_human';
    v_alert_code := 'human_required';
  ELSIF v_body ~* '(don''t understand|didn''t understand|what do you mean|not clear|ما فهمت|مش فاهم|مافهمت|مو واضح|غير واضح)' THEN
    v_human_handoff := true;
    v_handoff_reason := 'understanding_failed';
    v_alert_code := 'customer_at_risk';
  ELSIF v_state = 'greeting' THEN
    IF v_body ~* '(price|cost|how much|fee|aed|dirham|سعر|كم|تكلفة|درهم)' THEN v_state := 'presented_pricing';
    ELSIF v_body ~* '(private|individual|one[\s-]?on[\s-]?one|خاص|فردي|حصة خاصة)' THEN v_service := 'private'; v_state := 'awaiting_fear_of_water';
    ELSIF v_body ~* '(sibling|brother|sister|brothers|sisters|إخوة|أخوات|أشقاء|أخ|أخت)' THEN v_service := 'siblings'; v_state := 'presented_pricing';
    ELSIF v_body ~* '(group|family|up to 5|مجموعة|عائلة|جماعي)' THEN v_service := 'group'; v_state := 'awaiting_fear_of_water';
    ELSIF v_body ~* '(book|booking|reserve|appointment|subscribe|حجز|موعد|اشتراك|أحجز|احجز)' THEN v_state := 'booking_guidance';
    ELSE v_state := 'awaiting_offer_type';
    END IF;
    IF v_stage = 'new' THEN v_stage := 'contacted'; END IF;
    v_processed := true;
  ELSIF v_state = 'awaiting_offer_type' THEN
    IF v_body ~* '(private|individual|one[\s-]?on[\s-]?one|خاص|فردي|حصة خاصة)' THEN v_service := 'private'; v_state := 'awaiting_fear_of_water'; v_stage := 'qualified'; v_score := v_score + 10;
    ELSIF v_body ~* '(sibling|brother|sister|brothers|sisters|إخوة|أخوات|أشقاء|أخ|أخت)' THEN v_service := 'siblings'; v_state := 'presented_pricing'; v_stage := 'qualified'; v_score := v_score + 10;
    ELSIF v_body ~* '(group|family|up to 5|مجموعة|عائلة|جماعي)' THEN v_service := 'group'; v_state := 'awaiting_fear_of_water'; v_stage := 'qualified'; v_score := v_score + 10;
    END IF;
    v_processed := true;
  ELSIF v_state = 'awaiting_fear_of_water' THEN
    IF v_body ~* '(fear|afraid|scared|خوف|خايف|خائف)' THEN v_fear := true;
    ELSIF v_body ~* '(comfortable|fine|no fear|not afraid|مرتاح|ما في خوف|لا خوف)' OR v_body ~* '^(yes|yep|yeah|sure|ok|okay|نعم|أيوه|ايوه|تمام|موافق)\b' THEN v_fear := false;
    END IF;
    v_state := 'presented_pricing'; v_score := v_score + 10;
    IF v_stage IN ('new', 'contacted') THEN v_stage := 'qualified'; END IF;
    v_processed := true;
  ELSIF v_state = 'presented_pricing' AND v_body ~* '(book|booking|reserve|appointment|subscribe|حجز|موعد|اشتراك|أحجز|احجز)' THEN
    v_state := 'booking_guidance'; v_stage := 'booking_intent'; v_score := v_score + 20; v_processed := true;
  ELSIF v_state = 'booking_guidance' AND v_body ~* '^(yes|yep|yeah|sure|ok|okay|نعم|أيوه|ايوه|تمام|موافق)\b' THEN
    v_stage := 'booking_intent'; v_score := v_score + 20; v_processed := true;
  ELSE
    v_processed := true;
  END IF;

  IF public.concierge_fact_known('lesson_type', v_ledger) AND v_state = 'awaiting_offer_type' THEN
    v_state := CASE WHEN coalesce(v_service, v_memory->>'lesson_type') = 'private' THEN 'awaiting_fear_of_water' ELSE 'presented_pricing' END;
  END IF;

  IF public.concierge_fact_known('fear_of_water', v_ledger) AND v_state = 'awaiting_fear_of_water' THEN
    v_state := 'presented_pricing';
  END IF;

  IF v_processed AND v_draft IS NULL AND NOT v_human_handoff THEN
    IF v_state = 'awaiting_offer_type' AND NOT public.concierge_fact_known('lesson_type', v_ledger) THEN
      v_draft := CASE WHEN v_language = 'ar'
        THEN 'أهلًا بك في Coach Ayman Swimming. هل تفضّل حصة سباحة خاصة أم مجموعة (حتى 5 أشخاص)؟'
        ELSE 'Welcome to Coach Ayman Swimming. Would you like a private swimming lesson or a group lesson (up to 5 people)?'
      END;
      v_ledger := jsonb_set(v_ledger, '{questions_asked}', coalesce(v_ledger->'questions_asked', '[]'::jsonb) || '["lesson_type"]'::jsonb, true);
    ELSIF v_state = 'awaiting_fear_of_water' AND NOT public.concierge_fact_known('fear_of_water', v_ledger) THEN
      IF public.concierge_fact_known('child_age', v_ledger) AND v_body ~* '(already told|قلت)' THEN
        v_human_handoff := true; v_handoff_reason := 'repeated_question'; v_alert_code := 'customer_at_risk';
      ELSE
        v_draft := CASE WHEN v_language = 'ar'
          THEN 'سؤال سريع: هل السبّاح مرتاح في الماء، أم يوجد خوف من الماء؟'
          ELSE 'Quick question: is the swimmer comfortable in water, or is there fear of water?'
        END;
        v_ledger := jsonb_set(v_ledger, '{questions_asked}', coalesce(v_ledger->'questions_asked', '[]'::jsonb) || '["fear_of_water"]'::jsonb, true);
      END IF;
    ELSIF v_state = 'presented_pricing' THEN
      v_draft := CASE
        WHEN coalesce(v_service, 'private') = 'siblings' THEN CASE WHEN v_language = 'ar'
          THEN E'حصة خاصة: 150 درهم بدل 200 درهم — عرض لفترة محدودة.\nحصة جماعية: حتى 5 أشخاص — 450 درهم.\nخصم الإخوة: 50 درهم لكل أخ/أخت. مثال: مجموعة إخوة مؤهلة = 400 درهم بدل 450 درهم.\n\nهل تود المتابعة للحجز؟'
          ELSE E'Private lesson: 150 AED instead of 200 AED — limited-time offer.\nGroup lesson: up to 5 people — 450 AED.\nSiblings discount: 50 AED off per sibling. Example: eligible sibling group = 400 AED instead of 450 AED.\n\nWould you like to proceed with booking?'
        END
        ELSE CASE WHEN v_language = 'ar'
          THEN E'حصة خاصة: 150 درهم بدل 200 درهم — عرض لفترة محدودة.\nحصة جماعية: حتى 5 أشخاص — 450 درهم.\nخصم الإخوة: 50 درهم لكل أخ/أخت. مثال: مجموعة إخوة مؤهلة = 400 درهم بدل 450 درهم.\n\nهل تود المتابعة للحجز؟'
          ELSE E'Private lesson: 150 AED instead of 200 AED — limited-time offer.\nGroup lesson: up to 5 people — 450 AED.\nSiblings discount: 50 AED off per sibling. Example: eligible sibling group = 400 AED instead of 450 AED.\n\nWould you like to proceed with booking?'
        END
      END;
    ELSIF v_state = 'booking_guidance' THEN
      v_draft := CASE WHEN v_language = 'ar'
        THEN 'ممتاز — يمكنني توجيهك للحجز مع الكوتش أيمن. اكتب نعم للمتابعة.'
        ELSE 'Great — I can guide you toward booking with Coach Ayman. Reply yes to continue.'
      END;
    ELSE
      v_state := 'awaiting_offer_type';
      IF v_stage = 'new' THEN v_stage := 'contacted'; END IF;
      v_draft := CASE WHEN v_language = 'ar'
        THEN 'أهلًا بك في Coach Ayman Swimming. أستطيع مساعدتك في حصص السباحة الخاصة أو الجماعية. ماذا تفضّل؟'
        ELSE 'Welcome to Coach Ayman Swimming. I can help with private or group swimming lessons. What would you like?'
      END;
    END IF;
  END IF;

  IF v_memory ? 'fear_of_water' THEN
    v_fear := CASE WHEN v_memory->>'fear_of_water' IN ('true', 'yes') THEN true WHEN v_memory->>'fear_of_water' IN ('false', 'no') THEN false ELSE v_fear END;
  END IF;

  UPDATE public.leads
  SET
    language = coalesce(v_memory->>'preferred_language', v_language),
    intent = 'concierge:' || CASE WHEN v_human_handoff THEN 'human_handoff' ELSE v_state END,
    service = coalesce(v_service, service),
    stage = v_stage::public.lead_stage,
    score = v_score,
    fear_of_water = coalesce(v_fear, fear_of_water),
    human_required = CASE WHEN v_human_handoff THEN true ELSE human_required END,
    customer_memory = v_memory,
    question_ledger = v_ledger,
    updated_at = now()
  WHERE id = v_lead.id;

  IF v_human_handoff THEN
    PERFORM public.route_conversation_to_human(
      v_conversation.id,
      v_lead.id,
      coalesce(v_handoff_reason, 'human_handoff'),
      coalesce(v_alert_code, 'human_required'),
      CASE WHEN v_alert_code = 'customer_at_risk' THEN 'critical' ELSE 'high' END,
      jsonb_build_object('messageId', v_message.id, 'channel', v_conversation.channel::text)
    );
  END IF;

  IF v_draft IS NOT NULL AND NOT v_human_handoff THEN
    INSERT INTO public.messages (conversation_id, direction, author_type, body, safety_classification)
    VALUES (v_conversation.id, 'outbound', 'ai_draft', v_draft, 'approved_offer_only')
    RETURNING id INTO v_draft_message_id;
  END IF;

  INSERT INTO public.audit_logs(actor_id, actor_type, action, entity_type, entity_id, detail)
  VALUES (
    NULL, 'system', 'ai_sales_concierge_turn', 'conversation', v_conversation.id,
    jsonb_build_object(
      'leadId', v_lead.id, 'messageId', v_message.id, 'draftMessageId', v_draft_message_id,
      'channel', v_conversation.channel::text, 'language', v_language, 'state', v_state,
      'humanHandoff', v_human_handoff, 'handoffReason', v_handoff_reason, 'outboundEnabled', false
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'code', CASE WHEN v_skipped THEN 'SKIPPED' WHEN v_human_handoff THEN 'HUMAN_HANDOFF' ELSE 'DRAFT_READY' END,
    'processed', v_processed, 'skipped', v_skipped, 'skipReason', v_skip_reason,
    'conversationId', v_conversation.id, 'leadId', v_lead.id, 'messageId', v_message.id,
    'draftMessageId', v_draft_message_id, 'channel', v_conversation.channel::text, 'language', v_language,
    'intent', 'concierge:' || CASE WHEN v_human_handoff THEN 'human_handoff' ELSE v_state END,
    'stage', v_stage, 'score', v_score, 'humanHandoff', v_human_handoff,
    'handoffReason', v_handoff_reason, 'draftReply', v_draft, 'outboundEnabled', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_whatsapp_webhook_ingress(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_expected_phone_number_id constant text := '100566230597045';
  v_provider constant text := 'whatsapp';
  v_event_field text;
  v_provider_event_id text;
  v_wa_id text;
  v_from_phone text;
  v_normalized_phone text;
  v_contact_name text;
  v_message_body text;
  v_message_type text;
  v_phone_number_id text;
  v_language text;
  v_lead_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_existing_webhook uuid;
  v_display_name text;
  v_lead_created boolean := false;
  v_conversation_created boolean := false;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING errcode = '42501';
  END IF;

  IF coalesce(p_payload->>'object', '') <> 'whatsapp_business_account' THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNSUPPORTED_OBJECT');
  END IF;

  SELECT
    change.value->>'field',
    change.value->'value'->'metadata'->>'phone_number_id',
    msg.value->>'id',
    msg.value->>'from',
    msg.value->'text'->>'body',
    msg.value->>'type',
    contact.value->'profile'->>'name',
    contact.value->>'wa_id'
  INTO
    v_event_field,
    v_phone_number_id,
    v_provider_event_id,
    v_from_phone,
    v_message_body,
    v_message_type,
    v_contact_name,
    v_wa_id
  FROM jsonb_array_elements(coalesce(p_payload->'entry', '[]'::jsonb)) entry(value)
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(entry.value->'changes', '[]'::jsonb)) change(value)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(change.value->'value'->'messages') = 'array'
        THEN change.value->'value'->'messages'
      ELSE '[]'::jsonb
    END
  ) msg(value)
  LEFT JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(change.value->'value'->'contacts') = 'array'
        THEN change.value->'value'->'contacts'
      ELSE '[]'::jsonb
    END
  ) contact(value)
    ON contact.value->>'wa_id' = msg.value->>'from'
  LIMIT 1;

  IF v_provider_event_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'code', 'NO_MESSAGE_EVENT', 'processed', false);
  END IF;

  IF v_phone_number_id IS DISTINCT FROM v_expected_phone_number_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'PHONE_NUMBER_ID_MISMATCH');
  END IF;

  IF coalesce(v_message_type, 'text') <> 'text' THEN
    RETURN jsonb_build_object('success', true, 'code', 'UNSUPPORTED_MESSAGE_TYPE', 'processed', false);
  END IF;

  v_message_body := coalesce(v_message_body, '');
  IF btrim(v_message_body) = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'EMPTY_MESSAGE_BODY');
  END IF;

  SELECT id INTO v_existing_webhook
  FROM public.webhook_events
  WHERE provider = v_provider AND provider_event_id = v_provider_event_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'code', 'DUPLICATE_EVENT', 'duplicate', true, 'processed', false);
  END IF;

  INSERT INTO public.webhook_events (provider, provider_event_id, event_type, payload, processed_at)
  VALUES (v_provider, v_provider_event_id, coalesce(v_event_field, 'messages'), p_payload, now());

  v_normalized_phone := regexp_replace(coalesce(v_from_phone, ''), '[^0-9]', '', 'g');
  IF left(v_normalized_phone, 5) = '00971' THEN
    v_normalized_phone := substring(v_normalized_phone FROM 6);
  ELSIF left(v_normalized_phone, 3) = '971' THEN
    v_normalized_phone := substring(v_normalized_phone FROM 4);
  ELSIF left(v_normalized_phone, 1) = '0' THEN
    v_normalized_phone := substring(v_normalized_phone FROM 2);
  END IF;
  v_normalized_phone := '971' || v_normalized_phone;

  IF v_normalized_phone !~ '^9715[0-9]{8}$' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_PHONE');
  END IF;

  v_wa_id := coalesce(nullif(btrim(coalesce(v_wa_id, '')), ''), v_from_phone);
  v_contact_name := nullif(btrim(coalesce(v_contact_name, '')), '');
  v_language := CASE WHEN v_message_body ~ '[ء-ي]' THEN 'ar' ELSE 'en' END;
  v_display_name := coalesce(v_contact_name, v_normalized_phone);

  SELECT id INTO v_lead_id FROM public.leads WHERE normalized_phone = v_normalized_phone LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.leads (name, full_name, phone, normalized_phone, language, source_channel, stage, score)
    VALUES (v_display_name, v_display_name, v_from_phone, v_normalized_phone, v_language, 'whatsapp', 'new', 0)
    RETURNING id INTO v_lead_id;
    v_lead_created := true;
  ELSE
    UPDATE public.leads
    SET language = v_language,
        full_name = CASE WHEN v_contact_name IS NOT NULL THEN v_contact_name ELSE full_name END,
        name = CASE WHEN v_contact_name IS NOT NULL THEN v_contact_name ELSE name END,
        updated_at = now()
    WHERE id = v_lead_id;
  END IF;

  SELECT id INTO v_conversation_id
  FROM public.conversations
  WHERE channel = 'whatsapp' AND external_thread_id = v_wa_id
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.conversations (lead_id, channel, external_thread_id, mode, unread_count)
    VALUES (v_lead_id, 'whatsapp', v_wa_id, 'ai_active', 0)
    RETURNING id INTO v_conversation_id;
    v_conversation_created := true;
  END IF;

  INSERT INTO public.messages (conversation_id, external_message_id, direction, author_type, body)
  VALUES (v_conversation_id, v_provider_event_id, 'inbound', 'customer', v_message_body)
  ON CONFLICT (conversation_id, external_message_id) DO NOTHING
  RETURNING id INTO v_message_id;

  IF v_message_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true, 'code', 'DUPLICATE_MESSAGE', 'duplicate', true, 'processed', false,
      'conversationId', v_conversation_id, 'leadId', v_lead_id, 'language', v_language
    );
  END IF;

  UPDATE public.conversations
  SET unread_count = unread_count + 1, updated_at = now()
  WHERE id = v_conversation_id;

  IF v_lead_created OR v_conversation_created THEN
    PERFORM public.upsert_staff_alert(
      'new_customer',
      'medium',
      CASE WHEN v_conversation_created THEN 'conversation' ELSE 'lead' END,
      CASE WHEN v_conversation_created THEN v_conversation_id ELSE v_lead_id END,
      v_lead_id,
      v_conversation_id,
      CASE WHEN v_lead_created THEN 'New WhatsApp lead created' ELSE 'New WhatsApp conversation started' END,
      jsonb_build_object('messageId', v_message_id, 'language', v_language)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'code', 'MESSAGE_INGESTED', 'processed', true, 'duplicate', false,
    'conversationId', v_conversation_id, 'leadId', v_lead_id, 'messageId', v_message_id,
    'language', v_language, 'leadCreated', v_lead_created, 'conversationCreated', v_conversation_created
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.process_whatsapp_webhook_ingress(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_whatsapp_webhook_ingress(jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.upsert_staff_alert(text, text, text, uuid, uuid, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_staff_alerts_for_conversation(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_staff_whatsapp_send_allowed(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_staff_whatsapp_outbound(uuid, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_staff_inbox() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_control_tower_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.take_over_staff_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_staff_conversation_to_ai(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_staff_whatsapp_send_allowed(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_staff_whatsapp_outbound(uuid, text, text, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.process_ai_sales_concierge_turn(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_ai_sales_concierge_turn(uuid, uuid) TO service_role;
