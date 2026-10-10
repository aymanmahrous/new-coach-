import { useMemo, useState } from "react";
import {
  approveAllCandidates,
  approveAllWouldChange,
  overallBatchStatus,
  summarizeBatch,
  type ContentBatch,
  type ContentBatchItem,
} from "./content-batch";
import type { ChangeRequestKind } from "./content-growth";
import {
  buildExternalPostLink,
  latestReceiptForPlatform,
  parsePublicationReceipts,
  resolvePublishPipelineStage,
} from "./content-publishing";
import { readContentPillar, readTimeSlot } from "./content-strategy";
import { readPublishingCopy } from "./content-publishing-copy";
import { ContentBatchMediaPreview } from "./content-batch-media-preview";
import { canvaDesignErrorMessage, generateCanvaDesignForContentItem } from "./canva-design-adapter";
import { uploadStaffMediaFile } from "./staff-media-storage";
import { canUseInMarketingBatch, type MediaAssetRecord } from "./media-types";
import type { CapabilityState } from "./content-growth";
import { useLanguage } from "./i18n";
import { formatLocalDateTimeInput } from "./date-utils";
import "./content-batch-review.css";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const SUPABASE_PUBLIC_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

type PublishEnqueueResult = {
  success?: boolean;
  code?: string;
  providerExternalId?: string;
};

