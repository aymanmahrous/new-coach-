-- Phase 6A: unified AI Sales Concierge foundation (inbound draft only, no outbound send).
-- Shared logic for whatsapp, facebook, instagram conversations in existing CRM tables.

CREATE OR REPLACE FUNCTION public.process_ai_sales_concierge_turn(
  p_conversation_id uuid,
  p_message_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
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
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  select * into v_conversation
  from public.conversations
  where id = p_conversation_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'code', 'CONVERSATION_NOT_FOUND');
  end if;

  select * into v_lead
  from public.leads
  where id = v_conversation.lead_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'code', 'LEAD_NOT_FOUND');
  end if;

  if p_message_id is not null then
    select * into v_message
    from public.messages
    where id = p_message_id
      and conversation_id = p_conversation_id
      and direction = 'inbound'
      and author_type = 'customer';
  else
    select * into v_message
    from public.messages
    where conversation_id = p_conversation_id
      and direction = 'inbound'
      and author_type = 'customer'
    order by created_at desc, id desc
    limit 1;
  end if;

  if not found then
    return jsonb_build_object('success', false, 'code', 'INBOUND_MESSAGE_NOT_FOUND');
  end if;

  v_body := btrim(coalesce(v_message.body, ''));
  if v_body = '' then
    return jsonb_build_object('success', false, 'code', 'EMPTY_MESSAGE_BODY');
  end if;

  v_language := case when v_body ~ '[ء-ي]' then 'ar' else 'en' end;
  v_service := nullif(btrim(coalesce(v_lead.service, '')), '');
  v_stage := v_lead.stage::text;
  v_score := coalesce(v_lead.score, 0);
  v_fear := v_lead.fear_of_water;
  v_state := case
    when coalesce(v_lead.intent, '') like 'concierge:%' then substring(v_lead.intent from 11)
    else 'greeting'
  end;

  if v_conversation.mode::text <> 'ai_active' then
    return jsonb_build_object(
      'success', true,
      'code', 'SKIPPED',
      'processed', false,
      'skipped', true,
      'skipReason', 'CONVERSATION_NOT_AI_ACTIVE',
      'conversationId', v_conversation.id,
      'leadId', v_lead.id,
      'messageId', v_message.id,
      'channel', v_conversation.channel::text,
      'language', v_language,
      'outboundEnabled', false
    );
  end if;

  if v_body ~* '(human|person|coach|ayman|speak to someone|talk to someone|موظف|بشري|كوتش|أيمن|مدرب|تحدث مع)' then
    v_human_handoff := true;
    v_state := 'human_handoff';
    v_draft := case
      when v_language = 'ar'
        then 'سأوصلك بالكوتش أيمن للمتابعة الشخصية. سيرد عليك قريبًا.'
      else 'I''ll connect you with Coach Ayman for personal follow-up. He will reply shortly.'
    end;
    v_stage := case when v_stage = 'new' then 'contacted' else v_stage end;
    v_score := v_score + 10;
    v_processed := true;
  elsif v_state = 'greeting' then
    if v_body ~* '(price|cost|how much|fee|aed|dirham|سعر|كم|تكلفة|درهم)' then
      v_state := 'presented_pricing';
    elsif v_body ~* '(private|individual|one[\s-]?on[\s-]?one|خاص|فردي|حصة خاصة)' then
      v_service := 'private';
      v_state := 'awaiting_fear_of_water';
    elsif v_body ~* '(sibling|brother|sister|brothers|sisters|إخوة|أخوات|أشقاء|أخ|أخت)' then
      v_service := 'siblings';
      v_state := 'presented_pricing';
    elsif v_body ~* '(group|family|up to 5|مجموعة|عائلة|جماعي)' then
      v_service := 'group';
      v_state := 'awaiting_fear_of_water';
    elsif v_body ~* '(book|booking|reserve|appointment|subscribe|حجز|موعد|اشتراك|أحجز|احجز)' then
      v_state := 'booking_guidance';
    else
      v_state := 'awaiting_offer_type';
    end if;
    if v_stage = 'new' then v_stage := 'contacted'; end if;
    v_processed := true;
  elsif v_state = 'awaiting_offer_type' then
    if v_body ~* '(private|individual|one[\s-]?on[\s-]?one|خاص|فردي|حصة خاصة)' then
      v_service := 'private';
      v_state := 'awaiting_fear_of_water';
      v_stage := 'qualified';
      v_score := v_score + 10;
    elsif v_body ~* '(sibling|brother|sister|brothers|sisters|إخوة|أخوات|أشقاء|أخ|أخت)' then
      v_service := 'siblings';
      v_state := 'presented_pricing';
      v_stage := 'qualified';
      v_score := v_score + 10;
    elsif v_body ~* '(group|family|up to 5|مجموعة|عائلة|جماعي)' then
      v_service := 'group';
      v_state := 'awaiting_fear_of_water';
      v_stage := 'qualified';
      v_score := v_score + 10;
    end if;
    v_processed := true;
  elsif v_state = 'awaiting_fear_of_water' then
    if v_body ~* '(fear|afraid|scared|خوف|خايف|خائف)' then
      v_fear := true;
    elsif v_body ~* '(comfortable|fine|no fear|not afraid|مرتاح|ما في خوف|لا خوف)' or v_body ~* '^(yes|yep|yeah|sure|ok|okay|نعم|أيوه|ايوه|تمام|موافق)\b' then
      v_fear := false;
    end if;
    v_state := 'presented_pricing';
    v_score := v_score + 10;
    if v_stage in ('new', 'contacted') then v_stage := 'qualified'; end if;
    v_processed := true;
  elsif v_state = 'presented_pricing' and v_body ~* '(book|booking|reserve|appointment|subscribe|حجز|موعد|اشتراك|أحجز|احجز)' then
    v_state := 'booking_guidance';
    v_stage := 'booking_intent';
    v_score := v_score + 20;
    v_processed := true;
  elsif v_state = 'booking_guidance' and v_body ~* '^(yes|yep|yeah|sure|ok|okay|نعم|أيوه|ايوه|تمام|موافق)\b' then
    v_stage := 'booking_intent';
    v_score := v_score + 20;
    v_processed := true;
  else
    v_processed := true;
  end if;

  if v_processed and v_draft is null then
    if v_state = 'awaiting_offer_type' then
      v_draft := case
        when v_language = 'ar'
          then 'أهلًا بك في Relax Fix UAE. هل تفضّل حصة خاصة أم مجموعة (حتى 5 أشخاص)؟'
        else 'Welcome to Relax Fix UAE. Would you like a private lesson or a group lesson (up to 5 people)?'
      end;
    elsif v_state = 'awaiting_fear_of_water' then
      v_draft := case
        when v_language = 'ar'
          then 'سؤال سريع: هل السبّاح مرتاح في الماء، أم يوجد خوف من الماء؟'
        else 'Quick question: is the swimmer comfortable in water, or is there fear of water?'
      end;
    elsif v_state = 'presented_pricing' then
      v_draft := case
        when coalesce(v_service, 'private') = 'siblings' then
          case when v_language = 'ar'
            then E'حصة خاصة: 150 درهم بدل 200 درهم — عرض لفترة محدودة.\nحصة جماعية: حتى 5 أشخاص — 450 درهم.\nخصم الإخوة: 50 درهم لكل أخ/أخت. مثال: مجموعة إخوة مؤهلة = 400 درهم بدل 450 درهم.\n\nهل تود المتابعة للحجز؟'
            else E'Private lesson: 150 AED instead of 200 AED — limited-time offer.\nGroup lesson: up to 5 people — 450 AED.\nSiblings discount: 50 AED off per sibling. Example: eligible sibling group = 400 AED instead of 450 AED.\n\nWould you like to proceed with booking?'
          end
        when coalesce(v_service, 'private') = 'group' then
          case when v_language = 'ar'
            then E'حصة خاصة: 150 درهم بدل 200 درهم — عرض لفترة محدودة.\nحصة جماعية: حتى 5 أشخاص — 450 درهم.\nخصم الإخوة: 50 درهم لكل أخ/أخت. مثال: مجموعة إخوة مؤهلة = 400 درهم بدل 450 درهم.\n\nهل تود المتابعة للحجز؟'
            else E'Private lesson: 150 AED instead of 200 AED — limited-time offer.\nGroup lesson: up to 5 people — 450 AED.\nSiblings discount: 50 AED off per sibling. Example: eligible sibling group = 400 AED instead of 450 AED.\n\nWould you like to proceed with booking?'
          end
        else
          case when v_language = 'ar'
            then E'حصة خاصة: 150 درهم بدل 200 درهم — عرض لفترة محدودة.\nحصة جماعية: حتى 5 أشخاص — 450 درهم.\nخصم الإخوة: 50 درهم لكل أخ/أخت. مثال: مجموعة إخوة مؤهلة = 400 درهم بدل 450 درهم.\n\nهل تود المتابعة للحجز؟'
            else E'Private lesson: 150 AED instead of 200 AED — limited-time offer.\nGroup lesson: up to 5 people — 450 AED.\nSiblings discount: 50 AED off per sibling. Example: eligible sibling group = 400 AED instead of 450 AED.\n\nWould you like to proceed with booking?'
          end
      end;
    elsif v_state = 'booking_guidance' then
      v_draft := case
        when v_language = 'ar'
          then 'ممتاز — يمكنني توجيهك للحجز مع الكوتش أيمن. اكتب نعم للمتابعة.'
        else 'Great — I can guide you toward booking with Coach Ayman. Reply yes to continue.'
      end;
    else
      v_state := 'awaiting_offer_type';
      if v_stage = 'new' then v_stage := 'contacted'; end if;
      v_draft := case
        when v_language = 'ar'
          then 'أهلًا بك في Relax Fix UAE. أستطيع مساعدتك في الحصص الخاصة أو الجماعية. ماذا تفضّل؟'
        else 'Welcome to Relax Fix UAE. I can help with private or group swimming lessons. What would you like?'
      end;
    end if;
  end if;

  update public.leads
  set
    language = v_language,
    intent = 'concierge:' || v_state,
    service = coalesce(v_service, service),
    stage = v_stage::public.lead_stage,
    score = v_score,
    fear_of_water = coalesce(v_fear, fear_of_water),
    human_required = case when v_human_handoff then true else human_required end,
    updated_at = now()
  where id = v_lead.id;

  if v_human_handoff then
    update public.conversations
    set mode = 'human_required', updated_at = now()
    where id = v_conversation.id;
  end if;

  if v_draft is not null then
    insert into public.messages (
      conversation_id,
      direction,
      author_type,
      body,
      safety_classification
    ) values (
      v_conversation.id,
      'outbound',
      'ai_draft',
      v_draft,
      'approved_offer_only'
    )
    returning id into v_draft_message_id;
  end if;

  insert into public.audit_logs (
    actor_id,
    actor_type,
    action,
    entity_type,
    entity_id,
    detail
  ) values (
    null,
    'system',
    'ai_sales_concierge_turn',
    'conversation',
    v_conversation.id,
    jsonb_build_object(
      'leadId', v_lead.id,
      'messageId', v_message.id,
      'draftMessageId', v_draft_message_id,
      'channel', v_conversation.channel::text,
      'language', v_language,
      'state', v_state,
      'humanHandoff', v_human_handoff,
      'outboundEnabled', false
    )
  );

  return jsonb_build_object(
    'success', true,
    'code', case when v_skipped then 'SKIPPED' else 'DRAFT_READY' end,
    'processed', v_processed,
    'skipped', v_skipped,
    'skipReason', v_skip_reason,
    'conversationId', v_conversation.id,
    'leadId', v_lead.id,
    'messageId', v_message.id,
    'draftMessageId', v_draft_message_id,
    'channel', v_conversation.channel::text,
    'language', v_language,
    'intent', 'concierge:' || v_state,
    'stage', v_stage,
    'score', v_score,
    'humanHandoff', v_human_handoff,
    'draftReply', v_draft,
    'outboundEnabled', false
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.process_ai_sales_concierge_turn(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_ai_sales_concierge_turn(uuid, uuid) TO service_role;
