import { useState, useEffect, useRef } from "react";
import { ExternalLink, FolderOpen, Image, Sparkles, Upload, Video, Check, Copy, ShieldCheck } from "lucide-react";

type Lang = "ar" | "en";

interface MediaVaultProps {
  lang: Lang;
  log: (s: string, tone?: "info" | "ok" | "err") => void;
}

interface MediaAsset {
  id: string;
  name: string;
  type: "image" | "video";
  category: "brand" | "pool" | "technique";
  ratio: "9:16" | "4:5" | "1:1";
  url?: string;
  isUploaded?: boolean;
}

const DEFAULT_ASSETS: MediaAsset[] = [
  {
    id: "asset-1",
    name: "Relax Fix Brand Badge & Colors",
    type: "image",
    category: "brand",
    ratio: "1:1",
  },
  {
    id: "asset-2",
    name: "Al Mushrif & Khalifa City Pools View",
    type: "image",
    category: "pool",
    ratio: "4:5",
  },
  {
    id: "asset-3",
    name: "Freestyle Breathing Drill Slowmo",
    type: "video",
    category: "technique",
    ratio: "9:16",
  },
  {
    id: "asset-4",
    name: "Kids Aquaphobia Progression Demo",
    type: "video",
    category: "technique",
    ratio: "9:16",
  },
];

