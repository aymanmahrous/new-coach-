-- Relax Fix Opportunity RADAR exact geo activation.
-- PRE-PRODUCTION ONLY until explicit owner Production approval.
-- Uses only the four owner-approved pool locations.

alter table public.radar_opportunities
  add column if not exists is_test boolean not null default false,
  add column if not exists nearest_pool_id text,
  add column if not exists nearest_pool_name text,
  add column if not exists distance_m integer,
  add column if not exists proximity_tier text;

alter table public.radar_opportunities
  drop constraint if exists radar_opportunities_proximity_tier_check;
alter table public.radar_opportunities
  add constraint radar_opportunities_proximity_tier_check
  check (proximity_tier is null or proximity_tier in ('VERY_CLOSE','NEAR','LOCAL','EXTENDED','AREA_ONLY','OUTSIDE'));

create or replace function public.radar_enforce_operational_geo()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if new.is_test then
    new.priority := 'LOW'::public.radar_priority;
  end if;

  if new.distance_m is not null then
    if new.nearest_pool_id not in ('najda-street','ics-al-falah','ics-khalifa','ics-mushrif') then
      new.nearest_pool_id := null;
      new.nearest_pool_name := null;
      new.distance_m := null;
      new.proximity_tier := null;
      if not new.is_test then new.priority := 'LOW'::public.radar_priority; end if;
    else
      new.proximity_tier := case
        when new.distance_m <= 500 then 'VERY_CLOSE'
        when new.distance_m <= 2000 then 'NEAR'
        when new.distance_m <= 5000 then 'LOCAL'
        when new.distance_m <= 8000 then 'EXTENDED'
        else 'OUTSIDE'
      end;
      if new.distance_m > 8000 and not new.is_test then
        new.priority := 'LOW'::public.radar_priority;
      end if;
    end if;
  elsif new.area_hint = 'najda' then
    new.nearest_pool_id := 'najda-street'; new.nearest_pool_name := 'ICS Al Najda'; new.proximity_tier := 'AREA_ONLY';
  elsif new.area_hint = 'al_falah' then
    new.nearest_pool_id := 'ics-al-falah'; new.nearest_pool_name := 'ICS Al Falah'; new.proximity_tier := 'AREA_ONLY';
  elsif new.area_hint = 'khalifa_city' then
    new.nearest_pool_id := 'ics-khalifa'; new.nearest_pool_name := 'ICS Khalifa'; new.proximity_tier := 'AREA_ONLY';
  elsif new.area_hint = 'al_mushrif' then
    new.nearest_pool_id := 'ics-mushrif'; new.nearest_pool_name := 'ICS Al Mushrif'; new.proximity_tier := 'AREA_ONLY';
  else
    new.nearest_pool_id := null; new.nearest_pool_name := null; new.proximity_tier := null;
    if not new.is_test then new.priority := 'LOW'::public.radar_priority; end if;
  end if;

  return new;
end;
$function$;

