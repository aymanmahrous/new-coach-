import type { ContentBatchItem } from "./content-batch";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const SUPABASE_PUBLIC_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

type GeminiImageSession = { accessToken: string };
type GeminiImageResponse = {
  success?: boolean;
  code?: string;
  detail?: string;
  providerStatus?: number;
  model?: string;
  estimatedCostUsd?: number;
  mediaAssetId?: string;
  storagePath?: string;
};

async function callGeminiImageEdge(session: GeminiImageSession, body: Record<string, unknown>): Promise<GeminiImageResponse> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-gemini-image`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLIC_KEY,
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) throw new Error("SESSION_EXPIRED");
  const result = await response.json().catch(() => ({})) as GeminiImageResponse;
  if (!response.ok || result.success !== true) {
    const code = typeof result.code === "string" ? result.code : `GEMINI_IMAGE_FAILED_${response.status}`;
    const providerStatus = typeof result.providerStatus === "number" ? ` (Google HTTP ${result.providerStatus})` : "";
    const detail = typeof result.detail === "string" ? result.detail.trim().slice(0, 160) : "";
    throw new Error([code + providerStatus, detail].filter(Boolean).join(": "));
  }
  return result;
}

function buildImagePrompt(item: ContentBatchItem) {
  return [
    typeof item.visualPrompt === "string" ? item.visualPrompt : "",
    typeof item.topic === "string" ? `Topic: ${item.topic}` : "",
    typeof item.hook === "string" ? `Headline direction: ${item.hook}` : "",
    typeof item.caption === "string" ? `Caption context: ${item.caption.slice(0, 1200)}` : "",
  ].filter(Boolean).join("\n\n").slice(0, 5000);
}

export async function estimateGeminiImageGeneration(session: GeminiImageSession): Promise<{ estimatedCostUsd: number; model: string }> {
  const result = await callGeminiImageEdge(session, { mode: "estimate" });
  if (typeof result.estimatedCostUsd !== "number") throw new Error("GEMINI_IMAGE_ESTIMATE_MISSING");
  return {
    estimatedCostUsd: result.estimatedCostUsd,
    model: typeof result.model === "string" ? result.model : "gemini-nano-banana-2.1",
  };
}

export async function generateGeminiImageForContentItem(session: GeminiImageSession, item: ContentBatchItem): Promise<{ mediaAssetId: string }> {
  const result = await callGeminiImageEdge(session, {
    mode: "generate",
    contentItemId: item.id,
    prompt: buildImagePrompt(item),
  });
  if (typeof result.mediaAssetId !== "string" || !result.mediaAssetId) throw new Error("GEMINI_IMAGE_MEDIA_ASSET_MISSING");
  return { mediaAssetId: result.mediaAssetId };
}

export function geminiImageDesignErrorMessage(code: string | undefined, language: "ar" | "en"): string {
  const messages: Record<string, { ar: string; en: string }> = {
    GEMINI_CREDENTIAL_MISSING: { ar: "Gemini غير مهيأ على الخادم؛ لم تُنشأ صورة.", en: "Gemini image generation isn't configured; no image was created." },
    GEMINI_IMAGE_ESTIMATE_MISSING: { ar: "تعذر تأكيد التكلفة.", en: "Could not confirm the estimated cost." },
    GEMINI_IMAGE_REQUEST_FAILED: { ar: "رفض Google طلب الصورة.", en: "Google rejected the image request." },
    GEMINI_IMAGE_MISSING: { ar: "لم يُرجع Gemini صورة صالحة.", en: "Gemini returned no valid image." },
    MEDIA_STORAGE_UPLOAD_FAILED: { ar: "تعذر حفظ الصورة في المكتبة.", en: "Could not save the image to Media Library." },
    MEDIA_REGISTER_FAILED: { ar: "تعذر تسجيل الصورة في المكتبة.", en: "Could not register the image in Media Library." },
    MEDIA_ASSET_NOT_PUBLISHABLE: { ar: "الصورة محفوظة، لكن ضوابط المكتبة منعت الربط.", en: "Image saved; Media Library safeguards blocked linking." },
    MEDIA_ASSET_ALREADY_LINKED: { ar: "الصورة مرتبطة بمحتوى آخر.", en: "Image is already linked to other content." },
    CONTENT_ITEM_NOT_FOUND: { ar: "عنصر المحتوى غير موجود؛ لم يُطلب التوليد.", en: "Content item not found; generation was not requested." },
    CONTENT_ITEM_READ_FAILED: { ar: "تعذر التحقق من المحتوى؛ لم يُطلب التوليد.", en: "Could not validate content; generation was not requested." },
    PUBLISHED_CONTENT_IMMUTABLE: { ar: "المحتوى منشور؛ لا يمكن تغيير وسائطه.", en: "Content is published; its media cannot be changed." },
  };
  if (code === "SESSION_EXPIRED") return language === "ar" ? "انتهت الجلسة؛ سجّل الدخول مجددًا." : "Session expired; sign in again.";
  const key = code?.split(/[ (:]/, 1)[0] ?? "";
  const message = messages[key]?.[language] ?? code ?? (language === "ar" ? "تعذر إنشاء الصورة." : "Image generation failed.");
  const detail = key === "GEMINI_IMAGE_REQUEST_FAILED" && code?.includes(":")
    ? code.slice(code.indexOf(":") + 1).trim().slice(0, 100)
    : "";
  return detail ? `${message} — ${detail}` : message;
}
