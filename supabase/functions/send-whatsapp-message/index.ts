import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WHATSAPP_TOKEN = (Deno.env.get("WHATSAPP_CLOUD_ACCESS_TOKEN") ?? Deno.env.get("META_WHATSAPP_ACCESS_TOKEN") ?? "").trim();
const PHONE_NUMBER_ID = (Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "100566230597045").trim();
const DRY_RUN = (Deno.env.get("WHATSAPP_SEND_DRY_RUN") ?? "true").trim().toLowerCase() === "true";
const ALLOWED_ROLES = new Set(["super_admin", "admin", "reception", "content_manager"]);
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

type JsonObject = Record<string, unknown>;

function json(body: JsonObject, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

async function loadStaff(accessToken: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) return null;
  const user = await response.json() as { id?: string };
  if (!user.id) return null;

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await service
    .from(Deno.env.get("STAFF_PROFILE_TABLE") ?? "staff_profiles")
    .select("display_name, role, active")
    .eq("id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (error || !data || !ALLOWED_ROLES.has(String(data.role))) return null;
  return { userId: user.id, role: String(data.role), displayName: String(data.display_name ?? "Staff") };
}

async function assertSendAllowed(service: ReturnType<typeof createClient>, conversationId: string, body: string) {
  const { data, error } = await service.rpc("assert_staff_whatsapp_send_allowed", {
    p_conversation_id: conversationId,
    p_body: body,
  });
  if (error) throw new Error(error.message);
  return data as JsonObject;
}

async function recordOutbound(
  service: ReturnType<typeof createClient>,
  conversationId: string,
  body: string,
  externalMessageId: string,
  staffUserId: string,
  staffRole: string,
) {
  const { data, error } = await service.rpc("record_staff_whatsapp_outbound", {
    p_conversation_id: conversationId,
    p_body: body,
    p_external_message_id: externalMessageId,
    p_staff_user_id: staffUserId,
    p_staff_role: staffRole,
  });
  if (error) throw new Error(error.message);
  return data as JsonObject;
}

async function sendViaWhatsAppCloud(recipientPhone: string, body: string) {
  if (DRY_RUN || !WHATSAPP_TOKEN) {
    return {
      dryRun: true,
      externalMessageId: `dry_run_${crypto.randomUUID()}`,
    };
  }

  const response = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: recipientPhone,
      type: "text",
      text: { body },
    }),
  });

  const payload = await response.json() as JsonObject;
  if (!response.ok) {
    const message = typeof payload.error === "object" && payload.error && "message" in payload.error
      ? String((payload.error as JsonObject).message)
      : "WHATSAPP_SEND_FAILED";
    throw new Error(message);
  }

  const messages = payload.messages as Array<{ id?: string }> | undefined;
  return {
    dryRun: false,
    externalMessageId: messages?.[0]?.id ?? `wa_${crypto.randomUUID()}`,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ success: false, code: "METHOD_NOT_ALLOWED" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ success: false, code: "CONFIGURATION_REQUIRED" }, 500);

  const accessToken = bearerToken(request);
  if (!accessToken) return json({ success: false, code: "UNAUTHORIZED" }, 401);

  const staff = await loadStaff(accessToken);
  if (!staff) return json({ success: false, code: "STAFF_ACCESS_DENIED" }, 403);

  let payload: { conversationId?: string; body?: string };
  try {
    payload = await request.json();
  } catch {
    return json({ success: false, code: "INVALID_JSON" }, 400);
  }

  const conversationId = String(payload.conversationId ?? "").trim();
  const body = String(payload.body ?? "").trim();
  if (!conversationId || !body) return json({ success: false, code: "INVALID_REQUEST" }, 400);

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const allowed = await assertSendAllowed(service, conversationId, body);
    if (!allowed.success) return json(allowed, 400);

    const recipientPhone = String(allowed.recipientPhone ?? "");
    const sendResult = await sendViaWhatsAppCloud(recipientPhone, body);
    const recorded = await recordOutbound(
      service,
      conversationId,
      body,
      sendResult.externalMessageId,
      staff.userId,
      staff.role,
    );

    return json({
      success: true,
      code: sendResult.dryRun ? "DRY_RUN_RECORDED" : "MESSAGE_SENT",
      conversationId,
      messageId: recorded.messageId,
      dryRun: sendResult.dryRun,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SEND_FAILED";
    return json({ success: false, code: "SEND_FAILED", message }, 500);
  }
});
