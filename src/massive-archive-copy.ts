import type { Language } from "./i18n";

export type ArchiveCopy = {
  boundaryTitle: string;
  boundaryText: string;
  unconfiguredTitle: string;
  unconfiguredText: string;
  primaryCardTitle: string;
  primaryCardText: string;
  copyCardTitle: string;
  copyCardText: string;
  linkCardTitle: string;
  safeCardTitle: string;
  safeCardText: string;
  openInDrive: string;
  copyLink: string;
  copySuccess: string;
  copyError: string;
  footnote: string;
};

const copy: Record<Language, ArchiveCopy> = {
  en: {
    boundaryTitle: "Massive Archive — direct launcher",
    boundaryText: "Opens your public Google Drive folder in a new tab. No iframe, no upload, no AI analysis, no file processing.",
    unconfiguredTitle: "Drive folder not configured",
    unconfiguredText: "Add this environment variable in Vercel, then redeploy Hub:",
    primaryCardTitle: "Open archive",
    primaryCardText: "Launch the full Google Drive folder in a secure new tab.",
    copyCardTitle: "Share access",
    copyCardText: "Copy the folder link for staff or consultants.",
    linkCardTitle: "Connected folder",
    safeCardTitle: "Budget-safe mode",
    safeCardText: "Phase 2 deferred: no Supabase migrations, no Drive API, zero file processing.",
    openInDrive: "Open archive in Google Drive",
    copyLink: "Copy link",
    copySuccess: "Folder link copied.",
    copyError: "Could not copy the link. Copy it manually from the card above.",
    footnote: "Google Drive blocks iframe embedding (X-Frame-Options). Direct launch is the reliable path.",
  },
  ar: {
    boundaryTitle: "الأرشيف الضخم — بوابة وصول مباشر",
    boundaryText: "يفتح مجلد Google Drive العام في نافذة جديدة. بدون iframe، بدون رفع، بدون تحليل ذكي، بدون معالجة ملفات.",
    unconfiguredTitle: "مجلد Drive غير مُعدّ",
    unconfiguredText: "أضف هذا المتغير في Vercel ثم أعد نشر Hub:",
    primaryCardTitle: "فتح الأرشيف",
    primaryCardText: "تشغيل مجلد Google Drive الكامل في نافذة جديدة آمنة.",
    copyCardTitle: "مشاركة الوصول",
    copyCardText: "انسخ رابط المجلد للموظفين أو المستشارين.",
    linkCardTitle: "المجلد المربوط",
    safeCardTitle: "وضع موفر للرصيد",
    safeCardText: "المرحلة 2 مؤجّلة: لا Migrations في Supabase، لا Drive API، ولا معالجة ملفات.",
    openInDrive: "فتح الأرشيف في Google Drive",
    copyLink: "نسخ الرابط",
    copySuccess: "تم نسخ رابط المجلد.",
    copyError: "تعذّر النسخ. انسخ الرابط يدويًا من البطاقة أعلاه.",
    footnote: "Google Drive يمنع التضمين داخل iframe (X-Frame-Options). الفتح المباشر هو المسار الموثوق.",
  },
};

export function getArchiveCopy(language: Language): ArchiveCopy {
  return copy[language];
}
