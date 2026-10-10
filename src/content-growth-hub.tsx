import { useEffect, useMemo, useRef, useState } from "react";
import { groupContentBatches, isDatabaseBatchId, selectPrimaryBatch, buildNextBatchReadyNotice, type ContentBatchItem } from "./content-batch";
import { COACH_AYMAN_PROVIDER_ID, contentFingerprint, parseCoachKnowledgeContext, validateCoachAymanBatch, type CoachBrainFactoryContext, type GeneratedBatchItem } from "./content-batch-generator";
import { attachMediaToCoachAymanBatch, buildCoachAyman30DayBatchWithMedia } from "./media-batch-link";
import { generateCoachAymanBatchWithProvider, type BatchAiProvider, type GeminiBatchPromptContext } from "./gemini-batch-adapter";
import { parseMediaAssetRecords } from "./media-library-controls";
import {
  displayCapabilityState,
  readIntegrationStatuses,
  summarizePipeline,
  type ChangeRequestKind,
} from "./content-growth";
import { AUTHORIZED_INSTAGRAM_PUBLISH_ITEM_ID, buildFacebookPublishAudit, summarizeLivePublishingReadiness } from "./content-publishing";
import { readPublishingCopy } from "./content-publishing-copy";
import { buildDayNineReminder } from "./content-batch";
import {
  BRAND,
  DEFAULT_BATCH_MIX,
  PLATFORM_GUIDANCE,
  buildStrategySummary,
  buildPerformanceInsights,
} from "./content-strategy";
import { ContentBatchReviewPanel } from "./content-batch-review-panel";
import { useLanguage } from "./i18n";
import "./content-growth-hub.css";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const SUPABASE_PUBLIC_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

type GrowthSession = { accessToken: string };

export const COACH_BRAIN_FACTORY_HANDOFF_KEY = "coach-brain-factory-handoff";
const MEDIA_FACTORY_HANDOFF_KEY = "media-factory-handoff";

type MediaFactoryHandoff = {
  asset: { id: string; provider: string; name: string; mimeType: string; webUrl: string; previewUrl: string | null; folder: string };
  createdAt: string;
};

function readMediaFactoryHandoff(): MediaFactoryHandoff | null {
  try {
    const raw = sessionStorage.getItem(MEDIA_FACTORY_HANDOFF_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<MediaFactoryHandoff>;
    if (!value.asset || typeof value.asset !== "object") return null;
    const asset = value.asset as Partial<MediaFactoryHandoff["asset"]>;
    if (typeof asset.id !== "string" || typeof asset.name !== "string" || typeof asset.webUrl !== "string") return null;
    return {
      asset: {
        id: asset.id,
        provider: typeof asset.provider === "string" ? asset.provider : "unknown",
        name: asset.name,
        mimeType: typeof asset.mimeType === "string" ? asset.mimeType : "application/octet-stream",
        webUrl: asset.webUrl,
        previewUrl: typeof asset.previewUrl === "string" ? asset.previewUrl : null,
        folder: typeof asset.folder === "string" ? asset.folder : "",
      },
      createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
    };
  } catch {
    return null;
  }
}

function readCoachBrainFactoryContext(): CoachBrainFactoryContext | null {
  try {
    const raw = sessionStorage.getItem(COACH_BRAIN_FACTORY_HANDOFF_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<CoachBrainFactoryContext>;
    if (typeof value.question !== "string" || typeof value.answer !== "string") return null;
    const sources = Array.isArray(value.sources) ? value.sources.filter((source): source is { title: string; url: string } => !!source && typeof source === "object" && typeof source.title === "string" && typeof source.url === "string").slice(0, 5) : [];
    return { question: value.question.slice(0, 1000), answer: value.answer.slice(0, 4000), sources };
  } catch { return null; }
}

type FactoryGeneratedBatchItem = Awaited<ReturnType<typeof buildCoachAyman30DayBatchWithMedia>>[number];

async function mergeValidatedGeminiCreativeFields(
  generatedItems: GeneratedBatchItem[] | null,
  canonicalItems: FactoryGeneratedBatchItem[],
  batchNonce: string,
): Promise<FactoryGeneratedBatchItem[] | null> {
  if (!generatedItems || generatedItems.length !== canonicalItems.length) return null;
  const merged: FactoryGeneratedBatchItem[] = [];

  for (let index = 0; index < canonicalItems.length; index += 1) {
    const generated = generatedItems[index];
    const canonical = canonicalItems[index];
    if (!generated || !canonical) return null;

    const fixedMetadataMatches = generated.platform === canonical.platform
      && generated.contentType === canonical.contentType
      && generated.language === canonical.language
      && generated.contentPillar === canonical.contentPillar
      && generated.contentSlot === canonical.contentSlot
      && generated.cta === canonical.cta
      && JSON.stringify(generated.hashtags) === JSON.stringify(canonical.hashtags);
    if (!fixedMetadataMatches) return null;

    if (typeof generated.topic !== "string" || !generated.topic.trim() || generated.topic.length > 500
      || typeof generated.hook !== "string" || !generated.hook.trim() || generated.hook.length > 500
      || typeof generated.visualPrompt !== "string" || !generated.visualPrompt.trim() || generated.visualPrompt.length > 6000
      || typeof generated.caption !== "string") return null;

    const trackedCtaSuffix = `

${canonical.cta}`;
    if (!generated.caption.endsWith(trackedCtaSuffix)) return null;
    const generatedCaptionBody = generated.caption.slice(0, -trackedCtaSuffix.length).trim();
    if (generatedCaptionBody.length > 6000) return null;

    const canonicalCaptionBody = canonical.caption.endsWith(trackedCtaSuffix)
      ? canonical.caption.slice(0, -trackedCtaSuffix.length).trim()
      : "";
    const canonicalPrimaryCta = canonicalCaptionBody.split(/\\r?\\n/).map((line) => line.trim()).filter(Boolean).at(-1);
    if (!canonicalPrimaryCta || !generatedCaptionBody.endsWith(canonicalPrimaryCta)) return null;

    const topic = generated.topic.trim();
    merged.push({
      ...canonical,
      topic,
      hook: generated.hook.trim(),
      caption: `${generatedCaptionBody}${trackedCtaSuffix}`,
      visualPrompt: generated.visualPrompt.trim(),
      contentFingerprint: await contentFingerprint(`${COACH_AYMAN_PROVIDER_ID}:${batchNonce}:${index}:${canonical.platform}:${topic}`),
    });
  }

  return validateCoachAymanBatch(merged).valid ? merged : null;
}

type ContentGrowthHubProps = {
  items: ContentBatchItem[];
  session: GrowthSession;
  canWrite: boolean;
  busy: boolean;
  activeTab?: "overview" | "strategy" | "factory" | "content" | "designs" | "reels" | "campaigns" | "review" | "connections";
  onApproveItem: (item: ContentBatchItem) => Promise<void>;
  onEditItem?: (item: ContentBatchItem, visualPrompt: string, scheduledFor: string | null) => Promise<void>;
  onRequestChanges: (item: ContentBatchItem, kind: ChangeRequestKind, note: string) => Promise<void>;
  onApproveAll: (items: ContentBatchItem[]) => Promise<void>;
  onBatchCreated?: () => void;
  onSessionExpired?: () => void;
  onOpenMedia?: () => void;
  onTabChange?: (tab: "overview" | "strategy" | "factory" | "content" | "designs" | "reels" | "campaigns" | "review" | "connections") => void;
  onOpenBrain?: () => void;
};

async function callRpc(session: GrowthSession, rpcName: string, body: Record<string, unknown> = {}, signal?: AbortSignal) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(rpcName)}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLIC_KEY,
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (response.status === 401 || response.status === 403) throw new Error("SESSION_EXPIRED");
  if (!response.ok) {
    const text = await response.text();
    if (text.includes("CONTENT_SLOT_ALREADY_PLANNED")) throw new Error("CONTENT_SLOT_ALREADY_PLANNED");
    throw new Error(`RPC_FAILED_${response.status}`);
  }
  return response.json();
}

