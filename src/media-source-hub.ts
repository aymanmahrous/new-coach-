export type MediaProviderKey = "google_drive" | "google_photos" | "dropbox" | "onedrive";
export type CreativeFormat = "instagram_reel" | "instagram_story" | "facebook_feed" | "tiktok_video" | "google_display";
export type ApprovalState = "needs_review" | "approved" | "blocked";

export type RemoteMediaItem = {
  id: string;
  provider: MediaProviderKey;
  name: string;
  mimeType: string;
  webUrl: string;
  previewUrl?: string;
  sizeBytes?: number;
  createdAt?: string;
  folder?: string;
  consent: ApprovalState;
};

export type ProviderConnection = {
  key: MediaProviderKey;
  label: string;
  connected: boolean;
  configured: boolean;
  detail: string;
  authScope: string;
};

export type CreativeBrief = {
  sourceId: string;
  language: "ar" | "en";
  objective: string;
  primaryText: string;
  headline: string;
  callToAction: string;
  formats: CreativeFormat[];
  compliance: string[];
  approval: ApprovalState;
};

export const MEDIA_PROVIDER_LABELS: Record<MediaProviderKey, string> = {
  google_drive: "Google Drive",
  google_photos: "Google Photos",
  dropbox: "Dropbox",
  onedrive: "OneDrive",
};

export const CREATIVE_FORMAT_LABELS: Record<CreativeFormat, string> = {
  instagram_reel: "Instagram Reel 9:16",
  instagram_story: "Instagram Story 9:16",
  facebook_feed: "Facebook Feed 4:5",
  tiktok_video: "TikTok Video 9:16",
  google_display: "Google Display Banner",
};

export function readProviderConnections(env: Record<string, unknown> = {}): ProviderConnection[] {
  const configured = (key: MediaProviderKey) => typeof env[`VITE_${key.toUpperCase()}_CLIENT_ID`] === "string" && Boolean(String(env[`VITE_${key.toUpperCase()}_CLIENT_ID`]).trim());
  return (Object.keys(MEDIA_PROVIDER_LABELS) as MediaProviderKey[]).map((key) => ({
    key,
    label: MEDIA_PROVIDER_LABELS[key],
    connected: false,
    configured: configured(key),
    detail: configured(key) ? "OAuth ready; user connection required" : "OAuth credentials required",
    authScope: key === "google_photos" ? "photoslibrary.readonly" : key === "dropbox" ? "files.content.read" : key === "onedrive" ? "Files.Read" : "https://www.googleapis.com/auth/drive.readonly",
  }));
}

export function filterRemoteMedia(items: RemoteMediaItem[], query: string, provider: MediaProviderKey | "all" = "all"): RemoteMediaItem[] {
  const normalized = query.trim().toLocaleLowerCase();
  return items.filter((item) => {
    const matchesProvider = provider === "all" || item.provider === provider;
    const haystack = [item.name, item.folder, item.mimeType, MEDIA_PROVIDER_LABELS[item.provider]].filter(Boolean).join(" ").toLocaleLowerCase();
    return matchesProvider && (!normalized || haystack.includes(normalized));
  });
}

export function canSelectForCreative(item: Pick<RemoteMediaItem, "mimeType" | "consent">): boolean {
  return (item.mimeType.startsWith("image/") || item.mimeType.startsWith("video/")) && item.consent === "approved";
}

export function buildCreativeBrief(item: Pick<RemoteMediaItem, "id" | "name" | "mimeType" | "consent">, language: "ar" | "en", objective: string): CreativeBrief | null {
  if (!canSelectForCreative(item)) return null;
  const video = item.mimeType.startsWith("video/");
  if (language === "ar") {
    return {
      sourceId: item.id,
      language,
      objective,
      primaryText: `اكتشف ${objective} مع Coach Ayman Swimming Academy — تجربة عملية وآمنة تبدأ بخطوة واحدة.`,
      headline: video ? "شاهد التجربة وابدأ الآن" : "ابدأ تجربتك اليوم",
      callToAction: "احجز استشارتك",
      formats: video ? ["instagram_reel", "instagram_story", "tiktok_video"] : ["facebook_feed", "instagram_story", "google_display"],
      compliance: ["المصدر مصرح للاستخدام التسويقي", "لا نشر تلقائي قبل اعتماد المالك", "مراجعة الوجوه وخصوصية الأطفال قبل الإطلاق"],
      approval: "needs_review",
    };
  }
  return {
    sourceId: item.id,
    language,
    objective,
    primaryText: `Discover ${objective} with Coach Ayman Swimming Academy — a practical, safe experience that starts with one simple step.`,
    headline: video ? "See the experience. Start now." : "Start your experience today",
    callToAction: "Book a consultation",
    formats: video ? ["instagram_reel", "instagram_story", "tiktok_video"] : ["facebook_feed", "instagram_story", "google_display"],
    compliance: ["Source approved for marketing use", "No automatic publishing before owner approval", "Review faces and child privacy before launch"],
    approval: "needs_review",
  };
}

export function serializeCreativeBrief(brief: CreativeBrief): string {
  return JSON.stringify(brief, null, 2);
}
