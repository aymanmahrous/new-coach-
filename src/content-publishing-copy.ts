import type { Language } from "./i18n";
import type { PublishChannel, PublishPipelineStage } from "./content-publishing";

export type PublishingCopy = {
  livePublishTitle: string;
  livePublishBody: string;
  livePublishAwaiting: string;
  livePublishNextReview: string;
  livePublishNextApprove: string;
  livePublishNextN8n: string;
  livePublishNextVerify: string;
  livePublishNextContinue: string;
  authorizedPostTitle: string;
  authorizedPostPending: string;
  authorizedPostLive: string;
  pipelineAria: string;
  pipelineLabel: string;
  publishedAtLabel: string;
  awaitingN8nNote: string;
  openPostLink: string;
  openLivePost: string;
  pipelineStages: Record<PublishPipelineStage, string>;
  facebookAuditTitle: string;
  facebookAuditBody: string;
  facebookAuditReceipt: string;
  facebookAuditManualCheck: string;
  facebookAuditPostId: string;
  instagramPickAuthorized: string;
};

const FACEBOOK_COPY: PublishingCopy = {
  livePublishTitle: "Publishing readiness (Facebook first)",
  livePublishBody: "Approve here. Live posting runs securely inside the app through the Meta Graph API.",
  livePublishAwaiting: "Ready for in-app publish",
  livePublishNextReview: "Next: review remaining batch items.",
  livePublishNextApprove: "Next: approve reviewed items (no auto publish).",
  livePublishNextN8n: "Next: click Publish now for the approved Facebook post.",
  livePublishNextVerify: "Next: verify unclear publish receipts.",
  livePublishNextContinue: "Next: keep building the 10-day batch mix.",
  authorizedPostTitle: "Authorized Facebook test post",
  authorizedPostPending: "Approved — ready for in-app publish.",
  authorizedPostLive: "Live on Facebook.",
  pipelineAria: "Publish status",
  pipelineLabel: "Stage",
  publishedAtLabel: "Published",
  awaitingN8nNote: "Approved here. Live posting is performed by the app's protected Meta function.",
  openPostLink: "Receipt link",
  openLivePost: "Live post",
  pipelineStages: {
    needs_review: "Needs review",
    approved_ready: "Ready for n8n",
    awaiting_n8n: "Awaiting n8n",
    scheduled: "Scheduled",
    published_live: "Live",
    failed: "Issue",
    other: "Other",
  },
  facebookAuditTitle: "Facebook controlled test — audit",
  facebookAuditBody: "Receipt recorded in Supabase. Public visibility must be checked manually on the Page.",
  facebookAuditReceipt: "Receipt status",
  facebookAuditManualCheck: "Manual check required: the public link may show unavailable if the post was deleted, restricted, or never reached the Page feed.",
  facebookAuditPostId: "Facebook Post ID",
  instagramPickAuthorized: "",
};

const INSTAGRAM_COPY: PublishingCopy = {
  ...FACEBOOK_COPY,
  livePublishTitle: "Publishing readiness (Instagram)",
  livePublishBody: "Approve one Instagram test post here. Live posting runs securely inside the app through the Meta Graph API.",
  livePublishNextN8n: "Next: click Publish now for the approved Instagram post.",
  livePublishNextContinue: "Next: generate the 10-day batch, then review Instagram items.",
  authorizedPostTitle: "Authorized Instagram test post",
  authorizedPostPending: "Approved — ready for in-app publish.",
  authorizedPostLive: "Live on Instagram.",
  instagramPickAuthorized: "Pick one Instagram item in the batch below, approve it, then click Publish now for that post only.",
};

const COPY: Record<Language, Record<PublishChannel, PublishingCopy>> = {
  en: {
    facebook: FACEBOOK_COPY,
    instagram: INSTAGRAM_COPY,
  },
  ar: {
    facebook: {
      ...FACEBOOK_COPY,
      livePublishTitle: "جاهزية النشر (Facebook أولاً)",
      livePublishBody: "الاعتماد هنا. النشر الحي يتم بأمان من داخل التطبيق عبر Meta Graph API.",
      livePublishAwaiting: "جاهز للنشر من داخل التطبيق",
      livePublishNextReview: "التالي: مراجعة عناصر الدفعة المتبقية.",
      livePublishNextApprove: "التالي: اعتماد العناصر (بدون نشر تلقائي).",
      livePublishNextN8n: "التالي: اضغط نشر الآن للمنشور المعتمد.",
      livePublishNextVerify: "التالي: التحقق من إيصالات النشر.",
      livePublishNextContinue: "التالي: متابعة بناء دفعة 10 أيام.",
      authorizedPostTitle: "منشور Facebook التجريبي",
      authorizedPostPending: "معتمد — جاهز للنشر من داخل التطبيق.",
      authorizedPostLive: "منشور حي على Facebook.",
      pipelineAria: "حالة النشر",
      pipelineLabel: "المرحلة",
      publishedAtLabel: "نُشر",
      awaitingN8nNote: "معتمد هنا. النشر الحي تنفذه وظيفة Meta المحمية داخل التطبيق.",
      openPostLink: "رابط الإيصال",
      openLivePost: "المنشور الحي",
      pipelineStages: {
        needs_review: "يحتاج مراجعة",
        approved_ready: "جاهز لـ n8n",
        awaiting_n8n: "بانتظار n8n",
        scheduled: "مجدول",
        published_live: "حي",
        failed: "مشكلة",
        other: "أخرى",
      },
      facebookAuditTitle: "اختبار Facebook المُتحكَّم — تدقيق",
      facebookAuditBody: "الإيصال مسجَّل في Supabase. يجب التحقق يدويًا من ظهور المنشور على الصفحة.",
      facebookAuditReceipt: "حالة الإيصال",
      facebookAuditManualCheck: "تحقق يدوي مطلوب: الرابط العام قد يظهر «غير متاح» إذا حُذف المنشور أو قُيّدت رؤيته أو لم يصل للـFeed.",
      facebookAuditPostId: "Facebook Post ID",
    },
    instagram: {
      ...INSTAGRAM_COPY,
      livePublishTitle: "جاهزية النشر (Instagram)",
      livePublishBody: "اعتمد منشور Instagram تجريبي واحد هنا. النشر الحي يتم بأمان من داخل التطبيق عبر Meta Graph API.",
      livePublishNextN8n: "التالي: اضغط نشر الآن للمنشور المعتمد.",
      livePublishNextContinue: "التالي: إنشاء دفعة 10 أيام ثم مراجعة عناصر Instagram.",
      authorizedPostTitle: "منشور Instagram التجريبي",
      authorizedPostPending: "معتمد — جاهز للنشر من داخل التطبيق.",
      authorizedPostLive: "منشور حي على Instagram.",
      instagramPickAuthorized: "اختر عنصر Instagram واحد من الدفعة أدناه، اعتمده، ثم اضغط نشر الآن لذلك المنشور فقط.",
      pipelineStages: FACEBOOK_COPY.pipelineStages,
    },
  },
};

export function readPublishingCopy(language: Language, channel: PublishChannel = "instagram"): PublishingCopy {
  return COPY[language][channel];
}
