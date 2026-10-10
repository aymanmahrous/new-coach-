// supabase/functions/safe-content-publisher/index.ts
//
// Publishes ONE approved content_items row to Meta (Facebook Page and/or
// Instagram Business Account) via the Graph API, then records the outcome
// through `record_staff_content_publish_result` — called with the CALLING
// STAFF MEMBER'S OWN JWT, never service-role — so the write still goes
// through an RPC and lands in the Audit Log, same contract as every other
// mutation in this app.
//
// v1 scope only: immediate "Publish now" for content_items.status ===
// 'approved'. No scheduling here. No Instagram cron/poller.
//
// Secrets (set directly in this project, read only via Deno.env.get, never
// logged, never returned in any response, never written to the Audit Log):
//   FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN,
//   INSTAGRAM_ACCOUNT_ID, INSTAGRAM_ACCESS_TOKEN,
//   META_APP_SECRET, CONTENT_PUBLISHER_AUTOMATION_SECRET

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") ?? "v21.0";
const FACEBOOK_PAGE_ID = Deno.env.get("FACEBOOK_PAGE_ID");
const FACEBOOK_PAGE_ACCESS_TOKEN = Deno.env.get("FACEBOOK_PAGE_ACCESS_TOKEN");
const INSTAGRAM_ACCOUNT_ID = Deno.env.get("INSTAGRAM_ACCOUNT_ID");
const INSTAGRAM_ACCESS_TOKEN = Deno.env.get("INSTAGRAM_ACCESS_TOKEN");
const CONTENT_PUBLISHER_AUTOMATION_SECRET = Deno.env.get("CONTENT_PUBLISHER_AUTOMATION_SECRET");

type MetaCredential = { token: string; facebookPageId?: string; instagramAccountId?: string };

async function readConnectedMetaCredential(provider: "facebook" | "instagram"): Promise<MetaCredential | null> {
  const integrationResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/staff_integrations?provider=eq.${provider}&select=id,metadata,status&limit=1`,
    { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
  );
  if (!integrationResponse.ok) return null;
  const integrations = await integrationResponse.json().catch(() => []);
  const integration = integrations[0] as { id?: string; status?: string; metadata?: Record<string, unknown> } | undefined;
  if (!integration?.id || !["connected", "needs_test", "pending"].includes(String(integration.status ?? ""))) return null;
  const secretResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/staff_integration_secrets?integration_id=eq.${encodeURIComponent(integration.id)}&select=secret_value&limit=1`,
    { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
  );
  if (!secretResponse.ok) return null;
  const secrets = await secretResponse.json().catch(() => []);
  const token = String((secrets[0] as { secret_value?: unknown } | undefined)?.secret_value ?? "").trim();
  if (!token) return null;
  const metadata = integration.metadata ?? {};
  return {
    token,
    facebookPageId: typeof metadata.facebookPageId === "string" ? metadata.facebookPageId : undefined,
    instagramAccountId: typeof metadata.instagramAccountId === "string" ? metadata.instagramAccountId : undefined,
  };
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-content-publisher-automation-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const JSON_HEADERS = { "Content-Type": "application/json", ...CORS_HEADERS };

function fail(code: string, status = 400) {
  return new Response(JSON.stringify({ success: false, code }), { status, headers: JSON_HEADERS });
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  let diff = aBytes.length ^ bBytes.length;
  const length = Math.max(aBytes.length, bBytes.length);
  for (let i = 0; i < length; i++) diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  return diff === 0;
}

async function readContentItem(contentItemId: string, authToken: string, useServiceRole: boolean) {
  const key = useServiceRole ? SUPABASE_SERVICE_ROLE_KEY : SUPABASE_ANON_KEY;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/content_items?id=eq.${encodeURIComponent(contentItemId)}&select=id,status,platform,caption,hook,cta,hashtags,provider_external_id,media_asset_id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${authToken}` } });
  const items = response.ok ? await response.json() : [];
  return items[0] as { id: string; status: string; platform: string; caption: string; hook: string; cta: string; hashtags: string[]; provider_external_id?: string | null; media_asset_id?: string | null } | undefined;
}

async function readAutomationContentItem(contentItemId: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/content_items?id=eq.${encodeURIComponent(contentItemId)}&select=id,status,platform,caption,hook,cta,hashtags,provider_external_id,media_asset_id&limit=1`, { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } });
  if (!response.ok) throw new Error("CONTENT_READ_FAILED");
  const items = await response.json();
  return items[0] as { id: string; status: string; platform: string; caption: string; hook: string; cta: string; hashtags: string[]; provider_external_id?: string | null; media_asset_id?: string | null } | undefined;
}