async function requestPublishJob(session: { accessToken: string }, contentItemId: string): Promise<PublishEnqueueResult> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/safe-content-publisher`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLIC_KEY,
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ contentItemId }),
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) throw new Error("SESSION_EXPIRED");
  const result = (await response.json().catch(() => ({}))) as PublishEnqueueResult;
  if (!response.ok && !result.code) throw new Error(`RPC_FAILED_${response.status}`);
  return result;
}

function publishEnqueueErrorMessage(code: string | undefined, language: "ar" | "en"): string {
  const messages: Record<string, { ar: string; en: string }> = {
    STAFF_ACCESS_DENIED: { ar: "لا تملك صلاحية طلب النشر.", en: "You do not have permission to request publish." },
    CONTENT_NOT_APPROVED: { ar: "يجب اعتماد المحتوى قبل طلب النشر.", en: "Content must be approved before requesting publish." },
    CONTENT_ALREADY_PUBLISHED: { ar: "هذا المحتوى منشور بالفعل.", en: "This content is already published." },
    PUBLISH_RECEIPT_EXISTS: { ar: "يوجد إيصال نشر منشور لهذا العنصر.", en: "A published receipt already exists for this item." },
    MEDIA_ASSET_REQUIRED: { ar: "يلزم ربط وسائط جاهزة قبل طلب النشر.", en: "Publish-ready media must be linked before requesting publish." },
    MEDIA_ASSET_NOT_PUBLISHABLE: { ar: "الوسائط المرتبطة غير جاهزة للنشر.", en: "Linked media is not publish-ready." },
    CONTENT_NOT_READY: { ar: "المحتوى غير جاهز للنشر.", en: "Content is not ready to publish." },
    PLATFORM_NOT_SUPPORTED: { ar: "المنصة غير مدعومة لطلب النشر.", en: "This platform is not supported for publish requests." },
    ACTIVE_AUTHORIZATION_EXISTS: { ar: "يوجد تفويض نشر نشط لهذا العنصر.", en: "An active publish authorization already exists for this item." },
    META_NOT_CONFIGURED: { ar: "لم يكتمل إعداد Meta الآمن في الخادم.", en: "The secure Meta server configuration is incomplete." },
    MEDIA_MISSING: { ar: "يلزم وجود صورة أو فيديو محفوظ للنشر.", en: "A stored image or video is required for publishing." },
    META_API_ERROR: { ar: "رفضت Meta عملية النشر أو تعذر الاتصال بها.", en: "Meta rejected the publish request or could not be reached." },
    RECORD_FAILED: { ar: "تم إرسال المنشور لكن تعذر تسجيل النتيجة؛ أوقفنا التكرار للمراجعة.", en: "The post was sent but the result could not be recorded; retry is blocked for review." },
  };
  const entry = code ? messages[code] : undefined;
  if (entry) return entry[language];
  return language === "ar" ? "تعذر طلب النشر." : "Publish request failed.";
}

function canRequestPublish(item: ContentBatchItem): boolean {
  if (item.status !== "approved") return false;
  if (item.publishedAt) return false;
  if (typeof item.providerExternalId === "string" && item.providerExternalId.trim()) return false;
  const receipt = latestReceiptForPlatform(item, item.platform);
  if (receipt?.status === "published") return false;
  return true;
}

function canRequestPublishWithMedia(item: ContentBatchItem, asset: MediaAssetRecord | undefined): boolean {
  return canRequestPublish(item) && Boolean(asset && canUseInMarketingBatch(asset));
}

const REQUEST_PUBLISH_COPY = {
  en: {
    button: "Publish Now",
    confirm: "Publish this approved item to its connected platform now? The existing secure publisher will publish immediately and record the real result.",
    success: "Published now. The real publication result was recorded.",
    already: "This item is already published or already has a publish result.",
    busy: "Requesting publish…",
  },
  ar: {
    button: "نشر الآن",
    confirm: "نشر هذا العنصر المعتمد الآن على المنصة المتصلة؟ مسار النشر الآمن الحالي سينفذ النشر فورًا ويسجل النتيجة الحقيقية.",
    success: "تم النشر الآن وتسجيل النتيجة الحقيقية.",
    already: "هذا العنصر منشور بالفعل أو توجد له نتيجة نشر مسجلة.",
    busy: "جاري طلب النشر…",
  },
} as const;

type ContentBatchReviewPanelProps = {
  items: ContentBatchItem[];
  batch: ContentBatch;
  canWrite: boolean;
  busy: boolean;
  session?: { accessToken: string };
  mediaAssets?: MediaAssetRecord[];
  onMediaLinked?: () => void;
  onApproveItem: (item: ContentBatchItem) => Promise<void>;
  onEditItem?: (item: ContentBatchItem, visualPrompt: string, scheduledFor: string | null) => Promise<void>;
  onRequestChanges: (item: ContentBatchItem, kind: ChangeRequestKind, note: string) => Promise<void>;
  onApproveAll: (items: ContentBatchItem[]) => Promise<void>;
  onPublishRequested?: () => void;
  onSessionExpired?: () => void;
  onOpenConnections?: () => void;
  workspaceMode?: "designs" | "reels" | "campaigns" | "review";
  designCapabilityState?: CapabilityState;
  videoCapabilityState?: CapabilityState;
};

function formatWhen(language: "ar" | "en", value: string | null) {
  if (!value) return language === "ar" ? "غير محدد" : "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === "ar" ? "ar-AE" : "en-AE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function ContentBatchReviewPanel({
  items,
  batch,
  canWrite,
  busy,
  session,
  mediaAssets = [],
  onMediaLinked,
  onApproveItem,
  onEditItem,
  onRequestChanges,
  onApproveAll,
  onPublishRequested,
  onSessionExpired,
  onOpenConnections,
  workspaceMode = "review",
  designCapabilityState = "NOT_CONFIGURED",
  videoCapabilityState = "NOT_CONFIGURED",
}: ContentBatchReviewPanelProps) {
  const { language, t } = useLanguage();
  const copy = t("contentBatch");
  const growthCopy = t("contentGrowth");
  const publishingCopy = readPublishingCopy(language);
  const itemStatusLabels = t("contentStatus");
  const batchStatusLabels = t("contentBatchStatus");
  const pipelineStageLabels = publishingCopy.pipelineStages;
  const [changeTargetId, setChangeTargetId] = useState<string | null>(null);
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [changeKind, setChangeKind] = useState<ChangeRequestKind>("caption");
  const [changeNote, setChangeNote] = useState("");
  const [designBusyId, setDesignBusyId] = useState<string | null>(null);
  const [designNotice, setDesignNotice] = useState("");
  const [designProviderByItem, setDesignProviderByItem] = useState<Record<string, string>>({});
  const [publishBusyId, setPublishBusyId] = useState<string | null>(null);
  const [publishNotice, setPublishNotice] = useState("");
  const [videoTargetId, setVideoTargetId] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<4 | 6 | 8>(8);
  const [videoResolution, setVideoResolution] = useState<"720p" | "1080p">("720p");
  const [videoEstimate, setVideoEstimate] = useState<{ costUsd: number; model: string } | null>(null);
  const [videoBusyId, setVideoBusyId] = useState<string | null>(null);
  const [videoNotice, setVideoNotice] = useState("");
  const [itemFilter, setItemFilter] = useState<"all" | "needs_review" | "approved" | "scheduled" | "published" | "failed">("all");
  const [replacingMediaItemId, setReplacingMediaItemId] = useState<string | null>(null);
  const [selectedAssetByItem, setSelectedAssetByItem] = useState<Record<string, string>>({});
  const [mediaActionBusyId, setMediaActionBusyId] = useState<string | null>(null);
  const requestPublishCopy = REQUEST_PUBLISH_COPY[language];

  const summary = useMemo(() => summarizeBatch(batch.items), [batch.items]);
  const batchStatus = overallBatchStatus(batch.items);
  const approveCandidates = approveAllCandidates(batch.items);
  const approveAllEnabled = canWrite && !busy && approveAllWouldChange(batch.items);
  const assetById = useMemo(() => new Map(mediaAssets.map((asset) => [asset.id, asset])), [mediaAssets]);
  const workspaceItems = useMemo(() => {
    if (workspaceMode === "designs") return items.filter((item) => !item.mediaAssetId);
    if (workspaceMode === "reels") return items.filter((item) => String(item.contentType).toLowerCase() === "reel");
    if (workspaceMode === "campaigns") return items.filter((item) => ["approved", "scheduled", "published", "failed"].includes(item.status));
    return items;
  }, [items, workspaceMode]);
  const visibleItems = itemFilter === "all" ? workspaceItems : workspaceItems.filter((item) => item.status === itemFilter);
  const previewLabels = {
    designPreview: copy.designPreview,
    designPending: copy.designPending,
    canvaBriefLabel: copy.canvaBriefLabel,
    noPreview: copy.noPreview,
  };
  const workspaceLabel = language === "ar"
    ? ({ designs: "مساحة التصميم", reels: "مساحة الريلز", campaigns: "مساحة الحملات والجدولة", review: "مساحة المراجعة" } as const)[workspaceMode]
    : ({ designs: "Design workspace", reels: "Reels workspace", campaigns: "Campaigns and scheduling workspace", review: "Review workspace" } as const)[workspaceMode];

  async function handleApproveAll() {
    if (!approveAllEnabled || approveCandidates.length === 0) return;
    const confirmMessage = language === "ar"
      ? `تأكيد اعتماد ${approveCandidates.length} عنصر(عناصر) في هذه الدفعة؟ لن يتم جدولة أو نشر أي عنصر من هذه الشاشة.`
      : `Approve ${approveCandidates.length} item(s) in this batch? Nothing will be scheduled or published from this screen.`;
    if (!window.confirm(confirmMessage)) return;
    await onApproveAll(approveCandidates);
  }

  async function submitChangeRequest(item: ContentBatchItem) {
    if (!changeNote.trim()) return;
    await onRequestChanges(item, changeKind, changeNote.trim());
    setChangeTargetId(null);
    setChangeNote("");
    setChangeKind("caption");
  }

  type DesignProvider = "auto" | "canva" | "gemini" | "chatgpt" | "runway" | "capcut" | "manual";

  function recommendedDesignProvider(item: ContentBatchItem): Exclude<DesignProvider, "auto"> {
    const isVideo = /reel|video/i.test(String(item.contentType));
    if (isVideo) return videoCapabilityState === "AVAILABLE" ? "runway" : "capcut";
    return designCapabilityState !== "NOT_CONFIGURED" ? "canva" : "gemini";
  }

  function availableDesignProviders(item: ContentBatchItem) {
    const isVideo = /reel|video/i.test(String(item.contentType));
    return [
      { key: "auto" as const, label: language === "ar" ? "تلقائي — أوصي بالأفضل" : "Auto — recommend best", available: true, detail: language === "ar" ? "يختار المسار الأفضل حسب ما هو متصل ومتحقق" : "Chooses the best verified connected path" },
      { key: "canva" as const, label: "Canva", available: !isVideo && designCapabilityState !== "NOT_CONFIGURED", detail: language === "ar"
          ? designCapabilityState === "LIMITED" ? "متصل عبر OAuth — سيُتحقق منه بأول تصميم حقيقي" : "تصميم صورة / Carousel"
          : designCapabilityState === "LIMITED" ? "OAuth connected — first real design will verify it" : "Image / carousel design" },
      { key: "gemini" as const, label: "Gemini Image", available: !isVideo, detail: language === "ar" ? "توليد صورة عبر Gemini مع تأكيد التكلفة" : "Gemini image generation; confirm cost first" },
      { key: "chatgpt" as const, label: "ChatGPT", available: false, detail: language === "ar" ? "توليد بصري — غير موصول داخل المصنع حاليًا" : "Visual generation — not wired into Factory yet" },
      { key: "runway" as const, label: "Runway", available: isVideo && videoCapabilityState === "AVAILABLE", detail: language === "ar" ? "توليد فيديو" : "Video generation" },
      { key: "capcut" as const, label: "CapCut", available: isVideo, detail: language === "ar" ? "تحرير فيديو يدوي" : "Manual video editing" },
      { key: "manual" as const, label: language === "ar" ? "يدوي" : "Manual", available: true, detail: language === "ar" ? "استخدم الـBrief الجاهز" : "Use the prepared brief" },
    ];
  }

  function selectedDesignProvider(item: ContentBatchItem): DesignProvider {
    return (designProviderByItem[item.id] as DesignProvider | undefined) ?? "auto";
  }

  async function handleGenerateDesign(item: ContentBatchItem) {
    if (!session || !canWrite || busy || designBusyId) return;
    setDesignBusyId(item.id);
    setDesignNotice("");
    let activeProvider = selectedDesignProvider(item);
    try {
      const requestedProvider = selectedDesignProvider(item);
      const isVideo = /reel|video/i.test(String(item.contentType));
      if (requestedProvider === "auto" && isVideo && videoCapabilityState !== "AVAILABLE") {
        onOpenConnections?.();
        return;
      }
      const provider = requestedProvider === "auto" ? recommendedDesignProvider(item) : requestedProvider;
      activeProvider = provider;
      const providerInfo = availableDesignProviders(item).find((entry) => entry.key === provider);
      if (!providerInfo?.available) {
        if (provider === "runway") {
          onOpenConnections?.();
          return;
        }
        setDesignNotice(language === "ar"
          ? "هذا المزود ظاهر للاختيار، لكنه غير متصل/غير مدعوم فعليًا في المصنع حاليًا. لم يتم تشغيل أي عملية وهمية."
          : "This provider is shown as an option, but it is not currently connected/supported by the Factory. No fake operation was started.");
        return;
      }
      if (provider === "gemini") {
        const { estimateGeminiImageGeneration, generateGeminiImageForContentItem } = await import("./gemini-image-design-adapter");
        const estimate = await estimateGeminiImageGeneration(session);
        const confirmed = window.confirm(language === "ar"
          ? "إنشاء صورة عبر Gemini. التكلفة التقديرية للصورة الواحدة بدقة 1K: $" + estimate.estimatedCostUsd.toFixed(3) + " تقريبًا. قد تختلف التكلفة الفعلية. هل تريد المتابعة؟"
          : "Generate one Gemini image. Estimated cost for a 1K image: approximately $" + estimate.estimatedCostUsd.toFixed(3) + ". Actual charges may vary. Continue?");
        if (!confirmed) return;
        const generated = await generateGeminiImageForContentItem(session, item);
        await linkMediaToItem(item.id, generated.mediaAssetId);
        setDesignNotice(language === "ar"
          ? "تم توليد الصورة وحفظها وربطها بالمحتوى. الأصل الآن للمراجعة قبل أي نشر."
          : "Image generated, stored, and linked to the content. The asset is in review before any publishing.");
        setReplacingMediaItemId(null);
        onMediaLinked?.();
        return;
      }
      if (provider !== "canva") {
        setDesignNotice(language === "ar"
          ? provider === "runway" ? "Runway هو اختيار الفيديو، لكن التنفيذ الآلي يتطلب اتصالًا متحققًا به. لا ندّعي توليدًا غير موجود." : provider === "capcut" ? "CapCut متاح هنا كمسار تحرير يدوي؛ الـBrief جاهز." : "تم اختيار المسار اليدوي؛ استخدم الـBrief الجاهز."
          : provider === "runway" ? "Runway is the video choice, but automated execution requires a verified connection. No unsupported generation is claimed." : provider === "capcut" ? "CapCut is available here as a manual editing path; the brief is ready." : "Manual path selected; use the prepared brief.");
        return;
      }
      await generateCanvaDesignForContentItem(session, item);
      setDesignNotice(copy.designGeneratedNotice);
      setReplacingMediaItemId(null);
      onMediaLinked?.();
    } catch (cause) {
      if (cause instanceof Error && cause.message === "SESSION_EXPIRED") throw cause;
      const code = cause instanceof Error ? cause.message : undefined;
      if (activeProvider === "gemini") {
        const { geminiImageDesignErrorMessage } = await import("./gemini-image-design-adapter");
        setDesignNotice(geminiImageDesignErrorMessage(code, language));
      } else {
        setDesignNotice(canvaDesignErrorMessage(code));
      }
    } finally {
      setDesignBusyId(null);
    }
  }

  async function linkMediaToItem(itemId: string, assetId: string) {
    if (!session) throw new Error("AUTH_REQUIRED");
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/link_staff_media_to_content_item`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLIC_KEY,
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ p_content_item_id: itemId, p_media_asset_id: assetId }),
      cache: "no-store",
    });
    if (response.status === 401 || response.status === 403) throw new Error("SESSION_EXPIRED");
    const res = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok || res.success !== true) throw new Error(typeof res.code === "string" ? res.code : "MEDIA_LINK_FAILED");
    return res;
  }

  function mediaLinkErrorMessage(code: string | undefined): string {
    const messages: Record<string, { ar: string; en: string }> = {
      MEDIA_ASSET_NOT_PUBLISHABLE: {
        ar: "الأصل غير جاهز للنشر بعد (يحتاج تأكيد الموافقة أو تصنيفه في مكتبة الوسائط).",
        en: "Media asset is not publish-ready yet (requires consent confirmation or classification in Media Library).",
      },
      MEDIA_ASSET_ALREADY_LINKED: {
        ar: "هذا الأصل مرتبط بالفعل بعنصر محتوى آخر.",
        en: "This asset is already linked to another content item.",
      },
      CONTENT_ITEM_NOT_FOUND: {
        ar: "عنصر المحتوى غير موجود.",
        en: "Content item not found.",
      },
      PUBLISHED_CONTENT_IMMUTABLE: {
        ar: "المحتوى المنشور لا يمكن تعديل وسائطه.",
        en: "Published content cannot be modified.",
      },
      UPLOAD_REGISTRATION_FAILED: {
        ar: "تعذر تسجيل الملف المرفوع في مكتبة الوسائط.",
        en: "Failed to register uploaded file in Media Library.",
      },
      UPLOAD_FAILED: {
        ar: "تعذر رفع الملف من الجهاز.",
        en: "Failed to upload file from device.",
      },
      MEDIA_LINK_FAILED: {
        ar: "تعذر ربط الوسائط بالمحتوى.",
        en: "Failed to link media to content.",
      },
    };
    return (code && messages[code]?.[language]) ?? (code || (language === "ar" ? "تعذر ربط الوسائط." : "Media link failed."));
  }

  async function handleLinkMedia(item: ContentBatchItem, assetId: string) {
    if (!session || !canWrite || busy || mediaActionBusyId || !assetId) return;
    setMediaActionBusyId(item.id);
    setDesignNotice("");
    try {
      await linkMediaToItem(item.id, assetId);
      setDesignNotice(language === "ar" ? "تم ربط الأصل من المكتبة بنجاح وهو الآن قيد المراجعة." : "Media asset linked successfully and is now in review.");
      setReplacingMediaItemId(null);
      onMediaLinked?.();
    } catch (cause) {
      if (cause instanceof Error && cause.message === "SESSION_EXPIRED") onSessionExpired?.();
      else setDesignNotice(mediaLinkErrorMessage(cause instanceof Error ? cause.message : undefined));
    } finally {
      setMediaActionBusyId(null);
    }
  }

  async function handleUploadMedia(item: ContentBatchItem, file: File) {
    if (!session || !canWrite || busy || mediaActionBusyId || !file) return;
    setMediaActionBusyId(item.id);
    setDesignNotice("");
    try {
      const uploaded = await uploadStaffMediaFile(session, file);
      const registerRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/register_staff_media_upload`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLIC_KEY,
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          p_asset_type: uploaded.assetType,
          p_storage_path: uploaded.storagePath,
          p_metadata: { file_name: uploaded.fileName, mime_type: file.type || null },
        }),
      });
      if (registerRes.status === 401 || registerRes.status === 403) throw new Error("SESSION_EXPIRED");
      const reg = (await registerRes.json().catch(() => ({}))) as Record<string, unknown>;
      const newAssetId = typeof reg.mediaAssetId === "string" ? reg.mediaAssetId : "";
      if (!registerRes.ok || !newAssetId) throw new Error("UPLOAD_REGISTRATION_FAILED");
      await linkMediaToItem(item.id, newAssetId);

      setDesignNotice(language === "ar"
        ? "تم الرفع والربط للمراجعة؛ الرفع لا يثبت الموافقة، ولا نشر تلقائي."
        : "Uploaded and linked for review; upload isn't consent; no auto-publish.");
      setReplacingMediaItemId(null);
      onMediaLinked?.();
    } catch (cause) {
      if (cause instanceof Error && cause.message === "SESSION_EXPIRED") onSessionExpired?.();
      else setDesignNotice(mediaLinkErrorMessage(cause instanceof Error ? cause.message : "UPLOAD_FAILED"));
    } finally {
      setMediaActionBusyId(null);
    }
  }

  async function requestVeo(session: { accessToken: string }, body: Record<string, unknown>) {
    const response = await fetch(SUPABASE_URL + "/functions/v1/generate-veo-video", {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLIC_KEY,
        Authorization: "Bearer " + session.accessToken,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (response.status === 401 || response.status === 403) throw new Error("SESSION_EXPIRED");
    const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const code = typeof result.error === "string" ? result.error : "VEO_FAILED_" + response.status;
      const providerStatus = typeof result.providerStatus === "number" ? " (Google HTTP " + result.providerStatus + ")" : "";
      const detail = typeof result.detail === "string" ? result.detail.trim().slice(0, 180) : "";
      throw new Error([code + providerStatus, detail].filter(Boolean).join(": "));
    }
    return result;
  }

  async function openVideoCreator(item: ContentBatchItem) {
    if (!session || !canWrite || busy || videoBusyId) return;
    setVideoTargetId(item.id);
    setVideoEstimate(null);
    setVideoNotice("");
    try {
      const result = await requestVeo(session, { mode: "estimate", duration: videoDuration, resolution: videoResolution, aspectRatio: "9:16" });
      setVideoEstimate({
        costUsd: typeof result.estimatedCostUsd === "number" ? result.estimatedCostUsd : 0,
        model: typeof result.model === "string" ? result.model : "veo-3.1-lite-generate-preview",
      });
    } catch (cause) {
      if (cause instanceof Error && cause.message === "SESSION_EXPIRED") { onSessionExpired?.(); return; }
      setVideoNotice(language === "ar" ? "تعذر حساب التكلفة قبل التوليد." : "Could not calculate the cost before generation.");
    }
  }

  async function handleGenerateVideo(item: ContentBatchItem) {
    if (!session || !canWrite || busy || videoBusyId || videoTargetId !== item.id) return;
    setVideoBusyId(item.id);
    setVideoNotice("");
    try {
      const estimate = await requestVeo(session, { mode: "estimate", duration: videoDuration, resolution: videoResolution, aspectRatio: "9:16" });
      const costUsd = typeof estimate.estimatedCostUsd === "number" ? estimate.estimatedCostUsd : null;
      const confirmed = window.confirm(
        language === "ar"
          ? "فيديو رأسي " + videoDuration + " ثوانٍ بدقة " + videoResolution + ". التكلفة التقديرية: $" + (costUsd == null ? "غير معروفة" : costUsd.toFixed(2)) + ". إنشاء الفيديو الآن؟"
          : "Vertical " + videoDuration + "s video at " + videoResolution + ". Estimated cost: $" + (costUsd == null ? "unknown" : costUsd.toFixed(2)) + ". Generate now?",
      );
      if (!confirmed) return;
      setVideoEstimate(costUsd == null ? null : { costUsd, model: typeof estimate.model === "string" ? estimate.model : "veo-3.1-lite-generate-preview" });
      const result = await requestVeo(session, {
        mode: "generate",
        duration: videoDuration,
        resolution: videoResolution,
        aspectRatio: "9:16",
        prompt: String(item.visualPrompt || item.hook || item.topic || "Short swimming training Reel for parents in Abu Dhabi."),
      });
      const mediaAssetId = typeof result.mediaAssetId === "string" ? result.mediaAssetId : "";
      if (!mediaAssetId) throw new Error("VEO_MEDIA_ASSET_MISSING");
      await linkMediaToItem(item.id, mediaAssetId);
      setVideoNotice(language === "ar" ? "تم إنشاء الفيديو وحفظه وربطه بالمحتوى. عاد للمراجعة قبل أي نشر." : "Video generated, stored, and linked to the content. It is back in review before any publish.");
      setVideoTargetId(null);
      setReplacingMediaItemId(null);
      onMediaLinked?.();
    } catch (cause) {
      if (cause instanceof Error && cause.message === "SESSION_EXPIRED") onSessionExpired?.();
      else setVideoNotice(cause instanceof Error ? cause.message : "VEO_FAILED");
    } finally {
      setVideoBusyId(null);
    }
  }

  async function handleRequestPublish(item: ContentBatchItem) {
    if (!session || !canWrite || busy || publishBusyId || !canRequestPublish(item)) return;
    if (!window.confirm(requestPublishCopy.confirm)) return;
    setPublishBusyId(item.id);
    setPublishNotice("");
    try {
      const result = await requestPublishJob(session, item.id);
      if (!result.success) {
        if (result.code === "META_NOT_CONFIGURED") {
          onOpenConnections?.();
          return;
        }
        setPublishNotice(publishEnqueueErrorMessage(result.code, language));
        return;
      }
      setPublishNotice(
        result.code === "ALREADY_ENQUEUED" || result.code === "ALREADY_PREPARED"
          ? requestPublishCopy.already
          : requestPublishCopy.success,
      );
      onPublishRequested?.();
    } catch (cause) {
      if (cause instanceof Error && cause.message === "SESSION_EXPIRED") {
        onSessionExpired?.();
        return;
      }
      setPublishNotice(publishEnqueueErrorMessage(undefined, language));
    } finally {
      setPublishBusyId(null);
    }
  }

  return (
    <section className="content-batch-panel" aria-labelledby="content-batch-heading">
      <header>
        <div>
          <p className="batch-meta">{copy.eyebrow} · {workspaceLabel}</p>
          <h2 id="content-batch-heading">{copy.title}</h2>
          <p className="batch-meta">
            {batch.isExplicitBatch ? copy.explicitBatch : copy.heuristicBatch}
            {" · "}
            {copy.itemCount.replace("{count}", String(batch.items.length))}
            {batch.reviewDeadline ? ` · ${copy.reviewDeadline}: ${formatWhen(language, batch.reviewDeadline)}` : ""}
          </p>
        </div>
        <span className={`content-status batch-status-${batchStatus}`}>{batchStatusLabels[batchStatus] ?? batchStatus}</span>
      </header>

      <div className="content-batch-summary" aria-label={copy.summaryAria}>
        <article><span>{copy.needsReview}</span><strong>{summary.needsReview}</strong></article>
        <article><span>{copy.approved}</span><strong>{summary.approved}</strong></article>
        <article><span>{copy.scheduled}</span><strong>{summary.scheduled}</strong></article>
        <article><span>{copy.published}</span><strong>{summary.published}</strong></article>
        <article><span>{copy.failed}</span><strong>{summary.failed}</strong></article>
      </div>

      {workspaceMode === "reels" && (
        <div className="content-batch-design-notice" role="status">
          {language === "ar"
            ? "تحليل واقتراح Reel متاح داخل هذه المساحة. توليد الفيديو الفعلي يتم عبر Google Veo؛ تُفحص الاعتمادات وتُحسب التكلفة قبل بدء التوليد."
            : "Reel analysis and proposals are available here. Actual video generation uses Google Veo; credentials and estimated cost are checked before generation starts."}
        </div>
      )}
      {workspaceMode === "campaigns" && (
        <div className="content-batch-design-notice" role="status">
          {language === "ar"
            ? "هذه المساحة تعرض حالة الحملات الحالية. النشر الفوري يظهر داخل العنصر المعتمد نفسه؛ لا توجد غرفة نشر ثانية."
            : "This workspace shows current campaign states. Immediate publish stays on the approved item itself; there is no second publishing room."}
        </div>
      )}

      <div className="content-batch-actions">
        <button type="button" disabled={!approveAllEnabled} title={!canWrite ? copy.actionDisabledReadOnly : busy ? copy.actionDisabledBusy : approveCandidates.length === 0 ? copy.batchNothingToApprove : undefined} onClick={() => void handleApproveAll()}>
          {busy ? t("common").saving : copy.approveAllButton}
        </button>
        {!canWrite ? <small>{copy.actionDisabledReadOnly}</small> : approveCandidates.length === 0 ? <small>{copy.batchNothingToApprove}</small> : null}
      </div>
      {designNotice && <p className="content-batch-design-notice" role="status">{designNotice}</p>}
      {publishNotice && <p className="content-batch-design-notice" role="status">{publishNotice}</p>}
      {videoNotice && <p className="content-batch-design-notice" role="status">{videoNotice}</p>}

      <div className="content-review-toolbar">
        <div>
          <strong>{language === "ar" ? "مراجعة الدفعة" : "Batch review"}</strong>
          <span>{language === "ar" ? "اعرض الحالة التي تريد التعامل معها فقط." : "Show only the status you want to work on."}</span>
        </div>
        <div className="content-review-filters" role="group" aria-label={language === "ar" ? "تصفية حالات المحتوى" : "Content status filters"}>
          {(["all", "needs_review", "approved", "scheduled", "published", "failed"] as const).map((filter) => {
            const count = filter === "all" ? workspaceItems.length : workspaceItems.filter((item) => item.status === filter).length;
            const label = filter === "all"
              ? (language === "ar" ? "الكل" : "All")
              : filter === "needs_review"
                ? (language === "ar" ? "للمراجعة" : "Needs review")
                : filter === "approved"
                  ? (language === "ar" ? "معتمد" : "Approved")
                  : filter === "scheduled"
                    ? (language === "ar" ? "مجدول" : "Scheduled")
                    : filter === "published"
                      ? (language === "ar" ? "منشور" : "Published")
                      : (language === "ar" ? "فشل" : "Failed");
            return (
              <button
                type="button"
                key={filter}
                className={itemFilter === filter ? "active" : ""}
                onClick={() => setItemFilter(filter)}
              >
                {label} <b>{count}</b>
              </button>
            );
          })}
        </div>
      </div>
      {visibleItems.length === 0 ? <p className="content-review-empty">{language === "ar" ? "لا توجد عناصر في هذه الحالة." : "No items match this status."}</p> : <div className="content-batch-grid">
        {visibleItems.map((item) => {
          const canApprove = ["draft", "generated", "needs_review"].includes(item.status);
          const canRequestChanges = ["draft", "generated", "approved", "scheduled", "failed"].includes(item.status);
          const itemLocked = busy || !canWrite;
          const pillar = readContentPillar(item);
          const timeSlot = readTimeSlot(item);
          const showingForm = changeTargetId === item.id;
          const pipelineStage = resolvePublishPipelineStage(item);
          const receipts = parsePublicationReceipts(item);
          const platformReceipt = latestReceiptForPlatform(item, item.platform);
          const postLink = buildExternalPostLink(item.platform, platformReceipt?.externalPostId);
          const itemDisabledReason = !canWrite ? copy.actionDisabledReadOnly : busy ? copy.actionDisabledBusy : undefined;
          const linkedMediaAssetId = typeof item.mediaAssetId === "string" ? item.mediaAssetId : "";
          const linkedMediaAsset = assetById.get(linkedMediaAssetId);
          const canRegenerateDesign = Boolean(linkedMediaAsset && !canUseInMarketingBatch(linkedMediaAsset));
          const showingEditForm = editTargetId === item.id;
          return (
            <article className="content-batch-item" key={item.id}>
              <header>
                <div>
                  <span className="item-meta">
                    {item.platform} · {item.contentType}
                    {pillar ? ` · ${growthCopy.pillarLabels[pillar] ?? pillar}` : ""}
                    {timeSlot !== "any" ? ` · ${growthCopy.timeSlots[timeSlot]}` : ""}
                  </span>
                  <h3>{item.topic || copy.untitled}</h3>
                </div>
                <span className={`content-status status-${item.status}`}>{itemStatusLabels[item.status as keyof typeof itemStatusLabels] ?? item.status}</span>
              </header>
              <details className="content-item-details">
                <summary>{language === "ar" ? "المزيد والتفاصيل" : "More details"}</summary>
                <p className="item-caption">{item.caption.trim() || copy.noCaption}</p>
                <ContentBatchMediaPreview item={item} session={session} assetById={assetById} labels={previewLabels} />
              {(Boolean(item.mediaSource) || Boolean(item.mediaAssetId) || item.mediaPlan != null) && (
                <p className="item-meta">
                  {copy.mediaSourceLabel}: {String(item.mediaSource ?? "—").toUpperCase()}
                  {item.mediaAssetId ? ` · ${copy.mediaLinked}` : ""}
                  {item.mediaSource === "pending" ? ` · ${copy.mediaFallbackPending}` : ""}
                </p>
              )}
              <p className="item-meta">{copy.scheduledFor}: {formatWhen(language, item.scheduledFor)}</p>
              <div className="publish-pipeline-panel" aria-label={publishingCopy.pipelineAria}>
                <p className="item-meta">
                  {publishingCopy.pipelineLabel}: {pipelineStageLabels[pipelineStage] ?? pipelineStage}
                </p>
                {typeof item.publishedAt === "string" && item.publishedAt && (
                  <p className="item-meta">{publishingCopy.publishedAtLabel}: {formatWhen(language, item.publishedAt)}</p>
                )}
                {receipts.length === 0 && pipelineStage === "approved_ready" && (
                  <p className="publish-ready-note">{publishingCopy.awaitingN8nNote}</p>
                )}
                {receipts.map((receipt, index) => (
                  <div className="publish-receipt" key={`${receipt.platform}-${receipt.updatedAt ?? index}`}>
                    <strong>{receipt.platform.toUpperCase()} · {receipt.status}</strong>
                    {receipt.plainLanguageReason && <span>{receipt.plainLanguageReason}</span>}
                    {buildExternalPostLink(receipt.platform, receipt.externalPostId) && (
                      <a href={buildExternalPostLink(receipt.platform, receipt.externalPostId) ?? "#"} target="_blank" rel="noopener noreferrer">
                        {publishingCopy.openPostLink}
                      </a>
                    )}
                  </div>
                ))}
                {postLink && pipelineStage === "published_live" && (
                  <a className="publish-live-link" href={postLink} target="_blank" rel="noopener noreferrer">{publishingCopy.openLivePost}</a>
                )}
                </div>
              </details>
              <footer>
                {session && Boolean(item.mediaAssetId) && item.status !== "published" && (
                  <div className="content-media-replace-toggle">
                    <button
                      type="button"
                      className="secondary"
                      disabled={itemLocked}
                      onClick={() => setReplacingMediaItemId((current) => current === item.id ? null : item.id)}
                    >
                      {replacingMediaItemId === item.id
                        ? (language === "ar" ? "✕ إخفاء خيارات الوسائط" : "✕ Hide media options")
                        : (language === "ar" ? "🔄 استبدال الصورة / تغيير التصميم" : "🔄 Replace photo / change design")}
                    </button>
                  </div>
                )}
                {session && (!item.mediaAssetId || replacingMediaItemId === item.id) && item.status !== "published" && (
                  <div className="content-media-source-selector" role="group" aria-label={language === "ar" ? "ربط أصل أو رفعه" : "Link or upload asset"}>
                    <div className="content-media-source-header">
                      <strong>{language === "ar" ? "📁 اختر من أصول المكتبة أو ارفع صورة" : "📁 Choose Library Asset or Upload"}</strong>
                      <small>{language === "ar" ? "الأسهل والأوفر: استخدم أصلًا موجودًا أو صورة من جهازك لتجنب التكرار والتكلفة." : "Easiest & most cost-effective: use an existing asset or your own photo."}</small>
                    </div>
                    {mediaAssets.length > 0 && (
                      <div className="content-media-library-picker">
                        <select
                          aria-label={language === "ar" ? "اختر من مكتبة الوسائط" : "Choose from library"}
                          value={selectedAssetByItem[item.id] ?? ""}
                          onChange={(e) => setSelectedAssetByItem((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          disabled={itemLocked || mediaActionBusyId === item.id}
                        >
                          <option value="">{language === "ar" ? "— اختر صورة/فيديو من المكتبة —" : "— Select asset from library —"}</option>
                          {mediaAssets.map((asset) => {
                            const assetName = typeof asset.metadata?.file_name === "string" ? asset.metadata.file_name : typeof asset.metadata?.name === "string" ? asset.metadata.name : asset.id.slice(0, 8);
                            const ready = canUseInMarketingBatch(asset);
                            return (
                              <option key={asset.id} value={asset.id}>
                                {ready ? "✅ " : "⏳ "}{assetName} ({asset.category || asset.assetType})
                              </option>
                            );
                          })}
                        </select>
                        <button
                          type="button"
                          className="secondary"
                          disabled={itemLocked || mediaActionBusyId === item.id || !selectedAssetByItem[item.id]}
                          onClick={() => void handleLinkMedia(item, selectedAssetByItem[item.id])}
                        >
                          {mediaActionBusyId === item.id ? (language === "ar" ? "جاري الربط…" : "Linking…") : (language === "ar" ? "ربط هذا الأصل" : "Link asset")}
                        </button>
                      </div>
                    )}
                    <label className="secondary-button-label">
                      <span>{mediaActionBusyId === item.id ? (language === "ar" ? "جاري الرفع للمكتبة…" : "Uploading…") : (language === "ar" ? "📤 رفع صورة/فيديو للمكتبة" : "📤 Upload to Media Library")}</span>
                      <input
                        type="file"
                        accept="image/*,video/*"
                        className="sr-only"
                        disabled={itemLocked || mediaActionBusyId === item.id}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleUploadMedia(item, file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                )}
                {session && (!item.mediaAssetId || replacingMediaItemId === item.id || canRegenerateDesign) && item.status !== "published" && (
                  <div className="content-design-provider-picker" role="group" aria-label={language === "ar" ? "اختيار مزود التصميم" : "Design provider selection"}>
                    <strong>{language === "ar" ? "التصميم" : "Design"}</strong>
                    <small>
                      {language === "ar"
                        ? `اقتراح النظام: ${availableDesignProviders(item).find((provider) => provider.key === recommendedDesignProvider(item))?.label ?? "يدوي"}`
                        : `System recommendation: ${availableDesignProviders(item).find((provider) => provider.key === recommendedDesignProvider(item))?.label ?? "Manual"}`}
                    </small>
                    <label>
                      <span className="sr-only">{language === "ar" ? "مزود التصميم" : "Design provider"}</span>
                      <select
                        aria-label={language === "ar" ? "اختر مزود التصميم" : "Choose design provider"}
                        value={selectedDesignProvider(item)}
                        onChange={(event) => setDesignProviderByItem((current) => ({ ...current, [item.id]: event.target.value }))}
                        disabled={itemLocked || designBusyId === item.id}
                      >
                        {availableDesignProviders(item).map((provider) => (
                          <option key={provider.key} value={provider.key}>
                            {provider.label}{provider.available ? "" : language === "ar" ? " — غير متاح حاليًا" : " — unavailable"}
                          </option>
                        ))}
                      </select>
                    </label>
                    {designCapabilityState !== "AVAILABLE" && onOpenConnections && (
                      <button
                        type="button"
                        className="secondary"
                        disabled={itemLocked || designBusyId === item.id}
                        onClick={onOpenConnections}
                        title={language === "ar" ? "افتح الاتصالات لربط Canva" : "Open Connections to connect Canva"}
                      >
                        {language === "ar" ? "ربط Canva" : "Connect Canva"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="secondary"
                      data-testid="generateDesignButton"
                      aria-label={item.mediaAssetId ? copy.regenerateDesignButton : copy.generateDesignButton}
                      disabled={itemLocked || designBusyId === item.id || (recommendedDesignProvider(item) === "canva" && designCapabilityState === "NOT_CONFIGURED")}
                      title={itemDisabledReason}
                      onClick={() => void handleGenerateDesign(item)}
                    >
                      {designBusyId === item.id
                        ? copy.generateDesignBusy
                        : language === "ar" ? "إنشاء التصميم" : "Create design"}
                    </button>
                  </div>
                )}
                {session && /reel|video/i.test(String(item.contentType)) && (!item.mediaAssetId || replacingMediaItemId === item.id) && item.status !== "published" && (
                  <div className="content-design-provider-picker" role="group" aria-label={language === "ar" ? "إنشاء فيديو" : "Create video"}>
                    <strong>{language === "ar" ? "فيديو Reel" : "Reel video"}</strong>
                    <small>{language === "ar" ? "Veo · عمودي 9:16 · الصوت مدمج" : "Veo · 9:16 portrait · audio included"}</small>
                    {videoTargetId === item.id && (
                      <>
                        <label>
                          <span>{language === "ar" ? "المدة" : "Duration"}</span>
                          <select value={videoDuration} onChange={(event) => setVideoDuration(Number(event.target.value) as 4 | 6 | 8)} disabled={videoBusyId === item.id}>
                            <option value={4}>4s</option><option value={6}>6s</option><option value={8}>8s</option>
                          </select>
                        </label>
                        <label>
                          <span>{language === "ar" ? "الدقة" : "Resolution"}</span>
                          <select value={videoResolution} onChange={(event) => setVideoResolution(event.target.value as "720p" | "1080p")} disabled={videoBusyId === item.id}>
                            <option value="720p">720p</option>
                            <option value="1080p" disabled={videoDuration !== 8}>1080p</option>
                          </select>
                        </label>
                        {videoEstimate && <small role="status">{language === "ar" ? "التكلفة التقديرية: $" + videoEstimate.costUsd.toFixed(2) + " · " + videoDuration + " ث · " + videoResolution : "Estimated cost: $" + videoEstimate.costUsd.toFixed(2) + " · " + videoDuration + "s · " + videoResolution}</small>}
                        <button type="button" className="primary-button" disabled={itemLocked || videoBusyId === item.id || !videoEstimate} onClick={() => void handleGenerateVideo(item)}>
                          {videoBusyId === item.id ? (language === "ar" ? "جاري الإنشاء…" : "Generating…") : (language === "ar" ? "إنشاء الفيديو" : "Generate video")}
                        </button>
                      </>
                    )}
                    {videoTargetId !== item.id && (
                      <button type="button" className="secondary" disabled={itemLocked || videoBusyId === item.id} onClick={() => void openVideoCreator(item)}>
                        {language === "ar" ? "إنشاء فيديو" : "Create video"}
                      </button>
                    )}
                  </div>
                )}
                {canApprove && (
                  <button type="button" disabled={itemLocked} title={itemDisabledReason} onClick={() => void onApproveItem(item)}>
                    {copy.approveButton}
                  </button>
                )}
                {canRequestChanges && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={itemLocked}
                    title={itemDisabledReason}
                    onClick={() => {
                      setChangeTargetId(showingForm ? null : item.id);
                      setChangeNote("");
                      setChangeKind("caption");
                    }}
                  >
                    {copy.requestChangesButton}
                  </button>
                )}
                {onEditItem && item.status !== "published" && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={itemLocked}
                    title={itemDisabledReason}
                    onClick={() => { setEditTargetId(showingEditForm ? null : item.id); setChangeTargetId(null); }}
                  >
                    {showingEditForm ? (language === "ar" ? "إغلاق" : "Close") : (language === "ar" ? "تعديل" : "Edit")}
                  </button>
                )}
                {canRequestPublish(item) && session && (
                  <button
                    type="button"
                    className="primary-button"
                    disabled={itemLocked || publishBusyId === item.id || !canRequestPublishWithMedia(item, linkedMediaAsset)}
                    title={itemDisabledReason ?? (!canRequestPublishWithMedia(item, linkedMediaAsset) ? (language === "ar" ? "الوسائط المرتبطة ليست جاهزة للنشر." : "Linked media is not publish-ready.") : undefined)}
                    onClick={() => void handleRequestPublish(item)}
                  >
                    {publishBusyId === item.id ? requestPublishCopy.busy : requestPublishCopy.button}
                  </button>
                )}
                {item.status === "approved" && !canRequestPublishWithMedia(item, linkedMediaAsset) && (
                  <small className="item-action-disabled-reason">
                    {language === "ar" ? "طلب النشر متوقف: اربط وسائط معتمدة ومؤكدة الموافقة أولًا." : "Publish request blocked: attach approved media with confirmed consent first."}
                  </small>
                )}
              </footer>
              {itemDisabledReason && <small className="item-action-disabled-reason">{itemDisabledReason}</small>}
              {showingForm && (
                <form
                  className="change-request-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitChangeRequest(item);
                  }}
                >
                  <label>
                    {growthCopy.changeKindLabel}
                    <select value={changeKind} onChange={(event) => setChangeKind(event.target.value as ChangeRequestKind)}>
                      {(Object.keys(growthCopy.changeKinds) as ChangeRequestKind[]).map((kind) => (
                        <option key={kind} value={kind}>{growthCopy.changeKinds[kind]}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {growthCopy.changeNoteLabel}
                    <textarea
                      value={changeNote}
                      onChange={(event) => setChangeNote(event.target.value)}
                      placeholder={growthCopy.changeNotePlaceholder}
                      maxLength={500}
                      required
                    />
                  </label>
                  <button type="submit" disabled={itemLocked || !changeNote.trim()}>{growthCopy.submitChangeRequest}</button>
                </form>
              )}
              {showingEditForm && onEditItem && (
                <form
                  className="change-request-form factory-edit-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    const localDate = String(data.get("scheduledFor") ?? "").trim();
                    const scheduledFor = localDate ? new Date(localDate).toISOString() : null;
                    void onEditItem(item, String(data.get("visualPrompt") ?? "").trim(), scheduledFor).then(() => setEditTargetId(null));
                  }}
                >
                  <label>{language === "ar" ? "موعد النشر" : "Publish time"}<input name="scheduledFor" type="datetime-local" defaultValue={formatLocalDateTimeInput(item.scheduledFor)} disabled={!canWrite || item.status === "published"} /></label>
                  <label>{language === "ar" ? "طلب التصميم" : "Design request"}<textarea name="visualPrompt" defaultValue={String(item.visualPrompt ?? "")} maxLength={2000} rows={3} disabled={!canWrite || item.status === "published"} /></label>
                  <button type="submit" disabled={itemLocked}>{language === "ar" ? "حفظ" : "Save"}</button>
                </form>
              )}
            </article>
          );
        })}
      </div>}
    </section>
  );
}