export default function ContentGrowthHub({
  items,
  session,
  canWrite,
  busy,
  activeTab,
  onApproveItem,
  onEditItem,
  onRequestChanges,
  onApproveAll,
  onBatchCreated,
  onSessionExpired,
  onOpenMedia,
  onTabChange,
  onOpenBrain,
}: ContentGrowthHubProps) {
  const { language, t } = useLanguage();
  const copy = t("contentGrowth");
  const publishCopyFacebook = readPublishingCopy(language, "facebook");
  const publishCopyInstagram = readPublishingCopy(language, "instagram");
  const batches = useMemo(() => groupContentBatches(items), [items]);
  const primaryBatch = useMemo(() => selectPrimaryBatch(batches), [batches]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const selectedBatch = useMemo(() => {
    if (selectedBatchId) return batches.find((batch) => batch.batchId === selectedBatchId) ?? primaryBatch;
    return primaryBatch;
  }, [batches, primaryBatch, selectedBatchId]);
  const pipeline = useMemo(() => summarizePipeline(items), [items]);
  const dayNine = useMemo(() => buildDayNineReminder(items), [items]);
  const batchReady = useMemo(() => buildNextBatchReadyNotice(items), [items]);
  const insights = useMemo(() => buildPerformanceInsights(items), [items]);
  const instagramPublishing = useMemo(() => summarizeLivePublishingReadiness(items, "instagram"), [items]);
  const facebookAudit = useMemo(() => buildFacebookPublishAudit(items), [items]);
  const [automationStatus, setAutomationStatus] = useState<unknown>(null);
  const [staffIntegrations, setStaffIntegrations] = useState<Array<{ provider: string; status: string; lastTestedAt?: string | null }>>([]);
  const [generateNotice, setGenerateNotice] = useState("");
  const [generating, setGenerating] = useState(false);
  const [batchAiProvider, setBatchAiProvider] = useState<BatchAiProvider>("auto");
  const [coachBrainContext, setCoachBrainContext] = useState<CoachBrainFactoryContext | null>(() => {
    if (new URLSearchParams(window.location.search).get("factoryContext") !== "coach-brain") return null;
    return readCoachBrainFactoryContext();
  });
  const [mediaFactoryHandoff, setMediaFactoryHandoff] = useState<MediaFactoryHandoff | null>(() => readMediaFactoryHandoff());
  const [mediaLinkTargetId, setMediaLinkTargetId] = useState("");
  const [mediaLinkBusy, setMediaLinkBusy] = useState(false);
  const [mediaLinkNotice, setMediaLinkNotice] = useState("");
  const reviewAutoOpened = useRef(false);
  const [mediaAssets, setMediaAssets] = useState<ReturnType<typeof parseMediaAssetRecords>>([]);
  const integrations = useMemo(() => readIntegrationStatuses(automationStatus), [automationStatus]);
  const canvaIntegration = staffIntegrations.find((integration) => integration.provider === "canva");
  const canvaCapabilityState = canvaIntegration?.status === "connected" && Boolean(canvaIntegration.lastTestedAt)
    ? "AVAILABLE"
    : canvaIntegration?.status === "connected" || canvaIntegration?.status === "needs_test"
      ? "LIMITED"
      : "NOT_CONFIGURED";
  const videoCapabilityState = integrations.find((integration) => integration.key === "runway")?.capabilityState ?? "NOT_CONFIGURED";
  const PLAN_WINDOW_OPTIONS = [2, 3, 4, 7, 14, 30] as const;
  const handoffParams = new URLSearchParams(window.location.search);
  const [planWindowDays, setPlanWindowDays] = useState<number>(() => {
    const value = Number(handoffParams.get("planDays"));
    return [2, 3, 4, 7, 14, 30].includes(value) ? value : 30;
  });
  const [planFocus] = useState(() => handoffParams.get("planMix") || "varied");
  const [planExecution] = useState(() => handoffParams.get("planExecution") || "best");

  const [activeFactoryTab, setActiveFactoryTab] = useState<"overview" | "strategy" | "factory" | "content" | "designs" | "reels" | "campaigns" | "review" | "connections">(activeTab || (mediaFactoryHandoff ? "content" : "overview"));
  useEffect(() => {
    if (activeTab && activeTab !== activeFactoryTab) {
      setActiveFactoryTab(activeTab);
    }
  }, [activeTab]);
  useEffect(() => {
    const targetId = activeFactoryTab === "content" ? "content-control-room" : ["designs", "reels", "campaigns", "review"].includes(activeFactoryTab) ? "content-review" : `content-${activeFactoryTab}`;
    requestAnimationFrame(() => document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [activeFactoryTab]);
  const showReviewWorkspace = ["designs", "reels", "campaigns", "review"].includes(activeFactoryTab);
  const factoryStages = [
    ["factory", language === "ar" ? "١. التوليد والخطة" : "1. Generate & Plan"],
    ["designs", language === "ar" ? "٢. التصميم والفيديو" : "2. Design & Media"],
    ["review", language === "ar" ? "٣. المراجعة والاعتماد" : "3. Review & Approve"],
    ["campaigns", language === "ar" ? "٤. الجدولة" : "4. Schedule"],
    ["overview", language === "ar" ? "٥. النشر والإيصال" : "5. Publish & Receipt"],
  ] as const;
  const advancedStages = [
    ["strategy", language === "ar" ? "الاستراتيجية" : "Strategy"],
    ["content", language === "ar" ? "قائمة المحتوى" : "Content list"],
    ["connections", language === "ar" ? "الاتصالات" : "Connections"],
  ] as const;
  const planDays = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: planWindowDays }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      const dayItems = items.filter((item) => {
        if (!item.scheduledFor) return false;
        const scheduled = new Date(item.scheduledFor);
        return scheduled.getFullYear() === day.getFullYear() && scheduled.getMonth() === day.getMonth() && scheduled.getDate() === day.getDate();
      });
      return { day, dayItems };
    });
  }, [items, planWindowDays]);

  useEffect(() => {
    const controller = new AbortController();
    callRpc(session, "get_staff_content_automation_status", {}, controller.signal)
      .then(setAutomationStatus)
      .catch(() => setAutomationStatus(null));
    callRpc(session, "get_staff_integrations", {}, controller.signal)
      .then((raw) => {
        if (controller.signal.aborted) return;
        const items = raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown[] }).items) ? (raw as { items: unknown[] }).items : [];
        setStaffIntegrations(items.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const value = item as Record<string, unknown>;
          return typeof value.provider === "string" && typeof value.status === "string"
            ? [{ provider: value.provider, status: value.status, lastTestedAt: typeof value.lastTestedAt === "string" ? value.lastTestedAt : null }]
            : [];
        }));
      })
      .catch(() => setStaffIntegrations([]));
    callRpc(session, "get_staff_media_assets", {}, controller.signal)
      .then((raw) => { if (!controller.signal.aborted) setMediaAssets(parseMediaAssetRecords(raw)); })
      .catch(() => { if (!controller.signal.aborted) setMediaAssets([]); });
    return () => controller.abort();
  }, [session]);

  useEffect(() => {
    if (!selectedBatchId && primaryBatch) setSelectedBatchId(primaryBatch.batchId);
  }, [primaryBatch, selectedBatchId]);

  useEffect(() => {
    if (!reviewAutoOpened.current && activeFactoryTab === "overview" && primaryBatch?.items.some((item) => ["draft", "generated", "needs_review"].includes(item.status))) {
      reviewAutoOpened.current = true;
      setActiveFactoryTab("review");
    }
  }, [activeFactoryTab, primaryBatch]);

  const batchItems = selectedBatch?.items ?? [];
  const mediaLinkCandidates = useMemo(() => batchItems.filter((item) => ["draft", "generated", "needs_review", "approved"].includes(item.status) && !item.mediaAssetId), [batchItems]);
  const strategySummary = useMemo(() => buildStrategySummary(batchItems), [batchItems]);
  const panelBusy = busy || generating;
  useEffect(() => {
    if (!mediaLinkTargetId || !mediaLinkCandidates.some((item) => item.id === mediaLinkTargetId)) {
      setMediaLinkTargetId(mediaLinkCandidates[0]?.id ?? "");
    }
  }, [mediaLinkCandidates, mediaLinkTargetId]);

  async function linkSelectedMediaToContent() {
    if (!session || !canWrite || mediaLinkBusy || !mediaFactoryHandoff || !mediaLinkTargetId) return;
    setMediaLinkBusy(true);
    setMediaLinkNotice("");
    try {
      const result = await callRpc(session, "link_staff_media_to_content_item", {
        p_content_item_id: mediaLinkTargetId,
        p_media_asset_id: mediaFactoryHandoff.asset.id,
      }) as Record<string, unknown>;
      if (result.success !== true) throw new Error(String(result.code ?? "MEDIA_LINK_FAILED"));
      sessionStorage.removeItem(MEDIA_FACTORY_HANDOFF_KEY);
      setMediaFactoryHandoff(null);
      setMediaLinkNotice(language === "ar" ? "تم ربط الوسائط بالمحتوى فعليًا. أعيدت الحالة إلى المراجعة قبل أي نشر." : "Media is now linked to the content. The item returned to review before any publish.");
      onBatchCreated?.();
    } catch (cause) {
      if (cause instanceof Error && cause.message === "SESSION_EXPIRED") onSessionExpired?.();
      else setMediaLinkNotice(cause instanceof Error ? cause.message : "MEDIA_LINK_FAILED");
    } finally {
      setMediaLinkBusy(false);
    }
  }
  const instagramNextStepCopy = {
    review: publishCopyInstagram.livePublishNextReview,
    approve: publishCopyInstagram.livePublishNextApprove,
    publish_via_n8n: publishCopyInstagram.livePublishNextN8n,
    verify_receipt: publishCopyInstagram.livePublishNextVerify,
    continue_batch: publishCopyInstagram.livePublishNextContinue,
  }[instagramPublishing.nextAction];

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("factoryContext") !== "coach-brain") return;
    setCoachBrainContext(readCoachBrainFactoryContext());
    sessionStorage.removeItem(COACH_BRAIN_FACTORY_HANDOFF_KEY);
  }, []);

  function fitBatchToPlanWindow<T extends { plannedFor: string }>(batch: T[], days: number, baseStart: Date): T[] {
    if (days >= 30) return batch;
    const start = new Date(baseStart);
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() + 1);
    return batch.map((item, index) => {
      const source = new Date(item.plannedFor);
      const target = new Date(start);
      const dayOffset = Math.min(days - 1, Math.floor((index * days) / Math.max(batch.length, 1)));
      target.setUTCDate(start.getUTCDate() + dayOffset);
      target.setUTCHours(source.getUTCHours(), source.getUTCMinutes(), 0, 0);
      return { ...item, plannedFor: target.toISOString() };
    });
  }

  async function generateCoachAymanBatch(options: { automatic?: boolean } = {}) {
    if (!canWrite || panelBusy) return;
    if (!options.automatic && !window.confirm(copy.generateConfirm)) return;
    setGenerating(true);
    setGenerateNotice("");
    try {
      const nonce = crypto.randomUUID();
      const generationStart = new Date();
      const mediaRaw = await callRpc(session, "get_staff_media_assets", {});
      const assets = parseMediaAssetRecords(mediaRaw);
      let knowledgeContext = parseCoachKnowledgeContext(null);
      try {
        const knowledgeRaw = await callRpc(session, "get_staff_knowledge_management", { p_search: null, p_language: null, p_status: "active" });
        knowledgeContext = parseCoachKnowledgeContext(knowledgeRaw);
      } catch {
        knowledgeContext = parseCoachKnowledgeContext(null);
      }
      if (coachBrainContext) knowledgeContext = { ...knowledgeContext, researchContext: coachBrainContext };
      const promptContext: GeminiBatchPromptContext = {
        academyKnowledge: knowledgeContext.entries,
        coachBrainResearch: knowledgeContext.researchContext ?? null,
        businessStrategy: { brand: BRAND, platformGuidance: PLATFORM_GUIDANCE, strategySummary: { ...strategySummary, currentBatchStrategy: planFocus } },
        performanceGuidance: insights,
      };
      let geminiItems: GeneratedBatchItem[] | null = null;
      try {
        const selectedProvider: BatchAiProvider = planExecution === "value" ? "gemini" : batchAiProvider;
        geminiItems = await generateCoachAymanBatchWithProvider(session, selectedProvider, nonce, generationStart, promptContext);
      } catch (cause) {
        if (cause instanceof Error && cause.message === "SESSION_EXPIRED") throw cause;
        geminiItems = null;
      }
      let saved: { success?: boolean; batchId?: string; code?: string } | null = null;

      for (let shiftDays = 0; shiftDays <= 45 && !saved; shiftDays += 1) {
        const start = new Date(generationStart);
        start.setUTCDate(start.getUTCDate() + shiftDays);
        const batchNonce = shiftDays === 0 ? nonce : `${nonce}-${shiftDays}`;
        const canonicalItems = await buildCoachAyman30DayBatchWithMedia(assets, start, batchNonce, knowledgeContext);
        const windowedCanonicalItems = fitBatchToPlanWindow(canonicalItems, planWindowDays, start);
        const items = await mergeValidatedGeminiCreativeFields(geminiItems, windowedCanonicalItems, batchNonce) ?? windowedCanonicalItems;

        try {
          saved = await callRpc(session, "create_staff_generated_content_batch", {
            p_items: items,
            p_provider_external_id: COACH_AYMAN_PROVIDER_ID,
          }) as { success?: boolean; batchId?: string; code?: string };
        } catch (cause) {
          const code = cause instanceof Error ? cause.message : "GENERATE_FAILED";
          if (code === "CONTENT_SLOT_ALREADY_PLANNED") continue;
          throw cause;
        }
      }

      if (!saved?.success || !saved.batchId) throw new Error(saved?.code ?? "GENERATE_FAILED");
      setGenerateNotice(copy.generateSuccess.replace("{batchId}", saved.batchId));
      setSelectedBatchId(saved.batchId);
      setMediaAssets(assets);
      onBatchCreated?.();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "GENERATE_FAILED";
      if (code === "SESSION_EXPIRED") {
        onSessionExpired?.();
        return;
      }
      setGenerateNotice(copy.generateError);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="content-growth-hub" dir={language === "ar" ? "rtl" : "ltr"}>
      <section className="factory-control-room" aria-labelledby="factory-control-room-title">
        <div className="factory-control-room-heading">
          <div><span>{language === "ar" ? "مصنع واحد" : "ONE FACTORY"}</span><h2 id="factory-control-room-title">{language === "ar" ? "مسار الدعاية والنشر" : "Campaign and publishing flow"}</h2><p>{language === "ar" ? "افتح مرحلة واحدة، عدّل العنصر، ثم احفظ أو انقله للمرحلة التالية." : "Open one stage, edit the item, then save or move it to the next stage."}</p></div>
          <div className="factory-control-room-status"><strong>{selectedBatch ? selectedBatch.items.length : 0}</strong><span>{language === "ar" ? "عنصر في الدفعة" : "items in batch"}</span></div>
        </div>
        <div className="factory-stage-rail" role="list" aria-label={language === "ar" ? "مراحل المصنع" : "Factory stages"}>
          {factoryStages.map(([id, label], index) => <button type="button" role="listitem" key={id} className={activeFactoryTab === id ? "active" : ""} onClick={() => { setActiveFactoryTab(id); onTabChange?.(id); }}><b>{index + 1}</b><span>{label}</span></button>)}
        </div>
        <div className="factory-advanced-rail" aria-label={language === "ar" ? "أدوات إضافية" : "Additional tools"}>
          <span>{language === "ar" ? "أدوات إضافية:" : "Additional tools:"}</span>
          {advancedStages.map(([id, label]) => (
            <button type="button" key={id} className={activeFactoryTab === id ? "active" : ""} onClick={() => { setActiveFactoryTab(id); onTabChange?.(id); }}>
              {label}
            </button>
          ))}
        </div>
      </section>
      {(activeFactoryTab === "factory" || activeFactoryTab === "strategy") && (
        <section className="factory-30-day-plan" aria-labelledby="factory-30-day-title">
          <header><div><span>{language === "ar" ? "خطة Coach Brain" : "COACH BRAIN PLAN"}</span><h3 id="factory-30-day-title">{language === "ar" ? "حدد المدة ودع Coach Brain يبني التوزيع" : "Choose the window and let Coach Brain shape the mix"}</h3></div><small>{language === "ar" ? "نفس المصنع والبنية الحالية؛ المدة تحدد نافذة الجدولة فقط." : "Same Factory and existing infrastructure; the window controls scheduling only."}</small></header>
          <div className="factory-plan-controls">
            <label className="batch-ai-provider"><span>{language === "ar" ? "عدد الأيام" : "Plan length"}</span><select value={planWindowDays} onChange={(event) => setPlanWindowDays(Number(event.target.value))} disabled={panelBusy}>{PLAN_WINDOW_OPTIONS.map((days) => <option key={days} value={days}>{language === "ar" ? days + " يوم" : days + " days"}</option>)}</select></label>
            <div className="factory-plan-summary"><strong>{language === "ar" ? "سنوزع " + DEFAULT_BATCH_MIX.length + " أفكار متنوعة على " + planWindowDays + " يومًا." : "Coach Brain will distribute " + DEFAULT_BATCH_MIX.length + " varied ideas across " + planWindowDays + " days."}</strong><span>{language === "ar" ? "تعليم · أمان · ثقة بالماء · أسئلة الأهل · سلطة الكوتش · محلي أبوظبي · ريلز · تحويل." : "Education · safety · water confidence · parent FAQs · coach authority · Abu Dhabi local · Reels · conversion."}</span></div>
          </div>
          <div className="factory-30-day-grid">
            {planDays.map(({ day, dayItems }, index) => <button type="button" key={day.toISOString()} className={dayItems.length > 0 ? "has-items" : ""} onClick={() => { setActiveFactoryTab(dayItems.length > 0 ? "campaigns" : "strategy"); onTabChange?.(dayItems.length > 0 ? "campaigns" : "strategy"); }}><span>{language === "ar" ? `اليوم ${index + 1}` : `Day ${index + 1}`}</span><strong>{dayItems.length}</strong><small>{day.toLocaleDateString(language === "ar" ? "ar-AE" : "en-AE", { month: "short", day: "numeric" })}</small>{dayItems.slice(0, 2).map((item) => <em key={item.id}>{item.topic}</em>)}</button>)}
          </div>
        </section>
      )}
      {activeFactoryTab === "overview" && batchReady?.show && (
        <div className="content-growth-banner batch-ready-banner" role="status">
          <strong>{copy.batchReadyTitle}</strong>
          <p>{copy.batchReadyBody
            .replace("{count}", String(batchReady.reviewableCount))
            .replace("{real}", String(batchReady.realMediaCount))
            .replace("{pending}", String(batchReady.pendingMediaCount))}</p>
        </div>
      )}

      {activeFactoryTab === "overview" && dayNine?.show && (
        <div className="content-growth-banner" role="status">
          <strong>{copy.dayNineTitle}</strong>
          <p>{copy.dayNineBody.replace("{count}", String(dayNine.reviewableCount)).replace("{day}", String(dayNine.cycleDay))}</p>
        </div>
      )}

      {coachBrainContext && <div className="content-growth-banner" role="status"><strong>{language === "ar" ? "سياق Coach Brain متاح للمصنع" : "Coach Brain context is available to Factory"}</strong><p>{coachBrainContext.question}</p><small>{language === "ar" ? "يُستخدم كسياق بحثي مساعد فقط؛ المعرفة الأكاديمية الأساسية تبقى من المصدر الحالي." : "Used only as supporting research context; canonical Academy Knowledge remains the existing source."}</small></div>}
      {mediaFactoryHandoff && <div className="content-growth-banner" role="status">
        <strong>{language === "ar" ? "أصل وسائط جاهز داخل المصنع" : "Media asset ready in Factory"}</strong>
        <p>{mediaFactoryHandoff.asset.name} · {mediaFactoryHandoff.asset.provider}</p>
        <small>{language === "ar" ? "اختر عنصر محتوى حقيقيًا لربط الأصل به. لن يتم النشر تلقائيًا؛ بعد الربط يعود العنصر للمراجعة." : "Choose a real content item to link this asset to. Nothing publishes automatically; the item returns to review after linking."}</small>
        {mediaLinkCandidates.length > 0 ? (
          <div className="media-factory-link-control">
            <label htmlFor="media-factory-target">{language === "ar" ? "اربطه بهذا المحتوى" : "Link it to this content"}</label>
            <select id="media-factory-target" value={mediaLinkTargetId} onChange={(event) => setMediaLinkTargetId(event.target.value)} disabled={mediaLinkBusy || !canWrite}>
              {mediaLinkCandidates.map((item) => <option key={item.id} value={item.id}>{item.platform} · {item.contentType} · {item.topic || item.hook || item.id.slice(0, 8)}</option>)}
            </select>
            <button type="button" className="primary-button" disabled={mediaLinkBusy || !canWrite || !mediaLinkTargetId} onClick={() => void linkSelectedMediaToContent()}>
              {mediaLinkBusy ? (language === "ar" ? "جاري الربط…" : "Linking…") : (language === "ar" ? "ربط الوسائط الآن" : "Link media now")}
            </button>
          </div>
        ) : (
          <small>{language === "ar" ? "لا يوجد حاليًا محتوى مسودة يحتاج وسائط. اختر/أنشئ محتوى أولًا، ثم سيظهر هنا للربط." : "There is no draft content waiting for media right now. Create or select content first, then it will appear here."}</small>
        )}
        <a className="today-quick-action" href={mediaFactoryHandoff.asset.webUrl} target="_blank" rel="noreferrer noopener">{language === "ar" ? "فتح الأصل" : "Open asset"}</a>
        {mediaLinkNotice && <small role="status">{mediaLinkNotice}</small>}
      </div>}

      {generateNotice && <div className="notice-box" aria-live="polite">{generateNotice}</div>}

      {activeFactoryTab === "overview" && facebookAudit && (
        <section className="content-growth-section facebook-audit-section" aria-labelledby="facebook-audit-heading">
          <header>
            <p>{copy.pipelineEyebrow}</p>
            <h3 id="facebook-audit-heading">{publishCopyFacebook.facebookAuditTitle}</h3>
          </header>
          <p className="batch-meta">{publishCopyFacebook.facebookAuditBody}</p>
          <div className="facebook-audit-grid" role="group" aria-label={publishCopyFacebook.facebookAuditTitle}>
            <article><span>{publishCopyFacebook.facebookAuditPostId}</span><strong dir="ltr">{facebookAudit.externalPostId ?? copy.notConnected}</strong></article>
            <article><span>{publishCopyFacebook.facebookAuditReceipt}</span><strong>{facebookAudit.receiptStatus ?? copy.notConnected}</strong></article>
            <article><span>{publishCopyFacebook.publishedAtLabel}</span><strong>{facebookAudit.publishedAt ?? copy.notConnected}</strong></article>
          </div>
          <p className="batch-meta">{facebookAudit.topic}</p>
          {facebookAudit.needsManualPublicCheck && (
            <p className="facebook-audit-warning" role="status">{publishCopyFacebook.facebookAuditManualCheck}</p>
          )}
          {facebookAudit.postUrl && (
            <a className="today-quick-action" href={facebookAudit.postUrl} target="_blank" rel="noreferrer noopener">
              {publishCopyFacebook.openLivePost}
            </a>
          )}
        </section>
      )}

      {activeFactoryTab === "overview" && <section id="content-overview" className="content-growth-section live-publish-section" aria-labelledby="live-publish-heading">
        <header>
          <p>{copy.pipelineEyebrow}</p>
          <h3 id="live-publish-heading">{publishCopyInstagram.livePublishTitle}</h3>
        </header>
        <p className="batch-meta">{publishCopyInstagram.livePublishBody}</p>
        {!AUTHORIZED_INSTAGRAM_PUBLISH_ITEM_ID && (
          <p className="batch-meta">{publishCopyInstagram.instagramPickAuthorized}</p>
        )}
        <div className="live-publish-grid" aria-label={publishCopyInstagram.livePublishTitle}>
          <article><span>{copy.approved}</span><strong>{instagramPublishing.approvedCount}</strong></article>
          <article><span>{publishCopyInstagram.livePublishAwaiting}</span><strong>{instagramPublishing.awaitingN8nCount}</strong></article>
          <article><span>{copy.published}</span><strong>{instagramPublishing.publishedLiveCount}</strong></article>
          <article><span>{copy.failed}</span><strong>{instagramPublishing.failedCount}</strong></article>
        </div>
        <p className="live-publish-next-step" role="status">{instagramNextStepCopy}</p>
        {instagramPublishing.authorizedItem && (
          <div className="authorized-post-banner" role="status">
            <strong>{publishCopyInstagram.authorizedPostTitle}</strong>
            <span>{instagramPublishing.authorizedStage === "published_live" ? publishCopyInstagram.authorizedPostLive : publishCopyInstagram.authorizedPostPending}</span>
            <span>{instagramPublishing.authorizedItem.topic}</span>
          </div>
        )}
        {onOpenBrain && (
          <div className="overview-brain-action">
            <button
              type="button"
              className="today-quick-action"
              onClick={onOpenBrain}
            >
              {language === "ar" ? "🧠 استشر Coach Brain حول هذه النتائج والخطوة القادمة" : "🧠 Consult Coach Brain on results & next steps"}
            </button>
          </div>
        )}
      </section>}

      {activeFactoryTab === "factory" && <section id="content-factory" className="content-growth-section" aria-labelledby="generate-batch-heading">
        <header>
          <p>{copy.generateEyebrow}</p>
          <h3 id="generate-batch-heading">{copy.generateTitle}</h3>
        </header>
        <p className="batch-meta">{copy.generateBody}</p>
        <p className="batch-meta">
          {copy.activeBatchLabel}: {selectedBatch && isDatabaseBatchId(selectedBatch.batchId) ? selectedBatch.batchId : copy.notConnected}
        </p>
        <label className="batch-ai-provider">
          <span>{language === "ar" ? "مزود الذكاء" : "AI provider"}</span>
          <select value={batchAiProvider} onChange={(event) => setBatchAiProvider(event.target.value as BatchAiProvider)} disabled={generating || panelBusy}>
            <option value="auto">{language === "ar" ? "تلقائي — الأفضل المتاح" : "Auto — best available"}</option>
            <option value="gemini">Gemini</option>
            <option value="openai">OpenAI</option>
          </select>
        </label>
        <button type="button" className="primary-button" disabled={!canWrite || panelBusy} onClick={() => void generateCoachAymanBatch()}>
          {generating ? copy.generateBusy : copy.generateButton}
        </button>
        <p className="batch-meta" role="status">
          {language === "ar"
            ? "لا يتم توليد أي دفعة تلقائيًا. استخدم زر التوليد بعد مراجعة الخطة وتأكيدك؛ كل العناصر تبدأ للمراجعة ولا يتم نشرها تلقائيًا."
            : "No batch is generated automatically. Use the generate button after reviewing the plan and confirming; every item starts in review and nothing publishes automatically."}
        </p>
        <p className="batch-meta" role="status">{generating ? copy.generateStateBusy : selectedBatch ? copy.generateStateReady : copy.generateStateIdle}</p>
        {selectedBatch && <button type="button" className="secondary" onClick={() => { setActiveFactoryTab("review"); onTabChange?.("review"); }}>{copy.openBatchReview}</button>}
        <p className="batch-meta">{copy.generateMixNote}</p>
      </section>}

      {showReviewWorkspace && <section id="content-review" className="content-growth-section" aria-labelledby="content-pipeline-heading">
        <header>
          <p>{copy.pipelineEyebrow}</p>
          <h3 id="content-pipeline-heading">{copy.pipelineTitle}</h3>
        </header>
        <div className="content-pipeline-grid" aria-label={copy.pipelineTitle}>
          <article><span>{copy.needsReview}</span><strong>{pipeline.needsReview}</strong></article>
          <article><span>{copy.approved}</span><strong>{pipeline.approved}</strong></article>
          <article><span>{copy.scheduled}</span><strong>{pipeline.scheduled}</strong></article>
          <article><span>{copy.published}</span><strong>{pipeline.published}</strong></article>
          <article><span>{copy.failed}</span><strong>{pipeline.failed}</strong></article>
          <article><span>{copy.totalItems}</span><strong>{pipeline.total}</strong></article>
        </div>
      </section>}

      {activeFactoryTab === "connections" && <section id="content-connections" className="content-growth-section" aria-labelledby="integration-status-heading">
        <header>
          <p>{copy.integrationsEyebrow}</p>
          <h3 id="integration-status-heading">{copy.integrationsTitle}</h3>
        </header>
        <div className="integration-grid">
          {integrations.map((integration) => (
            <article key={integration.key} className={integration.connected ? "connected" : integration.key === "canva" ? "optional" : "disconnected"}>
              <strong>{copy.integrationLabels[integration.key]}</strong>
              <small>{displayCapabilityState(integration.capabilityState, language)} · {integration.key === "canva" ? copy.optionalNotConnected : integration.connected ? copy.connected : copy.notConnected}</small>
              <small>{integration.detail}</small>
            </article>
          ))}
        </div>
        <p className="batch-meta">{copy.integrationsNote}</p>
        <p className="batch-meta" role="status">
          {language === "ar"
            ? "إدارة اتصال Canva ومصادر الوسائط تتم من مكتبة الوسائط فقط؛ هذه الصفحة تعرض الحالة ولا تنشئ نقطة اتصال ثانية."
            : "Canva and media-source connections are managed only in Media Library; this page shows status without creating a second connection control."}
        </p>
      </section>}

      {activeFactoryTab === "strategy" && <section id="content-strategy" className="content-growth-section" aria-labelledby="strategy-mix-heading">
        <header>
          <p>{copy.strategyEyebrow}</p>
          <h3 id="strategy-mix-heading">{copy.strategyTitle}</h3>
        </header>
        <div className="factory-section-action-bar">
          <strong>{language === "ar" ? "الخطة جاهزة للتنفيذ" : "This plan is ready to use"}</strong>
          <span>{language === "ar" ? "لا تكتفِ بقراءة التوزيع: أنشئ دفعة أو افتح المحتوى الحالي للتعديل." : "Do not just read the mix: create a batch or open current content for editing."}</span>
          <div>
            <button type="button" className="primary-button" onClick={() => { setActiveFactoryTab("factory"); onTabChange?.("factory"); }}>{language === "ar" ? "إنشاء دفعة من الخطة" : "Create batch from plan"}</button>
            <button type="button" className="secondary" onClick={() => { setActiveFactoryTab("content"); onTabChange?.("content"); }}>{language === "ar" ? "فتح المحتوى للتعديل" : "Open content editor"}</button>
          </div>
        </div>
        <div className="strategy-context-grid" aria-label={copy.strategyContextTitle}>
          <article><span>{copy.strategyAudienceLabel}</span><strong>{strategySummary.audience}</strong><small>{strategySummary.platforms.join(" · ")}</small></article>
          <article><span>{copy.strategyGoalsLabel}</span><ul>{strategySummary.goals.map((goal) => <li key={goal}>{goal}</li>)}</ul></article>
          <article><span>{copy.strategyIntentLabel}</span><strong>{strategySummary.publishingIntent}</strong></article>
          <article><span>{copy.strategyBatchLabel}</span><strong>{strategySummary.currentBatchStrategy}</strong><small>{copy.trustLabel}: {strategySummary.trustConversionBalance.trust} · {copy.conversionLabel}: {strategySummary.trustConversionBalance.conversion}</small></article>
        </div>
        <ul className="strategy-mix-list">
          {DEFAULT_BATCH_MIX.map((slot, index) => (
            <li key={`${slot.labelKey}-${index}`}>
              <strong>{copy.mixLabels[slot.labelKey as keyof typeof copy.mixLabels] ?? slot.labelKey}</strong>
              <span>{slot.platform.toUpperCase()} · {slot.contentType} · {copy.timeSlots[slot.timeSlot]}</span>
              <span>{PLATFORM_GUIDANCE[slot.platform].focus}</span>
            </li>
          ))}
        </ul>
      </section>}

      {activeFactoryTab === "strategy" && <section className="content-growth-section" aria-labelledby="insights-heading">
        <header>
          <p>{copy.insightsEyebrow}</p>
          <h3 id="insights-heading">{copy.insightsTitle}</h3>
        </header>
        <ul className="insight-list">
          {insights.map((insight) => (
            <li key={insight.id}>
              <strong>{insight.label}</strong>
              <span>{copy.directionLabels[insight.direction]} · {insight.reason}</span>
            </li>
          ))}
        </ul>
      </section>}

      {showReviewWorkspace && batches.length > 1 && (
        <div className="batch-switcher" aria-label={copy.batchSwitcherAria}>
          <label htmlFor="factory-batch-select">
            {language === "ar" ? "الدفعة التي تعمل عليها الآن" : "Current batch"}
          </label>
          <select
            id="factory-batch-select"
            value={selectedBatch?.batchId ?? ""}
            onChange={(event) => setSelectedBatchId(event.target.value)}
          >
            {batches.map((batch, index) => {
              const needsReview = batch.items.filter((item) => ["draft", "generated", "needs_review"].includes(item.status)).length;
              const approved = batch.items.filter((item) => item.status === "approved").length;
              return (
                <option key={batch.batchId} value={batch.batchId}>
                  {(batch.isExplicitBatch ? batch.batchId : `${copy.reviewWindow} ${index + 1}`)} · {batch.items.length} {language === "ar" ? "عنصر" : "items"} · {needsReview} {language === "ar" ? "مراجعة" : "to review"} · {approved} {language === "ar" ? "معتمد" : "approved"}
                </option>
              );
            })}
          </select>
        </div>
      )}

      {showReviewWorkspace && selectedBatch && (
          <ContentBatchReviewPanel
            items={batchItems}
            batch={selectedBatch}
            workspaceMode={activeFactoryTab === "designs" || activeFactoryTab === "reels" || activeFactoryTab === "campaigns" || activeFactoryTab === "review" ? activeFactoryTab : "review"}
            designCapabilityState={canvaCapabilityState}
            videoCapabilityState={videoCapabilityState}
            canWrite={canWrite}
          busy={panelBusy}
          session={session}
          mediaAssets={mediaAssets}
          onMediaLinked={() => {
            void callRpc(session, "get_staff_media_assets", {})
              .then((raw) => setMediaAssets(parseMediaAssetRecords(raw)))
              .catch(() => undefined);
            onBatchCreated?.();
          }}
          onApproveItem={onApproveItem}
          onEditItem={onEditItem}
          onRequestChanges={onRequestChanges}
          onApproveAll={onApproveAll}
          onPublishRequested={onBatchCreated}
          onSessionExpired={onSessionExpired}
          onOpenConnections={onOpenMedia}
        />
      )}
    </div>
  );
}