async function readPublishJob(jobId: string, contentItemId: string, platform: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/background_jobs?id=eq.${encodeURIComponent(jobId)}&job_type=eq.publish_content&status=eq.processing&select=id,job_type,status,payload&limit=1`, { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } });
  if (!response.ok) throw new Error("PUBLISH_JOB_READ_FAILED");
  const jobs = await response.json();
  const job = jobs[0] as { id: string; job_type: string; status: string; payload?: { contentItemId?: string; platform?: string } } | undefined;
  if (!job || job.payload?.contentItemId !== contentItemId || String(job.payload?.platform ?? '').toLowerCase() !== platform) return null;
  return job;
}

async function callServiceRpc(functionName: string, body: Record<string, unknown>) {
  const response = await fetch(SUPABASE_URL + "/rest/v1/rpc/" + functionName, {
    method: "POST",
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error("RPC_" + functionName + "_FAILED");
  return data as Record<string, unknown>;
}

async function claimPublicationReceipt(contentItemId: string, platform: string) {
  return callServiceRpc("claim_publication_receipt", { p_content_item_id: contentItemId, p_platform: platform, p_provider: "meta-graph-publishing" });
}

async function completePublicationReceipt(contentItemId: string, platform: string, externalPostId: string) {
  return callServiceRpc("complete_publication_receipt", { p_content_item_id: contentItemId, p_platform: platform, p_provider: "meta-graph-publishing", p_external_post_id: externalPostId });
}

async function markPublicationReceiptAmbiguous(contentItemId: string, platform: string, error: string) {
  return callServiceRpc("mark_publication_receipt_ambiguous", { p_content_item_id: contentItemId, p_platform: platform, p_provider: "meta-graph-publishing", p_error: error });
}

async function publishAutomation(req: Request): Promise<Response> {
  let contentItemId: string;
  let jobId: string;
  try {
    const body = await req.json();
    if (typeof body?.contentItemId !== "string" || !body.contentItemId || typeof body?.jobId !== "string" || !body.jobId) throw new Error("missing job identity");
    contentItemId = body.contentItemId;
    jobId = body.jobId;
  } catch { return fail("INVALID_ACTION", 400); }
  let item: Awaited<ReturnType<typeof readAutomationContentItem>>;
  let job: Awaited<ReturnType<typeof readPublishJob>>;
  let receipt: Record<string, unknown>;
  try {
    item = await readAutomationContentItem(contentItemId);
    if (!item) return fail("NOT_FOUND", 404);
    const platform = String(item.platform ?? "").toLowerCase();
    if (platform !== "facebook" && platform !== "instagram") return fail("UNSUPPORTED_PLATFORM", 400);
    job = await readPublishJob(jobId, contentItemId, platform);
    if (!job) return fail("INVALID_PUBLISH_JOB", 409);
    if (item.status !== "approved" && item.status !== "scheduled") return fail("INVALID_TRANSITION", 409);
    receipt = await claimPublicationReceipt(contentItemId, platform);
  } catch {
    return new Response(JSON.stringify({ success: false, ambiguous: true, code: "AMBIGUOUS_RESULT", jobId }), { status: 504, headers: JSON_HEADERS });
  }
  const platform = String(item.platform ?? "").toLowerCase();
  if (platform !== "facebook" && platform !== "instagram") return fail("UNSUPPORTED_PLATFORM", 400);
  if (!job) return fail("INVALID_PUBLISH_JOB", 409);

  const receiptStatus = String(receipt.status ?? "");
  const receiptExternalPostId = typeof receipt.externalPostId === "string" ? receipt.externalPostId.trim() : "";
  const connectedCredential = await readConnectedMetaCredential(platform as "facebook" | "instagram");
  const pageId = connectedCredential?.facebookPageId ?? FACEBOOK_PAGE_ID;
  const instagramAccountId = connectedCredential?.instagramAccountId ?? INSTAGRAM_ACCOUNT_ID;
  const accessToken = connectedCredential?.token ?? (platform === "facebook" ? FACEBOOK_PAGE_ACCESS_TOKEN : INSTAGRAM_ACCESS_TOKEN);
  if (receiptStatus === "published" && receiptExternalPostId) {
    return new Response(JSON.stringify({ success: true, alreadyPublished: true, providerExternalId: receiptExternalPostId, platform, jobId }), { status: 200, headers: JSON_HEADERS });
  }
  if (receiptStatus === "ambiguous") {
    return new Response(JSON.stringify({ success: false, ambiguous: true, code: "AMBIGUOUS_RESULT", jobId, platform }), { status: 504, headers: JSON_HEADERS });
  }
  if (receiptStatus === "failed") {
    return new Response(JSON.stringify({ success: false, confirmed: true, code: "PUBLICATION_RECEIPT_FAILED", jobId, platform }), { status: 502, headers: JSON_HEADERS });
  }
  if (platform === "facebook" && (!pageId || !accessToken)) return fail("META_NOT_CONFIGURED", 500);
  if (platform === "instagram" && (!instagramAccountId || !accessToken)) return fail("META_NOT_CONFIGURED", 500);
  const media = await resolveSignedMediaUrl(item.media_asset_id, SUPABASE_SERVICE_ROLE_KEY, true);
  if ((platform === "instagram" || platform === "facebook") && !media) return fail("MEDIA_MISSING", 422);
  const caption = [item.hook, item.caption, item.cta, (item.hashtags ?? []).map((tag) => `#${tag}`).join(" " )].filter(Boolean).join("\n\n").slice(0, 5000);
  let publishResult: PublishOutcome;
  try {
    publishResult = platform === "facebook"
      ? await publishToFacebook(caption, media?.url ?? null, pageId, accessToken, media?.assetType)
      : await publishToInstagram(caption, media?.url ?? null, instagramAccountId, accessToken, media?.assetType);
  } catch (cause) {
    console.error("safe-content-publisher: ambiguous automation result", { contentItemId, jobId, platform, error: cause instanceof Error ? cause.name : "NETWORK_ERROR" });
    try {
      await markPublicationReceiptAmbiguous(contentItemId, platform, cause instanceof Error ? cause.name : "NETWORK_ERROR");
    } catch (receiptError) {
      console.error("safe-content-publisher: failed to mark receipt ambiguous", { contentItemId, jobId, platform, error: receiptError instanceof Error ? receiptError.name : "RECEIPT_MARK_FAILED" });
    }
    return new Response(JSON.stringify({ success: false, ambiguous: true, code: "AMBIGUOUS_RESULT", jobId, platform }), { status: 504, headers: JSON_HEADERS });
  }
  if (!publishResult.success || !publishResult.providerExternalId) {
    return new Response(JSON.stringify({ success: false, confirmed: true, code: publishResult.errorCode ?? "META_API_ERROR", jobId, platform }), { status: 502, headers: JSON_HEADERS });
  }

  try {
    await completePublicationReceipt(contentItemId, platform, publishResult.providerExternalId);
  } catch (cause) {
    console.error("safe-content-publisher: publication succeeded but receipt completion was ambiguous", { contentItemId, jobId, platform, error: cause instanceof Error ? cause.name : "RECEIPT_COMPLETE_FAILED" });
    try {
      await markPublicationReceiptAmbiguous(contentItemId, platform, "RECEIPT_COMPLETE_FAILED");
    } catch (receiptError) {
      console.error("safe-content-publisher: failed to mark receipt ambiguous after completion failure", { contentItemId, jobId, platform, error: receiptError instanceof Error ? receiptError.name : "RECEIPT_MARK_FAILED" });
    }
    return new Response(JSON.stringify({ success: false, ambiguous: true, code: "AMBIGUOUS_RESULT", jobId, platform }), { status: 504, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ success: true, providerExternalId: publishResult.providerExternalId, platform, jobId }), { status: 200, headers: JSON_HEADERS });
}

 type PublishOutcome = { success: boolean; providerExternalId?: string; errorCode?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);
  const automationHeader = req.headers.get("x-content-publisher-automation-secret");
  if (automationHeader !== null) {
    if (!CONTENT_PUBLISHER_AUTOMATION_SECRET || !constantTimeEqual(automationHeader, CONTENT_PUBLISHER_AUTOMATION_SECRET)) return fail("UNAUTHORIZED", 401);
    return publishAutomation(req);
  }
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return fail("SESSION_EXPIRED", 401);
  const staffJwt = authHeader.slice("Bearer ".length);
  let contentItemId: string;
  try { const body = await req.json(); if (typeof body?.contentItemId !== "string" || !body.contentItemId) throw new Error("missing contentItemId"); contentItemId = body.contentItemId; } catch { return fail("INVALID_ACTION", 400); }
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${staffJwt}` } });
  if (!userResponse.ok) return fail("SESSION_EXPIRED", 401);
  const user = (await userResponse.json()) as { id: string };
  const profileResponse = await fetch(`${SUPABASE_URL}/rest/v1/staff_profiles?id=eq.${encodeURIComponent(user.id)}&select=role,active&limit=1`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${staffJwt}` } });
  const profiles = profileResponse.ok ? await profileResponse.json() : [];
  const profile = profiles[0] as { role?: string; active?: boolean } | undefined;
  const canPublish = profile?.active === true && ["super_admin", "admin", "content_manager"].includes(profile?.role ?? "");
  if (!canPublish) return fail("STAFF_ACCESS_DENIED", 403);
  const item = await readContentItem(contentItemId, staffJwt, false);
  if (!item) return fail("NOT_FOUND", 404);
  if (item.status !== "approved") return fail("INVALID_TRANSITION", 409);
  const platform = String(item.platform ?? "").toLowerCase();
  if (platform !== "facebook" && platform !== "instagram") return fail("UNSUPPORTED_PLATFORM", 400);
  const connectedCredential = await readConnectedMetaCredential(platform as "facebook" | "instagram");
  const pageId = connectedCredential?.facebookPageId ?? FACEBOOK_PAGE_ID;
  const instagramAccountId = connectedCredential?.instagramAccountId ?? INSTAGRAM_ACCOUNT_ID;
  const accessToken = connectedCredential?.token ?? (platform === "facebook" ? FACEBOOK_PAGE_ACCESS_TOKEN : INSTAGRAM_ACCESS_TOKEN);
  if (platform === "facebook" && (!pageId || !accessToken)) return fail("META_NOT_CONFIGURED", 500);
  if (platform === "instagram" && (!instagramAccountId || !accessToken)) return fail("META_NOT_CONFIGURED", 500);
  const media = await resolveSignedMediaUrl(item.media_asset_id, staffJwt, false);
  if ((platform === "instagram" || platform === "facebook") && !media) return fail("MEDIA_MISSING", 422);
  const caption = [item.hook, item.caption, item.cta, (item.hashtags ?? []).map((tag) => `#${tag}`).join(" " )].filter(Boolean).join("\n\n").slice(0, 5000);
  let publishResult: PublishOutcome;
  try {
    publishResult = platform === "facebook"
      ? await publishToFacebook(caption, media?.url ?? null, pageId, accessToken, media?.assetType)
      : await publishToInstagram(caption, media?.url ?? null, instagramAccountId, accessToken, media?.assetType);
  } catch { publishResult = { success: false, errorCode: "META_API_ERROR" }; }
  const recordResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_staff_content_publish_result`, { method: "POST", headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${staffJwt}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_content_item_id: contentItemId, p_success: publishResult.success, p_provider_external_id: publishResult.providerExternalId ?? null, p_platform: platform, p_error_code: publishResult.errorCode ?? null }) });
  const recorded = recordResponse.ok ? ((await recordResponse.json()) as { success: boolean }) : { success: false };
  if (!publishResult.success) { console.error("safe-content-publisher: Meta publish failed", { contentItemId, platform, errorCode: publishResult.errorCode }); return fail(publishResult.errorCode ?? "META_API_ERROR", 502); }
  if (!recorded.success) return fail("RECORD_FAILED", 500);
  return new Response(JSON.stringify({ success: true, providerExternalId: publishResult.providerExternalId, platform }), { status: 200, headers: JSON_HEADERS });
});

async function resolveSignedMediaUrl(
  mediaAssetId: string | null | undefined,
  authToken: string,
  useServiceRole: boolean,
): Promise<{ url: string; assetType: "image" | "video" } | null> {
  if (!mediaAssetId) return null;
  const key = useServiceRole ? SUPABASE_SERVICE_ROLE_KEY : SUPABASE_ANON_KEY;
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/media_assets?id=eq.${encodeURIComponent(mediaAssetId)}&select=storage_path,asset_type&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${authToken}` } },
  );
  if (!response.ok) return null;
  const assets = await response.json().catch(() => []);
  const asset = assets[0] as { storage_path?: string; asset_type?: string } | undefined;
  if (!asset?.storage_path) return null;
  const assetType = String(asset.asset_type ?? "").toLowerCase() === "video" ? "video" : "image";
  const bucket = "relax-fix-media";
  const signResponse = await fetch(
    `${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${asset.storage_path}`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: 3600 }),
    },
  );
  if (!signResponse.ok) return null;
  const signed = await signResponse.json().catch(() => null) as { signedURL?: string } | null;
  return signed?.signedURL
    ? { url: `${SUPABASE_URL}/storage/v1${signed.signedURL}`, assetType }
    : null;
}

