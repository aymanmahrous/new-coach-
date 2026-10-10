import { corsHeaders as supabaseCorsHeaders } from "jsr:@supabase/supabase-js@2/cors";

export const CANVA_CORS_HEADERS = {
  ...supabaseCorsHeaders,
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export type CanvaAction = "status" | "authorize";

type GateResult<T> = { ok: true; value: T } | { ok: false; response: Response };

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ success: false, code }), {
    status,
    headers: { "content-type": "application/json", ...CANVA_CORS_HEADERS },
  });
}

export function requireCanvaBearer(request: Request): GateResult<string> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  return token
    ? { ok: true, value: token }
    : { ok: false, response: jsonError("AUTH_REQUIRED", 400) };
}

export async function parseCanvaAction(request: Request): Promise<GateResult<CanvaAction>> {
  const body: unknown = await request.json().catch(() => ({}));
  if (body && typeof body === "object" && "mode" in body) {
    const mode = (body as { mode?: unknown }).mode;
    if (mode === "status" || mode === "authorize") {
      return { ok: true, value: mode };
    }
  }
  return { ok: false, response: jsonError("INVALID_INPUT", 400) };
}
