-- Phase 5G: minimum WhatsApp webhook ingress into existing CRM tables.
-- Service-role only. No outbound messaging. No new tables.

CREATE OR REPLACE FUNCTION public.process_whatsapp_webhook_ingress(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
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
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if coalesce(p_payload->>'object', '') <> 'whatsapp_business_account' then
    return jsonb_build_object('success', false, 'code', 'UNSUPPORTED_OBJECT');
  end if;

  select
    change.value->>'field',
    change.value->'value'->'metadata'->>'phone_number_id',
    msg.value->>'id',
    msg.value->>'from',
    msg.value->'text'->>'body',
    msg.value->>'type',
    contact.value->'profile'->>'name',
    contact.value->>'wa_id'
  into
    v_event_field,
    v_phone_number_id,
    v_provider_event_id,
    v_from_phone,
    v_message_body,
    v_message_type,
    v_contact_name,
    v_wa_id
  from jsonb_array_elements(coalesce(p_payload->'entry', '[]'::jsonb)) entry(value)
  cross join lateral jsonb_array_elements(coalesce(entry.value->'changes', '[]'::jsonb)) change(value)
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(change.value->'value'->'messages') = 'array'
        then change.value->'value'->'messages'
      else '[]'::jsonb
    end
  ) msg(value)
  left join lateral jsonb_array_elements(
    case
      when jsonb_typeof(change.value->'value'->'contacts') = 'array'
        then change.value->'value'->'contacts'
      else '[]'::jsonb
    end
  ) contact(value)
    on contact.value->>'wa_id' = msg.value->>'from'
  limit 1;

  if v_provider_event_id is null then
    return jsonb_build_object('success', true, 'code', 'NO_MESSAGE_EVENT', 'processed', false);
  end if;

  if v_phone_number_id is distinct from v_expected_phone_number_id then
    return jsonb_build_object('success', false, 'code', 'PHONE_NUMBER_ID_MISMATCH');
  end if;

  if coalesce(v_message_type, 'text') <> 'text' then
    return jsonb_build_object('success', true, 'code', 'UNSUPPORTED_MESSAGE_TYPE', 'processed', false);
  end if;

  v_message_body := coalesce(v_message_body, '');
  if btrim(v_message_body) = '' then
    return jsonb_build_object('success', false, 'code', 'EMPTY_MESSAGE_BODY');
  end if;

  select id
  into v_existing_webhook
  from public.webhook_events
  where provider = v_provider
    and provider_event_id = v_provider_event_id
  limit 1;

  if found then
    return jsonb_build_object(
      'success', true,
      'code', 'DUPLICATE_EVENT',
      'duplicate', true,
      'processed', false
    );
  end if;

  insert into public.webhook_events (
    provider,
    provider_event_id,
    event_type,
    payload,
    processed_at
  ) values (
    v_provider,
    v_provider_event_id,
    coalesce(v_event_field, 'messages'),
    p_payload,
    now()
  );

  v_normalized_phone := regexp_replace(coalesce(v_from_phone, ''), '[^0-9]', '', 'g');
  if left(v_normalized_phone, 5) = '00971' then
    v_normalized_phone := substring(v_normalized_phone from 6);
  elsif left(v_normalized_phone, 3) = '971' then
    v_normalized_phone := substring(v_normalized_phone from 4);
  elsif left(v_normalized_phone, 1) = '0' then
    v_normalized_phone := substring(v_normalized_phone from 2);
  end if;
  v_normalized_phone := '971' || v_normalized_phone;

  if v_normalized_phone !~ '^9715[0-9]{8}$' then
    return jsonb_build_object('success', false, 'code', 'INVALID_PHONE');
  end if;

  v_wa_id := coalesce(nullif(btrim(coalesce(v_wa_id, '')), ''), v_from_phone);
  v_contact_name := nullif(btrim(coalesce(v_contact_name, '')), '');
  v_language := case when v_message_body ~ '[ء-ي]' then 'ar' else 'en' end;
  v_display_name := coalesce(v_contact_name, v_normalized_phone);

  select id
  into v_lead_id
  from public.leads
  where normalized_phone = v_normalized_phone
  limit 1;

  if not found then
    insert into public.leads (
      name,
      full_name,
      phone,
      normalized_phone,
      language,
      source_channel,
      stage,
      score
    ) values (
      v_display_name,
      v_display_name,
      v_from_phone,
      v_normalized_phone,
      v_language,
      'whatsapp',
      'new',
      0
    )
    returning id into v_lead_id;
  else
    update public.leads
    set
      language = v_language,
      full_name = case
        when v_contact_name is not null then v_contact_name
        else full_name
      end,
      name = case
        when v_contact_name is not null then v_contact_name
        else name
      end,
      updated_at = now()
    where id = v_lead_id;
  end if;

  select id
  into v_conversation_id
  from public.conversations
  where channel = 'whatsapp'
    and external_thread_id = v_wa_id
  limit 1;

  if not found then
    insert into public.conversations (
      lead_id,
      channel,
      external_thread_id,
      mode,
      unread_count
    ) values (
      v_lead_id,
      'whatsapp',
      v_wa_id,
      'ai_active',
      0
    )
    returning id into v_conversation_id;
  end if;

  insert into public.messages (
    conversation_id,
    external_message_id,
    direction,
    author_type,
    body
  ) values (
    v_conversation_id,
    v_provider_event_id,
    'inbound',
    'customer',
    v_message_body
  )
  on conflict (conversation_id, external_message_id) do nothing
  returning id into v_message_id;

  if v_message_id is null then
    return jsonb_build_object(
      'success', true,
      'code', 'DUPLICATE_MESSAGE',
      'duplicate', true,
      'processed', false,
      'conversationId', v_conversation_id,
      'leadId', v_lead_id,
      'language', v_language
    );
  end if;

  update public.conversations
  set
    unread_count = unread_count + 1,
    updated_at = now()
  where id = v_conversation_id;

  return jsonb_build_object(
    'success', true,
    'code', 'MESSAGE_INGESTED',
    'processed', true,
    'duplicate', false,
    'conversationId', v_conversation_id,
    'leadId', v_lead_id,
    'messageId', v_message_id,
    'language', v_language
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.process_whatsapp_webhook_ingress(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_whatsapp_webhook_ingress(jsonb) TO service_role;