async function hmacProof(accessToken: string): Promise<string> {
  const secret = Deno.env.get("META_APP_SECRET"); if (!secret) throw new Error("META_APP_SECRET_MISSING");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(accessToken));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function publishToFacebook(
  caption: string,
  mediaUrl: string | null,
  pageId = FACEBOOK_PAGE_ID,
  accessToken = FACEBOOK_PAGE_ACCESS_TOKEN,
  assetType: "image" | "video" = "image",
): Promise<PublishOutcome> {
  if (!pageId || !accessToken) return { success: false, errorCode: "META_NOT_CONFIGURED" };
  if (!mediaUrl) return { success: false, errorCode: "MEDIA_MISSING" };
  const proof = await hmacProof(accessToken);
  if (assetType === "video") {
    const params = new URLSearchParams({
      access_token: accessToken,
      appsecret_proof: proof,
      file_url: mediaUrl,
      title: caption.slice(0, 120),
      description: caption,
      published: "true",
    });
    const response = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${pageId}/videos`, { method: "POST", body: params });
    const data = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok || data?.error || !data?.id) return { success: false, errorCode: "META_VIDEO_API_ERROR" };
    return { success: true, providerExternalId: String(data.id) };
  }
  const params = new URLSearchParams({
    access_token: accessToken,
    appsecret_proof: proof,
    url: mediaUrl,
    caption,
    published: "true",
  });
  const response = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${pageId}/photos`, { method: "POST", body: params });
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || data?.error) return { success: false, errorCode: "META_API_ERROR" };
  return { success: true, providerExternalId: String(data?.post_id ?? data?.id) };
}

