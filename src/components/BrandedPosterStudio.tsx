import { useState, useRef } from "react";
import { Download, Sparkles, Image, Check, Copy, ExternalLink, RefreshCw } from "lucide-react";
import type { Platform } from "@/lib/posts";
import type { PostTemplate } from "./ContentFactory";

interface BrandedPosterStudioProps {
  id: string;
  caption: string;
  visual?: string;
  platform: Platform;
  templateType: PostTemplate;
  isAr: boolean;
  log: (msg: string, tone?: "info" | "ok" | "err") => void;
}

export function BrandedPosterStudio({
  id,
  caption,
  visual,
  platform,
  templateType,
  isAr,
  log,
}: BrandedPosterStudioProps) {
  const [downloading, setDownloading] = useState(false);
  const [copiedBrief, setCopiedBrief] = useState(false);

  // Extract hook / headline from caption
  const lines = caption.split("\n").map((l) => l.trim()).filter(Boolean);
  const hook = lines[0] || (isAr ? "أكاديمية ريلاكس فيكس للسباحة — كوتش أيمن" : "Relax Fix Swimming Academy — Coach Ayman");
  
  // Extract bullet points
  const bulletLines = lines
    .filter((l) => l.startsWith("-") || l.startsWith("•") || l.startsWith("🔹") || l.startsWith("*") || /^\d+\)/.test(l))
    .slice(0, 3)
    .map((l) => l.replace(/^[-•🔹*\d\)]+\s*/, ""));

  const keyPoints = bulletLines.length > 0 
    ? bulletLines 
    : [
        isAr ? "تدريب خاص VIP ومجموعات بحد أقصى 4 أطفال" : "VIP Private & Small Groups (Strict Max 4 Kids)",
        isAr ? "علاج رهبة الماء وتصحيح التكنيك تدريجياً" : "Gentle Aquaphobia & Technique Progression",
        isAr ? "فروع أبوظبي: المشرف، الفلاح، مدينة خليفة، الدانة" : "Abu Dhabi Pools: Al Mushrif, Al Falah, Khalifa City, Al Danah",
      ];

  const ratio = templateType === "drill" || templateType === "quiz" ? "9:16" : templateType === "branch_promo" ? "1:1" : "4:5";

  const handleDownloadPng = async () => {
    setDownloading(true);
    try {
      const width = 1080;
      const height = ratio === "9:16" ? 1920 : ratio === "4:5" ? 1350 : 1080;
      
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context not available");

      // 1. Deep Ocean Cyber-Nexus Gradient
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      bgGrad.addColorStop(0, "#020617");
      bgGrad.addColorStop(0.35, "#082f49");
      bgGrad.addColorStop(0.7, "#0369a1");
      bgGrad.addColorStop(1, "#0284c7");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Water Wave Reflections / Ambient Glow
      ctx.save();
      ctx.globalAlpha = 0.15;
      const glowGrad = ctx.createRadialGradient(width * 0.5, height * 0.3, 50, width * 0.5, height * 0.3, width * 0.6);
      glowGrad.addColorStop(0, "#38bdf8");
      glowGrad.addColorStop(1, "transparent");
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      // Ambient decorative curves (Water ripple waves)
      ctx.save();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        const yOffset = height * 0.45 + i * 140;
        ctx.moveTo(0, yOffset);
        ctx.bezierCurveTo(width * 0.25, yOffset - 60, width * 0.75, yOffset + 60, width, yOffset);
        ctx.stroke();
      }
      ctx.restore();

      // 3. Top Emblem / Logo Badge
      const emblemCenterY = height > 1400 ? 220 : 180;
      const emblemRadius = 75;

      // Outer Glow & Gold Border
      ctx.save();
      ctx.shadowColor = "#38bdf8";
      ctx.shadowBlur = 25;
      ctx.beginPath();
      ctx.arc(width / 2, emblemCenterY, emblemRadius, 0, Math.PI * 2);
      ctx.fillStyle = "#0f172a";
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#f59e0b"; // Gold accent
      ctx.stroke();
      ctx.restore();

      // Inner cyan circle
      ctx.beginPath();
      ctx.arc(width / 2, emblemCenterY, emblemRadius - 8, 0, Math.PI * 2);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "#06b6d4";
      ctx.stroke();

      // Swimmer / Wave Icon in center of emblem
      ctx.save();
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      // Stylized swimmer head & arms
      const headX = width / 2;
      const headY = emblemCenterY - 20;
      ctx.arc(headX, headY, 12, 0, Math.PI * 2);
      ctx.fill();

      // Stylized water waves inside badge
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(width / 2 - 40, emblemCenterY + 10);
      ctx.bezierCurveTo(width / 2 - 20, emblemCenterY + 25, width / 2 + 20, emblemCenterY - 5, width / 2 + 40, emblemCenterY + 10);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(width / 2 - 30, emblemCenterY + 28);
      ctx.bezierCurveTo(width / 2 - 15, emblemCenterY + 40, width / 2 + 15, emblemCenterY + 15, width / 2 + 30, emblemCenterY + 28);
      ctx.stroke();
      ctx.restore();

      // Academy Brand Header Text
      ctx.textAlign = "center";
      ctx.font = "bold 32px 'Cairo', 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.fillText("RELAX FIX UAE SWIMMING ACADEMY", width / 2, emblemCenterY + 115);

      ctx.font = "600 24px 'Cairo', 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = "#38bdf8";
      ctx.fillText("أكاديمية كابتن أيمن للسباحة · أبوظبي", width / 2, emblemCenterY + 155);

      // Template Badge Pill
      const badgeY = emblemCenterY + 205;
      ctx.save();
      ctx.fillStyle = "rgba(6, 182, 212, 0.2)";
      ctx.strokeStyle = "rgba(6, 182, 212, 0.6)";
      ctx.lineWidth = 2;
      const badgeW = 460;
      const badgeH = 46;
      ctx.beginPath();
      ctx.roundRect((width - badgeW) / 2, badgeY, badgeW, badgeH, 23);
      ctx.fill();
      ctx.stroke();

      ctx.font = "bold 20px 'Cairo', 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = "#e0f2fe";
      ctx.fillText(
        templateType === "drill"
          ? "🎯 تصحيح التكنيك وتطوير المهارات"
          : templateType === "transformation"
          ? "🌟 علاج رهبة الماء وبناء الثقة"
          : templateType === "branch_promo"
          ? "📍 باقات فروع أبوظبي المعتمدة"
          : "🏊‍♂️ تدريب سباحة احترافي في أبوظبي",
        width / 2,
        badgeY + 30
      );
      ctx.restore();

      // 4. Hook / Main Headline (Centered, Large Arabic)
      const hookStartY = badgeY + 110;
      ctx.font = `bold ${height > 1400 ? 56 : 46}px 'Cairo', 'Segoe UI', system-ui, sans-serif`;
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 15;

      // Word wrap hook
      const words = hook.split(" ");
      let line = "";
      let curY = hookStartY;
      const maxW = width - 160;

      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + " ";
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxW && n > 0) {
          ctx.fillText(line.trim(), width / 2, curY);
          line = words[n] + " ";
          curY += height > 1400 ? 75 : 62;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line.trim(), width / 2, curY);
      ctx.shadowBlur = 0;

      // 5. Card with Key Features / Bullets
      const cardStartY = curY + 60;
      const cardW = width - 160;
      const cardH = keyPoints.length * 85 + 40;

      ctx.save();
      ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
      ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect((width - cardW) / 2, cardStartY, cardW, cardH, 24);
      ctx.fill();
      ctx.stroke();

      // Bullets text inside card
      keyPoints.forEach((point, idx) => {
        const rowY = cardStartY + 55 + idx * 85;
        // Bullet Icon
        ctx.beginPath();
        ctx.arc((width + cardW) / 2 - 50, rowY - 8, 10, 0, Math.PI * 2);
        ctx.fillStyle = "#38bdf8";
        ctx.fill();

        ctx.font = "bold 26px 'Cairo', 'Segoe UI', system-ui, sans-serif";
        ctx.fillStyle = "#f8fafc";
        ctx.textAlign = "right";
        ctx.fillText(point, (width + cardW) / 2 - 75, rowY);
      });
      ctx.restore();

      // 6. Abu Dhabi Branches Banner
      const branchesY = height > 1400 ? height - 320 : height - 260;
      ctx.textAlign = "center";
      ctx.font = "bold 24px 'Cairo', 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = "#38bdf8";
      ctx.fillText("📍 فروعنا في أبوظبي:", width / 2, branchesY);

      ctx.font = "600 22px 'Cairo', 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText("المشرف  •  الفلاح  •  مدينة خليفة  •  الدانة / النجدة", width / 2, branchesY + 38);

      // 7. Bottom WhatsApp CTA Pill
      const ctaY = height - 150;
      const ctaW = width - 180;
      const ctaH = 90;

      ctx.save();
      const ctaGrad = ctx.createLinearGradient((width - ctaW) / 2, 0, (width + ctaW) / 2, 0);
      ctaGrad.addColorStop(0, "#059669");
      ctaGrad.addColorStop(1, "#10b981"); // WhatsApp Emerald
      ctx.fillStyle = ctaGrad;
      ctx.shadowColor = "rgba(16, 185, 129, 0.5)";
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.roundRect((width - ctaW) / 2, ctaY, ctaW, ctaH, 45);
      ctx.fill();

      ctx.textAlign = "center";
      ctx.font = "bold 28px 'Cairo', 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.shadowBlur = 0;
      ctx.fillText("📱 احجز تقييم طفلك المجاني: 058 821 9130", width / 2, ctaY + 55);
      ctx.restore();

      // Convert to blob & trigger download
      canvas.toBlob((blob) => {
        if (!blob) throw new Error("Could not create PNG blob");
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `RelaxFix-CoachAyman-${platform}-${templateType}-${Date.now().toString().slice(-4)}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);

        log(isAr ? "✅ تم تحميل بوستر الأكاديمية الرسمي بجودة عالية (1080px) بنجاح!" : "High-res branded poster downloaded!", "ok");
        setDownloading(false);
      }, "image/png");
    } catch (err) {
      log(`${isAr ? "تعذر إنشاء البوستر" : "Poster export failed"}: ${(err as Error).message}`, "err");
      setDownloading(false);
    }
  };

  const copyCanvaBrief = async () => {
    const briefText = `[Canva Template Design Brief — Relax Fix UAE / Coach Ayman]
Platform Format: ${platform} (${ratio})
Style Type: ${templateType === "drill" ? "Technique Reel 9:16" : templateType === "transformation" ? "Transformation Story 4:5" : templateType === "branch_promo" ? "Square Ad 1:1" : "Social Graphic"}
Headline / Hook: ${hook}
Academy Brand Colors:
- Deep Navy: #020617 / #082F49
- Cyan / Turquoise: #06B6D4 / #38BDF8
- Gold Accents: #F59E0B
- Pure White: #FFFFFF
Layout Elements:
1. Top Emblem: Relax Fix UAE Swimming Academy Crest with Coach Ayman
2. Center: Bold Arabic Headline (${hook})
3. Body Points:
${keyPoints.map((k) => `   - ${k}`).join("\n")}
4. Abu Dhabi Branches: Al Mushrif, Al Falah, Khalifa City, Al Danah
5. Official Booking CTA: WhatsApp 058 821 9130 (100% Free Initial Assessment)
Strict Marketing Policy: ZERO numerical prices in public visuals.`;

    await navigator.clipboard.writeText(briefText);
    setCopiedBrief(true);
    setTimeout(() => setCopiedBrief(false), 2000);
    log(isAr ? "🎨 تم نسخ مواصفات وتصميم Canva للحافظة!" : "Canva design brief copied!", "ok");
  };

  const copyGeminiPrompt = async () => {
    const promptText = `A cinematic 8k photorealistic commercial photograph for Coach Ayman Swimming Academy in Abu Dhabi.
Scene: Professional swimming session in a sparkling, temperature-controlled indoor pool in Abu Dhabi.
Subject: ${templateType === "transformation" ? "An Emirati child smiling with pure relief and confidence while gently floating in crystal blue water with a friendly certified swimming coach" : templateType === "drill" ? "A skilled swimmer performing a smooth freestyle stroke, head turned 90 degrees with shoulder rotation for breath, clean water splash" : "Joyful kids group (maximum 4 children) enjoying a safe swimming assessment with an expert coach"}.
Atmosphere: Crystal clear azure water, radiant light reflections, premium aquatic center atmosphere, uplifting, highly trustworthy and safe.
Aspect Ratio: ${ratio === "9:16" ? "9:16 vertical" : ratio === "4:5" ? "4:5 portrait" : "1:1 square"}.
Color Grading: Deep navy blue water tones with luminous turquoise highlights, golden warm lighting.
Style: Shot on Sony A1, 50mm f/1.4 GM lens, crisp water droplets, shallow depth of field, authentic emotional expression.`;

    await navigator.clipboard.writeText(promptText);
    setCopiedBrief(true);
    setTimeout(() => setCopiedBrief(false), 2000);
    log(isAr ? "✨ تم نسخ برومبت Google Gemini الواقعي للحافظة!" : "Gemini photorealistic prompt copied!", "ok");
  };

  const openCanvaTool = () => {
    copyCanvaBrief();
    let canvaUrl = "https://www.canva.com/create/instagram-posts/";
    if (ratio === "9:16") {
      canvaUrl = "https://www.canva.com/create/instagram-stories/";
    }
    window.open(canvaUrl, "_blank", "noopener");
    log(
      isAr
        ? "🎨 تم نسخ مواصفات التصميم وفتح أداة Canva المخصصة للمقاس!"
        : "Design brief copied and Canva tool opened!",
      "info"
    );
  };

  const openGeminiAi = () => {
    copyGeminiPrompt();
    window.open("https://gemini.google.com/app", "_blank", "noopener");
    log(
      isAr
        ? "✨ تم نسخ البرومبت وجارٍ فتح Google Gemini لتوليد الصورة!"
        : "Copied prompt and opening Google Gemini!",
      "info"
    );
  };

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-gradient-to-b from-slate-950/90 via-sky-950/40 to-slate-950/90 p-4 shadow-lg space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-full bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-cyan-400 text-xs font-bold">
            🏊‍♂️
          </div>
          <div>
            <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <span>{isAr ? "استوديو البوستر الرسمي والهوية" : "Official Branded Poster Studio"}</span>
              <span className="text-[10px] bg-primary/20 text-primary border border-primary/30 px-1.5 py-0.2 rounded font-mono">
                {ratio}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {isAr ? "تصميم معتمد بشعار Relax Fix وفروع أبوظبي ورقم الحجز الرسمي" : "Official Relax Fix logo, branches & WhatsApp badge"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDownloadPng}
          disabled={downloading}
          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-md hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 transition"
        >
          {downloading ? (
            <RefreshCw className="size-3.5 animate-spin" />
          ) : (
            <Download className="size-3.5" />
          )}
          {isAr ? "تحميل البوستر PNG" : "Download PNG"}
        </button>
      </div>

      {/* Visual Live Preview Card */}
      <div className="relative overflow-hidden rounded-xl border border-cyan-500/40 bg-gradient-to-br from-slate-950 via-sky-950 to-blue-950 p-5 text-white shadow-inner">
        {/* Decorative Water Caustics Glow */}
        <div className="absolute -top-12 -left-12 size-40 rounded-full bg-cyan-400/15 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -right-12 size-40 rounded-full bg-blue-500/20 blur-2xl pointer-events-none" />

        {/* Top Logo / Brand Emblem */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="relative size-10 rounded-full bg-slate-900 border-2 border-amber-400 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <span className="text-lg">🏊‍♂️</span>
              <div className="absolute -inset-0.5 rounded-full border border-cyan-400/40 pointer-events-none" />
            </div>
            <div>
              <div className="text-[12px] font-black tracking-wide text-white">RELAX FIX UAE</div>
              <div className="text-[10px] text-cyan-300 font-medium">
                {isAr ? "أكاديمية كابتن أيمن للسباحة" : "Coach Ayman Swimming Academy"}
              </div>
            </div>
          </div>

          <div className="text-right">
            <span className="inline-block rounded-full bg-cyan-500/20 border border-cyan-400/40 px-2.5 py-0.5 text-[10px] font-semibold text-cyan-200">
              {templateType === "drill"
                ? (isAr ? "تصحيح تكنيك" : "Technique Drill")
                : templateType === "transformation"
                ? (isAr ? "علاج رهبة الماء" : "Aquaphobia Program")
                : templateType === "branch_promo"
                ? (isAr ? "باقات فروع أبوظبي" : "Abu Dhabi Pools")
                : (isAr ? "تدريب احترافي" : "Pro Training")}
            </span>
          </div>
        </div>

        {/* Post Hook / Headline */}
        <div className="my-4 text-center">
          <h4 className="text-sm font-extrabold text-white sm:text-base leading-snug drop-shadow-md">
            {hook}
          </h4>
        </div>

        {/* Key Points */}
        <div className="space-y-1.5 rounded-lg bg-black/40 border border-white/10 p-3 text-xs text-slate-100">
          {keyPoints.map((pt, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-cyan-400 flex-shrink-0" />
              <span className="text-[11px] leading-relaxed">{pt}</span>
            </div>
          ))}
        </div>

        {/* Branch Tags & CTA */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10 text-[10px]">
          <div className="text-cyan-200 flex items-center gap-1">
            <span>📍</span>
            <span>{isAr ? "المشرف · الفلاح · مدينة خليفة · الدانة" : "Al Mushrif · Al Falah · Khalifa · Al Danah"}</span>
          </div>
          <div className="rounded-full bg-emerald-600/90 px-2.5 py-0.5 font-bold text-white shadow">
            📲 058 821 9130 · {isAr ? "تقييم مجاني" : "Free Assessment"}
          </div>
        </div>
      </div>

      {/* External Design Actions */}
      <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
        <button
          type="button"
          onClick={openCanvaTool}
          className="flex items-center gap-1 rounded-md bg-[#7D2AE8]/20 border border-[#7D2AE8]/40 px-2.5 py-1.5 text-[#C084FC] hover:bg-[#7D2AE8]/30 font-medium"
        >
          <ExternalLink className="size-3" />
          <span>{isAr ? "🎨 فتح أداة Canva للمقاس" : "Open Canva for Ratio"}</span>
        </button>

        <button
          type="button"
          onClick={openGeminiAi}
          className="flex items-center gap-1 rounded-md bg-cyan-500/20 border border-cyan-400/40 px-2.5 py-1.5 text-cyan-300 hover:bg-cyan-500/30 font-medium"
        >
          <Sparkles className="size-3" />
          <span>{isAr ? "✨ فتح Google Gemini للصورة" : "Open Gemini for Image"}</span>
        </button>

        <button
          type="button"
          onClick={copyCanvaBrief}
          className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 hover:bg-secondary text-muted-foreground hover:text-foreground"
        >
          {copiedBrief ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
          <span>{isAr ? "نسخ مواصفات Canva" : "Copy Canva Spec"}</span>
        </button>

        <button
          type="button"
          onClick={copyGeminiPrompt}
          className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 hover:bg-secondary text-muted-foreground hover:text-foreground"
        >
          {copiedBrief ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
          <span>{isAr ? "نسخ برومبت Gemini" : "Copy Gemini Prompt"}</span>
        </button>
      </div>
    </div>
  );
}