create or replace function public.ingest_radar_candidate(
  p_source text,
  p_source_type text,
  p_text_excerpt text,
  p_source_url text default null,
  p_external_id text default null,
  p_published_at timestamptz default null,
  p_raw_metadata jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_text text := btrim(coalesce(p_text_excerpt, ''));
  v_norm text;
  v_fingerprint text;
  v_language text;
  v_area jsonb;
  v_area_hint text;
  v_location_hint text;
  v_high_intent boolean;
  v_noise boolean;
  v_service_intent text;
  v_score integer := 0;
  v_priority public.radar_priority := 'LOW';
  v_reason text[] := array[]::text[];
  v_existing_id uuid;
  v_opportunity_id uuid;
  v_pool_id text;
  v_pool_name text;
  v_source_lat double precision;
  v_source_lng double precision;
  v_distance_m integer;
  v_proximity_tier text;
  v_is_test boolean := false;
  v_area_is_approved boolean := false;
  v_has_public_geo boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if v_text = '' or coalesce(btrim(p_source), '') = '' then
    return jsonb_build_object('success', false, 'code', 'INVALID_CANDIDATE');
  end if;

  v_norm := lower(regexp_replace(v_text, '[^[:alnum:]]+', ' ', 'g'));
  v_norm := btrim(regexp_replace(v_norm, '\s+', ' ', 'g'));
  v_fingerprint := case
    when coalesce(p_external_id, '') <> '' then 'ext:' || p_source || ':' || p_external_id
    when coalesce(p_source_url, '') <> '' then 'url:' || lower(btrim(p_source_url))
    else 'text:' || md5(v_norm)
  end;

  select id into v_existing_id
  from public.radar_opportunities
  where dedupe_fingerprint = v_fingerprint
  limit 1;
  if found then
    update public.radar_opportunities
    set duplicate_count = duplicate_count + 1, last_seen_at = now(), updated_at = now()
    where id = v_existing_id;
    return jsonb_build_object('success', true, 'code', 'DUPLICATE', 'opportunityId', v_existing_id);
  end if;

  v_language := case when v_text ~ '[ء-ي]' then 'ar' else 'en' end;
  v_is_test := coalesce(p_raw_metadata->>'test','false') = 'true'
               or coalesce(p_source_url,'') like 'https://example.invalid/%'
               or v_text ilike '%SYNTHETIC%'
               or v_text ilike '%TEST_RADAR_%'
               or v_text ilike '%RADAR ACCEPTANCE TEST%'
               or v_text ilike '%RADAR A1A2 VERIFICATION%';

  v_area := public.rf_match_customer_area(v_text);
  if v_area is not null then
    v_area_hint := v_area->>'id';
    v_location_hint := coalesce(v_area->>'labelAr', v_area->>'labelEn');
  end if;

  if v_area_hint = 'najda' or v_text ~* '(ICS[[:space:]]*Al[[:space:]]*Najda|Al[[:space:]]*Najda|Najda|النجدة|نجدة|Al[[:space:]]*Danah|الدانة)' then
    v_area_hint := 'najda'; v_pool_id := 'najda-street'; v_pool_name := 'ICS Al Najda'; v_area_is_approved := true;
  elsif v_area_hint = 'al_falah' or v_text ~* '(ICS[[:space:]]*Al[[:space:]]*Falah|Al[[:space:]]*Falah|الفلاح|فلاح)' then
    v_area_hint := 'al_falah'; v_pool_id := 'ics-al-falah'; v_pool_name := 'ICS Al Falah'; v_area_is_approved := true;
  elsif v_area_hint = 'khalifa_city' or v_text ~* '(ICS[[:space:]]*Khalifa|Khalifa[[:space:]]*City|مدينة[[:space:]]*خليفة|خليفة[[:space:]]*سيتي)' then
    v_area_hint := 'khalifa_city'; v_pool_id := 'ics-khalifa'; v_pool_name := 'ICS Khalifa'; v_area_is_approved := true;
  elsif v_area_hint = 'al_mushrif' or v_text ~* '(ICS[[:space:]]*(Al[[:space:]]*)?Mushrif|Al[[:space:]]*Mushrif|المشرف|مشرف)' then
    v_area_hint := 'al_mushrif'; v_pool_id := 'ics-mushrif'; v_pool_name := 'ICS Al Mushrif'; v_area_is_approved := true;
  end if;

  begin
    v_has_public_geo := coalesce((p_raw_metadata->>'location_is_public')::boolean, false)
                        or lower(coalesce(p_raw_metadata->>'location_provenance','')) in ('public','public_source');
    if v_has_public_geo and p_raw_metadata ? 'lat' and p_raw_metadata ? 'lng' then
      v_source_lat := (p_raw_metadata->>'lat')::double precision;
      v_source_lng := (p_raw_metadata->>'lng')::double precision;
    elsif v_has_public_geo and p_raw_metadata ? 'latitude' and p_raw_metadata ? 'longitude' then
      v_source_lat := (p_raw_metadata->>'latitude')::double precision;
      v_source_lng := (p_raw_metadata->>'longitude')::double precision;
    end if;
  exception when others then
    v_source_lat := null; v_source_lng := null; v_has_public_geo := false;
  end;

  if v_has_public_geo and v_source_lat between -90 and 90 and v_source_lng between -180 and 180 then
    select x.pool_id, x.pool_name,
           round(6371000 * 2 * asin(sqrt(
             power(sin(radians(v_source_lat - x.lat)/2),2) +
             cos(radians(x.lat))*cos(radians(v_source_lat))*power(sin(radians(v_source_lng - x.lng)/2),2)
           )))::integer
      into v_pool_id, v_pool_name, v_distance_m
    from (values
      ('najda-street','ICS Al Najda',24.4870625::double precision,54.3754375::double precision),
      ('ics-al-falah','ICS Al Falah',24.43828::double precision,54.73116::double precision),
      ('ics-khalifa','ICS Khalifa',24.411589::double precision,54.605311::double precision),
      ('ics-mushrif','ICS Al Mushrif',24.43450::double precision,54.39804::double precision)
    ) as x(pool_id,pool_name,lat,lng)
    order by 6371000 * 2 * asin(sqrt(
      power(sin(radians(v_source_lat - x.lat)/2),2) +
      cos(radians(x.lat))*cos(radians(v_source_lat))*power(sin(radians(v_source_lng - x.lng)/2),2)
    ))
    limit 1;

    v_proximity_tier := case
      when v_distance_m <= 500 then 'VERY_CLOSE'
      when v_distance_m <= 2000 then 'NEAR'
      when v_distance_m <= 5000 then 'LOCAL'
      when v_distance_m <= 8000 then 'EXTENDED'
      else 'OUTSIDE'
    end;
  elsif v_area_is_approved then
    v_proximity_tier := 'AREA_ONLY';
  end if;

  v_noise := v_text ~* '(championship|tournament|olympic|olympics|world record|swim meet|gala|final results|league|بطولة|منتخب|أولمبياد|رقم قياسي|نتائج نهائية|دوري)'
             and not (v_text ~* '(coach|lesson|class|private|book|price|cost|أسعار|سعر|حصة|حصص|درس|دروس|مدرب|احجز|حجز)');
  v_high_intent := v_text ~* '(looking for|need a|want a|any recommendation|recommend a|anyone know|private (swim|swimming)|swim(ming)? (lesson|lessons|class|classes|coach|coaching|instructor)|kids? swim|my (son|daughter|kid|child).*(swim|water|scared|afraid)|swim.*(price|cost|near me)|beginner.*(swim|lesson)|(available|availability|slots?|when can|do you have).*(swim|lesson|coach|class)|أبي مدرب|أبغى مدرب|حد يعرف مدرب|مين يعرف مدرب|مدرب سباحة|مدرس سباحة|دروس سباحة|حصص سباحة|كورس سباحة|تعليم سباحة|يخاف من الماء|خايف من المويه|ولدي يخاف|بنتي تخاف|أبحث عن مدرب|محتاج مدرب|ابغى حصص|عايز مدرب|عايزة مدرب|فيه أماكن|متاح|مواعيد متاحة|mudarrib|mudarrisa|sibaha)'
                  or (v_text ~* '(swim|سباح|عوم|sباح)' and v_text ~* '(price|cost|how much|بكام|سعر|أسعار|near|قريب|أقرب)');
  v_service_intent := case
    when v_text ~* '(private|خاص|فردي)' then 'private'
    when v_text ~* '(group|مجموعة|جماعي)' then 'group'
    when v_text ~* '(afraid|scared|fear|يخاف|خايف|خوف)' then 'fear_of_water'
    else null
  end;

  if v_noise and not v_high_intent then
    v_score := 5;
    v_reason := array_append(v_reason, case when v_language='ar' then 'محتوى عام بدون نية شراء واضحة' else 'General content with no clear buyer intent' end);
  else
    if v_high_intent then v_score := v_score + 60; end if;
    if v_service_intent is not null then v_score := v_score + 10; end if;
    if v_proximity_tier = 'VERY_CLOSE' then v_score := v_score + 30;
    elsif v_proximity_tier = 'NEAR' then v_score := v_score + 25;
    elsif v_proximity_tier = 'LOCAL' then v_score := v_score + 20;
    elsif v_proximity_tier = 'EXTENDED' then v_score := v_score + 10;
    elsif v_proximity_tier = 'AREA_ONLY' then v_score := v_score + 20;
    end if;
  end if;

  v_score := least(v_score,100);
  v_priority := case
    when v_is_test then 'LOW'::public.radar_priority
    when v_high_intent and v_proximity_tier in ('VERY_CLOSE','NEAR','LOCAL','AREA_ONLY') and v_score >= 70 then 'HOT'::public.radar_priority
    when v_high_intent and v_proximity_tier = 'EXTENDED' then 'WARM'::public.radar_priority
    else 'LOW'::public.radar_priority
  end;

  insert into public.radar_opportunities (
    source,source_type,source_url,external_id,published_at,text_excerpt,language,
    location_hint,area_hint,service_intent,buyer_intent_score,priority,reason,dedupe_fingerprint,raw_metadata,
    is_test,nearest_pool_id,nearest_pool_name,distance_m,proximity_tier
  ) values (
    p_source,p_source_type,p_source_url,p_external_id,p_published_at,left(v_text,2000),v_language,
    v_location_hint,v_area_hint,v_service_intent,v_score,v_priority,array_to_string(v_reason,' · '),v_fingerprint,p_raw_metadata,
    v_is_test,v_pool_id,v_pool_name,v_distance_m,v_proximity_tier
  ) returning id into v_opportunity_id;

  return jsonb_build_object(
    'success',true,'code','INGESTED','opportunityId',v_opportunity_id,'priority',v_priority,'score',v_score,
    'nearestPoolId',v_pool_id,'nearestPoolName',v_pool_name,'distanceM',v_distance_m,'proximityTier',v_proximity_tier,'isTest',v_is_test
  );
end;
$function$;