async function publishToInstagram(
  caption: string,
  mediaUrl: string | null,
  accountId = INSTAGRAM_ACCOUNT_ID,
  accessToken = INSTAGRAM_ACCESS_TOKEN,
  assetType: "image" | "video" = "image",
): Promise<PublishOutcome> {
  if (!mediaUrl) return { success: false, errorCode: "MEDIA_MISSING" };
  if (!accountId || !accessToken) return { success: false, errorCode: "META_NOT_CONFIGURED" };
  const proof = await hmacProof(accessToken);
  if (assetType === "video") {
    const createParams = new URLSearchParams({
      access_token: accessToken,
      appsecret_proof: proof,
      media_type: "REELS",
      video_url: mediaUrl,
      caption,
      share_to_feed: "true",
    });
    const createResponse = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${accountId}/media`, { method: "POST", body: createParams });
    const created = await createResponse.json().catch(() => null) as Record<string, unknown> | null;
    if (!createResponse.ok || created?.error || !created?.id) return { success: false, errorCode: "META_REEL_CREATE_FAILED" };
    const containerId = String(created.id);
    const maxAttempts = 36;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const statusResponse = await fetch(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}&appsecret_proof=${encodeURIComponent(proof)}`,
      );
      const statusData = await statusResponse.json().catch(() => null) as Record<string, unknown> | null;
      if (!statusResponse.ok || statusData?.error) return { success: false, errorCode: "META_REEL_STATUS_FAILED" };
      const statusCode = String(statusData?.status_code ?? "").toUpperCase();
      if (statusCode === "ERROR" || statusCode === "EXPIRED") return { success: false, errorCode: "META_REEL_PROCESSING_FAILED" };
      if (statusCode === "FINISHED") break;
      if (attempt === maxAttempts - 1) return { success: false, errorCode: "META_REEL_PROCESSING_TIMEOUT" };
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
    const publishParams = new URLSearchParams({
      access_token: accessToken,
      appsecret_proof: proof,
      creation_id: containerId,
    });
    const publishResponse = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${accountId}/media_publish`, { method: "POST", body: publishParams });
    const published = await publishResponse.json().catch(() => null) as Record<string, unknown> | null;
    if (!publishResponse.ok || published?.error || !published?.id) return { success: false, errorCode: "META_REEL_PUBLISH_FAILED" };
    return { success: true, providerExternalId: String(published.id) };
  }
  const createParams = new URLSearchParams({
    access_token: accessToken,
    appsecret_proof: proof,
    image_url: mediaUrl,
    caption,
  });
  const createResponse = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${accountId}/media`, { method: "POST", body: createParams });
  const created = await createResponse.json().catch(() => null) as Record<string, unknown> | null;
  if (!createResponse.ok || created?.error || !created?.id) return { success: false, errorCode: "META_API_ERROR" };
  const publishParams = new URLSearchParams({ access_token: accessToken, appsecret_proof: proof, creation_id: String(created.id) });
  const publishResponse = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${accountId}/media_publish`, { method: "POST", body: publishParams });
  const published = await publishResponse.json().catch(() => null) as Record<string, unknown> | null;
  if (!publishResponse.ok || published?.error || !published?.id) return { success: false, errorCode: "META_API_ERROR" };
  return { success: true, providerExternalId: String(published.id) };
}
