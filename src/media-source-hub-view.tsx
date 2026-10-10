import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Image as ImageIcon, Search, ShieldCheck, Sparkles, Video } from "lucide-react";
import { useLanguage } from "./i18n";
import { connectProviderMedia, fetchProviderMedia } from "./media-source-connectors";
import {
  buildCreativeBrief, canSelectForCreative, CREATIVE_FORMAT_LABELS, filterRemoteMedia, MEDIA_PROVIDER_LABELS,
  readProviderConnections, type MediaProviderKey, type RemoteMediaItem,
} from "./media-source-hub";
import "./media-source-hub.css";

type HubSession = { accessToken: string };
type Props = { onOpenProvider?: (provider: MediaProviderKey) => void; onNavigate?: (section: string) => void; session?: HubSession; canWrite?: boolean; onChanged?: () => void; onSessionExpired?: () => void };
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const SUPABASE_PUBLIC_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

async function callRpc(session: HubSession, rpcName: string, body: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(rpcName)}`, { method: "POST", headers: { apikey: SUPABASE_PUBLIC_KEY, Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
  if (response.status === 401 || response.status === 403) throw new Error("SESSION_EXPIRED");
  if (!response.ok) throw new Error(`RPC_FAILED_${response.status}`);
  return response.json();
}

export default function MediaSourceHubView({ onOpenProvider, onNavigate, session, canWrite = false, onChanged, onSessionExpired }: Props) {
  const { language } = useLanguage(); const ar = language === "ar";
  const [query, setQuery] = useState(""); const [provider, setProvider] = useState<MediaProviderKey | "all">("all");
  const [selected, setSelected] = useState<RemoteMediaItem | null>(null); const [objective, setObjective] = useState(ar ? "تعليم السباحة بثقة وأمان" : "Confident, safe swimming lessons");
  const [briefLanguage, setBriefLanguage] = useState<"ar" | "en">(language); const [copied, setCopied] = useState(false);
  const [items, setItems] = useState<RemoteMediaItem[]>([]); const [busy, setBusy] = useState<MediaProviderKey | "factory" | null>(null); const [notice, setNotice] = useState("");
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const connections = useMemo(() => readProviderConnections(import.meta.env as unknown as Record<string, unknown>), []);
  const filteredItems = useMemo(() => filterRemoteMedia(items, query, provider), [items, query, provider]);
  const brief = selected ? buildCreativeBrief(selected, briefLanguage, objective) : null;

  async function connect(providerKey: MediaProviderKey) {
    if (busy) return; setBusy(providerKey); setNotice("");
    try { const token = await connectProviderMedia(providerKey); const loaded = await fetchProviderMedia(providerKey, token); setItems((current) => [...current.filter((item) => item.provider !== providerKey), ...loaded]); setProvider(providerKey); setNotice(ar ? `تم تحميل ${loaded.length} أصل حقيقي من ${MEDIA_PROVIDER_LABELS[providerKey]}.` : `${loaded.length} real assets loaded from ${MEDIA_PROVIDER_LABELS[providerKey]}.`); }
    catch (cause) {
      const code = cause instanceof Error ? cause.message : "MEDIA_SOURCE_CONNECT_FAILED";
      const messages: Record<string, string> = {
        GOOGLE_PROVIDER_NOT_CONFIGURED: ar ? "الاتصال بـ Google غير مهيأ داخل التطبيق بعد. لا تحتاج إدخال Token؛ المطلوب إعداد OAuth للتطبيق مرة واحدة." : "Google connection is not configured in the app yet. You do not need to enter a token; the app needs its OAuth setup once.",
        GOOGLE_OAUTH_UNAVAILABLE: ar ? "تعذر تشغيل اتصال Google الآن. لا يوجد Token مطلوب منك." : "Google OAuth could not start. No token is required from you.",
        DROPBOX_NOT_CONFIGURED: ar ? "Dropbox غير مهيأ داخل التطبيق بعد. لا تدخل Token؛ نحتاج إعداد OAuth للتطبيق فقط." : "Dropbox is not configured in the app yet. Do not enter a token; the app only needs its OAuth setup.",
        ONEDRIVE_NOT_CONFIGURED: ar ? "OneDrive غير مهيأ داخل التطبيق بعد. لا تدخل Token؛ نحتاج إعداد OAuth للتطبيق فقط." : "OneDrive is not configured in the app yet. Do not enter a token; the app only needs its OAuth setup.",
        GOOGLE_DRIVE_FOLDER_NOT_CONFIGURED: ar ? "Google Drive متصل، لكن مجلد الأرشيف لم يُحدد داخل التطبيق." : "Google Drive is connected, but the archive folder is not configured in the app.",
      };
      setNotice(messages[code] ?? code);
    }
    finally { setBusy(null); }
  }
  async function saveToLibrary(item: RemoteMediaItem) {
    if (!session || !canWrite || savedIds.has(item.id)) return; setBusy(item.provider); setNotice("");
    try { await callRpc(session, "register_staff_external_media_asset", { p_asset_type: item.mimeType.startsWith("video/") ? "video" : "image", p_provider: item.provider, p_external_id: item.id, p_name: item.name, p_mime_type: item.mimeType, p_web_url: item.webUrl, p_preview_url: item.previewUrl ?? null, p_size_bytes: item.sizeBytes ?? null, p_created_at: item.createdAt ?? null, p_folder: item.folder ?? null }); setSavedIds((current) => new Set(current).add(item.id)); onChanged?.(); setNotice(ar ? "تم ربط الأصل بالمكتبة وحالته تحتاج مراجعة." : "Asset linked to Media Library as Needs review."); }
    catch (cause) { const code = cause instanceof Error ? cause.message : "MEDIA_LIBRARY_LINK_FAILED"; if (code === "SESSION_EXPIRED") onSessionExpired?.(); else setNotice(code); }
    finally { setBusy(null); }
  }
  async function copyBrief() { if (!brief) return; await navigator.clipboard?.writeText(JSON.stringify(brief, null, 2)); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }

  async function useInFactory() {
    if (!selected || !session || !canWrite || busy) return;
    setBusy("factory");
    setNotice("");
    try {
      const raw = await callRpc(session, "register_staff_external_media_asset", {
        p_asset_type: selected.mimeType.startsWith("video/") ? "video" : "image",
        p_provider: selected.provider,
        p_external_id: selected.id,
        p_name: selected.name,
        p_mime_type: selected.mimeType,
        p_web_url: selected.webUrl,
        p_preview_url: selected.previewUrl ?? null,
        p_size_bytes: selected.sizeBytes ?? null,
        p_created_at: selected.createdAt ?? null,
        p_folder: selected.folder ?? null,
      }) as Record<string, unknown>;
      const mediaAssetId = typeof raw.mediaAssetId === "string" ? raw.mediaAssetId : "";
      if (!mediaAssetId) throw new Error(String(raw.code ?? "MEDIA_LIBRARY_LINK_FAILED"));
      sessionStorage.setItem("media-factory-handoff", JSON.stringify({
        asset: {
          id: mediaAssetId,
          provider: selected.provider,
          name: selected.name,
          mimeType: selected.mimeType,
          webUrl: selected.webUrl,
          previewUrl: selected.previewUrl ?? null,
          folder: selected.folder,
        },
        createdAt: new Date().toISOString(),
      }));
      onChanged?.();
      setNotice(ar ? "تم حفظ الأصل في مكتبة الوسائط وتجهيزه للمصنع. سيطلب منك اختيار المحتوى قبل الربط." : "The asset is now in Media Library and ready for Factory. You will choose the content item before linking.");
      onNavigate?.("content");
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "MEDIA_LIBRARY_LINK_FAILED";
      if (code === "SESSION_EXPIRED") onSessionExpired?.();
      else setNotice(code);
    } finally {
      setBusy(null);
    }
  }

  return <div className="media-source-hub">
    <div className="media-hub-banner"><div><p className="media-hub-kicker">{ar ? "مركز مصادر الوسائط ومصنع الإعلانات" : "MEDIA SOURCE HUB + CREATIVE FACTORY"}</p><h2>{ar ? "اختر الأصل المناسب، ثم راجعه قبل أي استخدام" : "Choose the right asset, then review it before any use"}</h2><p>{ar ? "قراءة فقط من السحابات. لا تحفظ الرموز ولا تنشر تلقائيًا." : "Read-only cloud access. Tokens are not persisted and nothing publishes automatically."}</p></div><div className="media-hub-banner-actions"><span className="demo-mode-badge">{ar ? "لا توجد نتائج وهمية" : "NO FABRICATED RESULTS"}</span><div className="media-hub-safe"><ShieldCheck size={18} /> {ar ? "خصوصية ومراجعة قبل النشر" : "Privacy + review before publish"}</div></div></div>
    <section className="provider-strip" aria-label={ar ? "مصادر الوسائط" : "Media sources"}>{connections.map((connection) => <div className={`provider-chip ${connection.configured ? "configured" : ""}`} key={connection.key}><div className="provider-chip-top"><span>{connection.label}</span><small>{connection.configured ? (ar ? "الإعداد موجود · يلزم اتصال" : "Configuration present · connection required") : (ar ? "غير متصل · يحتاج إعداداً" : "Not connected · setup required")}</small></div><div className="provider-chip-actions"><button type="button" className="provider-settings" onClick={() => void connect(connection.key)} disabled={busy !== null}>{busy === connection.key ? (ar ? "جاري الاتصال…" : "Connecting…") : (ar ? "اتصال" : "Connect")}</button></div></div>)}</section>
    <section className="media-connection-plan" aria-label={ar ? "خطة الربط الآمن" : "Safe connection plan"}><div className="media-panel-heading"><div><p>{ar ? "خطة الربط الآمن" : "SAFE CONNECTION PLAN"}</p><h3>{ar ? "قراءة وفهرسة ثم مراجعة المالك" : "Read, index, then owner review"}</h3></div><ShieldCheck size={20} color="#86efac" /></div><div className="media-plan-grid"><article><span className="media-plan-number">1</span><div><strong>{ar ? "صلاحية قراءة فقط" : "Read-only access"}</strong><p>{ar ? "لا حذف ولا نقل ولا نشر تلقائي." : "No deletion, moving, or automatic publishing."}</p></div></article><article><span className="media-plan-number">2</span><div><strong>{ar ? "ربط بالمكتبة" : "Link to Media Library"}</strong><p>{ar ? "يحفظ مرجع المصدر فقط، دون تنزيل الملف." : "Stores the source reference only; files are not downloaded."}</p></div></article><article><span className="media-plan-number">3</span><div><strong>{ar ? "Needs Review افتراضيًا" : "Needs Review by default"}</strong><p>{ar ? "لا استخدام تسويقي قبل موافقة المالك." : "No marketing use before owner approval."}</p></div></article></div><p className="media-plan-note">{notice || (ar ? "اتصل بمصدر مضبوط لعرض أصول حقيقية فقط." : "Connect a configured source to view real assets only.")}</p></section>
    <div className="media-hub-grid"><section className="media-browser-panel"><div className="media-panel-heading"><div><p>{ar ? "المصادر الموحدة" : "Unified sources"}</p><h3>{ar ? "ابحث واختر صورة أو فيديو" : "Search and select an image or video"}</h3></div><span>{filteredItems.length} {ar ? "أصل" : "assets"}</span></div><div className="media-hub-toolbar"><label className="media-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ar ? "ابحث بالاسم أو المجلد" : "Search by name or folder"} /></label><select value={provider} onChange={(event) => setProvider(event.target.value as MediaProviderKey | "all")}><option value="all">{ar ? "كل المصادر" : "All sources"}</option>{(Object.keys(MEDIA_PROVIDER_LABELS) as MediaProviderKey[]).map((key) => <option key={key} value={key}>{MEDIA_PROVIDER_LABELS[key]}</option>)}</select></div><div className="remote-asset-list">{filteredItems.map((item) => { const selectable = canSelectForCreative(item); return <article key={item.id} className={`remote-asset ${selected?.id === item.id ? "selected" : ""} ${!selectable ? "blocked" : ""}`}><div className="remote-asset-icon">{item.mimeType.startsWith("video/") ? <Video size={22} /> : <ImageIcon size={22} />}</div><div className="remote-asset-info"><strong>{item.name}</strong><span>{MEDIA_PROVIDER_LABELS[item.provider]} · {item.folder}</span><small className={`consent-${item.consent}`}>{ar ? "يحتاج مراجعة" : "Needs review"}</small></div><div className="remote-asset-actions"><a href={item.webUrl} target="_blank" rel="noopener noreferrer" aria-label={ar ? "فتح المصدر" : "Open source"}><ExternalLink size={16} /></a>{session && canWrite && <button type="button" onClick={() => void saveToLibrary(item)} disabled={busy !== null || savedIds.has(item.id)}>{savedIds.has(item.id) ? (ar ? "تم الربط" : "Linked") : (ar ? "ربط بالمكتبة" : "Link to Library")}</button>}<button type="button" disabled={!selectable} onClick={() => setSelected(item)}>{selected?.id === item.id ? <Check size={16} /> : ar ? "اختيار" : "Select"}</button></div></article>; })}</div><p className="media-source-note">{ar ? "لا تظهر أصول قبل اتصال مصدر حقيقي، وكل أصل خارجي يبدأ بحالة يحتاج مراجعة." : "No assets are shown until a real provider is connected. No fabricated assets are shown, and every external asset starts as Needs review."}</p></section><section className="creative-factory-panel"><div className="media-panel-heading"><div><p>{ar ? "مصنع الإعلانات" : "Creative factory"}</p><h3>{ar ? "موجز مقترح للمراجعة فقط" : "Suggested brief for review only"}</h3></div><Sparkles size={20} color="#00b4d8" /></div>{!selected && <div className="creative-empty"><Sparkles size={28} /><p>{ar ? "الأصل يحتاج موافقة المالك قبل إنشاء موجز تسويقي." : "Owner approval is required before creating a marketing brief."}</p></div>}{selected && brief && <div className="creative-form"><div className="selected-source"><strong>{selected.name}</strong><span>{ar ? "تم اختيار المصدر" : "Source selected"}</span></div><label>{ar ? "هدف الحملة" : "Campaign objective"}<textarea value={objective} onChange={(event) => setObjective(event.target.value)} rows={2} /></label><label>{ar ? "لغة الإعلان" : "Ad language"}<select value={briefLanguage} onChange={(event) => setBriefLanguage(event.target.value as "ar" | "en")}><option value="ar">العربية</option><option value="en">English</option></select></label><div className="brief-preview"><div><span>{ar ? "النص الأساسي" : "Primary text"}</span><p>{brief.primaryText}</p></div><div><span>{ar ? "العنوان" : "Headline"}</span><p>{brief.headline}</p></div><div><span>{ar ? "الدعوة للإجراء" : "Call to action"}</span><p>{brief.callToAction}</p></div></div><div className={`creative-approval approval-${brief.approval}`}><ShieldCheck size={16} />{ar ? "موجز للمراجعة فقط — لا نشر تلقائي" : "Review-only brief — no automatic publishing"}</div><div className="creative-actions">
<button type="button" className="copy-brief" onClick={() => void copyBrief()}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? (ar ? "تم النسخ" : "Copied") : (ar ? "نسخ موجز الإعلان" : "Copy creative brief")}</button>
<button type="button" className="copy-brief" onClick={useInFactory}>{ar ? "استخدام في مصنع المحتوى" : "Use in Content Factory"}</button>
</div></div>}</section></div>
  </div>;
}