export function MediaVault({ lang, log }: MediaVaultProps) {
  const isAr = lang === "ar";
  const [assets, setAssets] = useState<MediaAsset[]>(DEFAULT_ASSETS);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [canvaConfig, setCanvaConfig] = useState<{ configured: boolean; clientId: string; brandTemplateId: string; connected: boolean }>({
    configured: true,
    clientId: "OC-AaCRfP-VVcyS",
    brandTemplateId: "EAHVAAahmjU",
    connected: false,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canvaBrandTemplateId = canvaConfig.brandTemplateId || "EAHVAAahmjU";

  useEffect(() => {
    fetch("/api/canva")
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data.configured === "boolean") {
          setCanvaConfig(data);
        }
      })
      .catch(() => {});
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newAssets: MediaAsset[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isVideo = file.type.startsWith("video");
      const url = URL.createObjectURL(file);

      newAssets.push({
        id: `upload-${Date.now()}-${i}`,
        name: file.name,
        type: isVideo ? "video" : "image",
        category: "pool",
        ratio: isVideo ? "9:16" : "4:5",
        url,
        isUploaded: true,
      });
    }

    setAssets([...newAssets, ...assets]);
    log(
      isAr ? `تم رفع ${newAssets.length} ملف بنجاح إلى مخزن الوسائط` : `Uploaded ${newAssets.length} media items`,
      "ok"
    );
  };

  const copyTemplateId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
    log(isAr ? "تم نسخ معرف قالب Canva" : "Canva template ID copied", "ok");
  };

  const startCanvaAuth = async () => {
    try {
      const res = await fetch("/api/canva", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_auth_url" }),
      });
      const data = await res.json();
      if (data.authUrl) {
        log(isAr ? "فتح صفحة تفويض تطبيق Canva للمطورين…" : "Opening Canva OAuth…", "info");
        window.open(data.authUrl, "_blank", "noopener");
      }
    } catch {
      window.open("/api/canva?action=auth", "_blank", "noopener");
    }
  };

  return (
    <div className="space-y-4">
      {/* Header and Integration Banner */}
      <section className="glass space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm tracking-wider text-primary">
              {isAr ? "مخزن وسائط الأكاديمية واستوديو التصميم (Canva & Gemini)" : "Academy Media Vault & Creative Studio"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "إدارة الصور وفيديوهات التدريب، وربط تطبيق Canva للمطورين، ومحرك Google Gemini للذكاء الاصطناعي"
                : "Manage training footage, pool photos, Canva developer app, and Google Gemini AI generator"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Upload className="size-4" />
              {isAr ? "رفع وسائط من جهازك" : "Upload Media"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </div>

        {/* Studio Cards Grid */}
        <div className="grid gap-3 sm:grid-cols-3">
          {/* 1. Canva Developer Integration */}
          <div className="rounded-lg border border-[#7D2AE8]/40 bg-[#7D2AE8]/5 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#A855F7]">
                {isAr ? "تطبيق Canva (بوابة المطورين)" : "Canva Developer App"}
              </span>
              <span className="flex items-center gap-1 rounded bg-[#7D2AE8]/20 px-2 py-0.5 font-mono text-[11px] text-[#A855F7]">
                <ShieldCheck className="size-3" />
                {canvaConfig.clientId ? `ID: ${canvaConfig.clientId}` : "Configured"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "بيانات المطور معتمدة ومربوطة بالخادم. يمكنك تفويض التطبيق أو استخدام القالب المعتمد مباشرة."
                : "Developer credentials configured. Authorize OAuth or use the template directly."}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={startCanvaAuth}
                className="flex items-center gap-1.5 rounded-md bg-[#7D2AE8] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#6b22c7] shadow-sm"
              >
                <ExternalLink className="size-3.5" />
                {isAr ? "تفويض حساب Canva (OAuth)" : "Authorize Canva"}
              </button>
              <a
                href="https://www.canva.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-md border border-[#7D2AE8]/40 px-2.5 py-1.5 text-xs font-medium text-[#A855F7] hover:bg-[#7D2AE8]/10"
              >
                <ExternalLink className="size-3.5" />
                {isAr ? "فتح Canva الرسمي" : "Open Canva"}
              </a>
              <a
                href="https://www.canva.com/create/social-media/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-md border border-[#7D2AE8]/40 px-2.5 py-1.5 text-xs font-medium text-[#A855F7] hover:bg-[#7D2AE8]/10"
              >
                <ExternalLink className="size-3.5" />
                {isAr ? "إنشاء تصميم جديد" : "Create Design"}
              </a>
              <button
                onClick={() => copyTemplateId(canvaBrandTemplateId)}
                className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-secondary"
              >
                {copiedId === canvaBrandTemplateId ? <Check className="size-3 text-accent" /> : <Copy className="size-3" />}
                {isAr ? "نسخ معرف القالب" : "Copy ID"}
              </button>
            </div>
          </div>

          {/* 2. Google Gemini AI Studio */}
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-primary">
                {isAr ? "محرك Google Gemini AI البديل" : "Google Gemini AI Studio"}
              </span>
              <Sparkles className="size-4 text-primary" />
            </div>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "بديل فوري وقوي لـ Canva لتوليد الصور والبوسترات الإعلانية بنقرة واحدة دون انتظار تفويض."
                : "Instant alternative to generate visuals with AI prompts without waiting for Canva."}
            </p>
            <div className="pt-1">
              <a
                href="https://gemini.google.com/app"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 shadow-sm"
              >
                <Sparkles className="size-3.5" />
                {isAr ? "فتح Google Gemini وتوليد التصاميم" : "Launch Gemini Studio"}
              </a>
            </div>
          </div>

          {/* 3. Google Drive Archive */}
          <div className="rounded-lg border border-border bg-background/50 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">
                {isAr ? "أرشيف Google Drive السحابي" : "Google Drive Media Archive"}
              </span>
              <FolderOpen className="size-4 text-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "الوصول المباشر لمجلدات Drive التي تحتوي على صور وفيديوهات المتدربين الأصلية."
                : "Direct access to Drive storage with high-resolution original training videos."}
            </p>
            <div className="pt-1">
              <a
                href="https://drive.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
              >
                <ExternalLink className="size-3.5" />
                {isAr ? "فتح مجلد Google Drive" : "Open Google Drive"}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Asset Grid */}
      <section className="glass space-y-3 p-4">
        <h3 className="font-display text-sm tracking-wider text-primary">
          {isAr ? "الأصول المتاحة للاستخدام في النشر" : "Available Media Assets"}
        </h3>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="flex flex-col justify-between rounded-lg border border-border bg-background/40 p-3 space-y-3"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  {asset.type === "video" ? <Video className="size-3.5 text-accent" /> : <Image className="size-3.5 text-primary" />}
                  {asset.type.toUpperCase()}
                </span>
                <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {asset.ratio}
                </span>
              </div>

              {asset.url ? (
                <div className="relative aspect-video w-full overflow-hidden rounded bg-black/40">
                  {asset.type === "video" ? (
                    <video src={asset.url} controls className="h-full w-full object-cover" />
                  ) : (
                    <img src={asset.url} alt={asset.name} className="h-full w-full object-cover" />
                  )}
                </div>
              ) : (
                <div className="flex aspect-video w-full items-center justify-center rounded border border-dashed border-border bg-secondary/30 text-xs text-muted-foreground">
                  {asset.category === "brand" ? "Relax Fix Official Badge" : "Abu Dhabi Pool Asset"}
                </div>
              )}

              <div>
                <p className="truncate text-xs font-medium text-foreground">{asset.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {isAr ? "جاهز للتطبيق على القالب الإعلاني" : "Ready for social campaigns"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
