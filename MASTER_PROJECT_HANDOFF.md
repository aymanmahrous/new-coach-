# MASTER_PROJECT_HANDOFF.md — الحوكمة الدائمة لمشروع Relax Fix UAE / Swim Fluent UAE

هذا الملف هو **مصدر الحقيقة الإداري الدائم** للمشروع. أي مدير أو مستشار أو Agent جديد يجب أن يقرأه أولًا (بالإضافة إلى `AGENTS.md`، `OWNER_WORKING_PROFILE.md`، `OWNER_PROTECTION_AND_BUDGET_POLICY.md`، و`PROJECT_HANDOFF.md`) قبل أي تنفيذ.

## CURRENT EXECUTIVE MANDATE — ACTIVE

هذا القسم هو المرجع التنفيذي الحالي عند تعارضه مع تعليمات تاريخية في هذا الملف.

1. المالك غير تقني، ولا يُطلب منه اتخاذ قرارات تقنية.
2. المدير التقني والاستراتيجي هو صاحب التشخيص والقرار وتحديد نطاق التنفيذ.
3. الوكيل التنفيذي أداة تنفيذ فقط، ولا يوسّع النطاق من تلقاء نفسه.
4. أي تعليمات تاريخية تقول `approval only` أو `no execution without independent approval` تُعتبر تعليمات لمرحلة سابقة إذا تعارضت مع هذا التفويض التنفيذي الحالي.
5. المدير مخوّل بتفويض الوكيل لتنفيذ إصلاحات آمنة داخل Command Center Hub عندما تكون ضرورية لتحقيق هدف المنتج.
6. نطاق الإصلاح المسموح به عند الضرورة المثبتة:
   - Frontend / UX
   - Connections
   - Media
   - Content workflow
   - Existing publishing workflow
   - Safe production deployment عند الحاجة
7. لا إعادة بناء من الصفر، ولا إنشاء أنظمة مكررة.
8. لا fake Connected / Published / Generated / Success؛ كل حالة نجاح يجب أن تستند إلى دليل حقيقي.
9. لا تغيير واسع في Supabase schema أو RLS أو OAuth أو Meta أو n8n أو Buffer إلا إذا ثبتت الضرورة؛ عندها يتوقف الوكيل عند الحد الذي يحتاج قرارًا إضافيًا.
10. لا نشر حقيقي على Facebook أو Instagram إلا بعد أن يحدد المدير أن المسار جاهز للاختبار.
11. كل تنفيذ يكون Atomic Step واحدة فقط.
12. بعد نجاح Atomic Step يتوقف الوكيل.
13. يُعاد استخدام Verified Evidence ولا يُعاد اختبارها بلا سبب مباشر.
14. الهدف هو تبسيط المنتج وإصلاح الموجود، وليس زيادة الكود أو الصفحات.

### قاعدة تعارض التعليمات

إذا تعارضت تعليمات تاريخية في هذا الـHandoff مع `CURRENT EXECUTIVE MANDATE — ACTIVE`، فيُعتبر التفويض الحالي هو المرجع التنفيذي الحالي، مع الالتزام بحدود الأمان والنطاق أعلاه.

## 1. تعريف المشروع والأنظمة المرتبطة

- **المشروع**: Relax Fix UAE / Swim Fluent UAE — منظومة تشغيل ونشر محتوى تجارية للمالك.
- **الأنظمة المرتبطة**:
  - **الموقع العام** (Relax Fix UAE website) — لا يُلمس ولا يُعدَّل من هذا المستودع إطلاقًا.
  - **تطبيق Command Center Hub** (هذا المستودع) — تطبيق تشغيلي داخلي للفريق (Inbox، Bookings، Content Studio، Media Library، Analytics، Integrations).
  - **Supabase** — قاعدة البيانات والمصادقة والـRPCs المعتمدة فقط؛ لا كتابة مباشرة على الجداول من الواجهة.
  - **n8n** — الـWorkflow المسؤول عن دورة اعتماد ونشر المحتوى (Owner Approval → Publishing)، بما يشمل قناة Facebook.
  - **المحتوى والتصميمات** — تُدار عبر Content Studio وجدول `content_items` في Supabase.

## 2. مصادر الحقيقة الحالية (Sources of Truth)

- `PROJECT_HANDOFF.md` — الحالة التقنية التفصيلية لتطوير تطبيق Command Center Hub (الميزات المدمجة، الـPRs، الأدلة التقنية).
- `MASTER_PROJECT_HANDOFF.md` (هذا الملف) — الحالة الإدارية والحوكمية الشاملة، بما فيها مرحلة نشر المحتوى الفعلية عبر n8n والتي تُدار خارج نطاق كود التطبيق.
- `docs/` — أدلة تقنية تفصيلية لكل ميزة (مرجع تكميلي، لا يُعاد فحصه إلا عند الحاجة الفعلية).
- عند التعارض بين الملفات: يُرجَّح آخر بند مؤكَّد ومسجَّل في هذا الملف تحت "آخر نتيجة مؤكدة"، ولا يُفترض أي شيء لم يُسجَّل صراحة هنا.

## 3. حالة الأنظمة

| النظام | الحالة |
|---|---|
| الموقع العام | خارج نطاق هذا المستودع؛ لا تغيير ولا نشر منه. |
| تطبيق Command Center Hub | الواجهة بعد تسجيل الدخول تم التحقق منها بصريًا فقط (Authenticated UI visually verified). RBAC، الـAPIs، عمليات الكتابة (write operations)، الإسناد (attribution)، وبعض المسارات الوظيفية **غير مُتحقَّق منها بالكامل** بعد. |
| Supabase | متصل ومُستخدَم عبر RPCs معتمدة فقط؛ لا Migration أو RLS جديدة دون موافقة صريحة. |
| n8n | الـWorkflow الخاص باعتماد ونشر المحتوى مبني ويعمل داخليًا حتى نقطة Owner Approval. |
| المحتوى | تم إنشاء واعتماد عنصر Facebook حقيقي واحد داخل `content_items` (انظر CURRENT_BLOCKER). |
| التصميمات | لا تغيير مطلوب في هذه المرحلة. |

## 4. ما يعمل وما لم يتم التحقق منه

**يعمل ومؤكَّد:**
- الواجهة الأمامية لتطبيق Command Center Hub بعد تسجيل الدخول: Authenticated UI visually verified.
- Workflow اعتماد المحتوى في n8n يعمل داخليًا وينفّذ حتى خطوة Owner Approval بنجاح دون نشر فعلي.
- إنشاء واعتماد عنصر Facebook حقيقي نصي بدون وسائط (`content_item_id: 9cf29b08-aaa3-4278-80bc-08a4cf3bc381`) وعرضه على المالك.

**لم يتم التحقق منه بعد:**
- RBAC، الـAPIs، عمليات الكتابة (write operations)، الإسناد (attribution)، وبعض المسارات الوظيفية للتطبيق — غير مُتحقَّق منها بالكامل.
- النشر الفعلي لعنصر Facebook الحقيقي عبر الـWorkflow (بانتظار تنفيذ التفويض المحدد من المالك).
- سلوك الـWorkflow الكامل بعد النشر الفعلي (توليد Facebook Post ID، الرابط، وقت النشر، execution ID، وreceipt status).

## 5. البنود المغلقة والمؤجلة والممنوعة

**مغلقة (لا تُعاد):**
- بناء واختبار تطبيق Command Center Hub التقني وميزاته الأساسية (موثّق بالتفصيل في `PROJECT_HANDOFF.md`).
- الاختبار الداخلي الأول لـWorkflow اعتماد المحتوى حتى نقطة Owner Approval — نجح ولا يُعاد فحصه دون خطأ مباشر جديد.

**مؤجلة:**
- Release Readiness Review للتطبيق (مذكورة في `PROJECT_HANDOFF.md`) — بند تقني مؤجل فقط، لا يُدرَج ضمن ترتيب مراحل خطة التسويق في القسم 6 ولا يعطلها.

**ممنوعة:**
- استخدام `test-content-0001` كعنصر اختبار حقيقي — إنه **Mock فقط** ولا يُستخدم للنشر أو كدليل جاهزية.
- إعادة فحص أي بند مغلق أعلاه دون سبب/خطأ مباشر وموثّق.
- إنشاء خطة عمل جديدة من الصفر تتجاوز أو تستبدل ترتيب المراحل المعتمد أدناه.
- أي نشر أو تفعيل أو حذف أو Merge أو Migration دون موافقة صريحة من المالك.

## 6. ترتيب المراحل المتبقية المعتمد

1. Owner Decision Consolidation — ControlTowerV2 كبوابة القرار الوحيدة (مغلق برمجيًا؛ تحقق الواجهة المصادق عليه مؤجل).
2. Content Experience Simplification — فحص وتنظيم الموجود فقط (مغلق: التوليد يدوي ومؤكد).
3. Media Experience Simplification — Content → Media → Ready، مع الحفاظ على الموافقات (المرحلة الحالية).
4. Connections / Truthful Status — حالة حقيقية دون إصلاح أو تنفيذ تلقائي.
5. Operational Flow Verification — Content → Media → Approval → Publish → External Result → Receipt.
6. Controlled Publishing — اختبار محدود وبموافقة يدوية فقط.
7. Measurement — GA4 / UTM / Attribution / Conversion Tracking بعد ثبات التشغيل.
8. Growth Systems — SEO / Local SEO / Chatbot / n8n alerts ثم الإعلانات لاحقًا.

لا يجوز تغيير هذا الترتيب أو تجاوز مرحلة قبل إغلاق التي تسبقها. Release Readiness Review لتطبيق Command Center Hub بند تقني مؤجل (القسم 5) ولا يُدرَج بين هذه المراحل.

## 7. CURRENT_PHASE

**EXECUTIVE PIPELINE VERIFICATION & VEO 3.1 POST-PR #239 AUDIT**

## 8. CURRENT_BLOCKER

**لا يوجد عطل Production مثبت حاليًا.** آخر Production deployment مربوط بـ`main` والـcommit `851186b` (PR #239) وحالته READY على Vercel (`35wQ6A2A5Pauym2qPsXtJSKhDY4v`). تم تمرير كامل حزمة الاختبارات (251/251) واختبار ميزانية الأداء وTypeScript بنجاح 100%.

## 9. آخر نتيجة مؤكدة

**Facebook Controlled Publishing Test — مغلق بتحفظ (2026-09-11):**
- عنصر Facebook المعتمد: `content_item_id: 9cf29b08-aaa3-4278-80bc-08a4cf3bc381`
- **Post ID:** `1164107840123575_122116295205382830`
- **Receipt status:** `published` (Supabase)
- **Published at:** `2026-08-05T21:57:29.690357+00`
- **تحقق عام:** الرابط العام على Facebook أظهر «المحتوى غير متاح» بدون تسجيل دخول — **تحقق يدوي مطلوب** على الصفحة. **لا إعادة نشر تلقائي** (قاعدة الغموض).

**Hub:** لوحة اليوم + Inbox + Content Studio يعملون بعد إصلاح حالة `cancelled` (PR #80).

**Media Library + Canva (2026-09-12):**
- معاينة الصور/الفيديو عبر signed URLs (PR #84، مدمج في `main`).
- Canva Brand Template `EAHVAAahmjU` — Generate **PASS**؛ `media_asset_id`: `20e13023-11c0-4040-832d-f72bcd77a4a8`.
- دفعة محتوى `batch_id`: `17ce0f07-219a-45a9-a52d-1a2c8b5af447` (10 عناصر؛ 6 Instagram).

**Instagram prep (2026-09-12):**
- `content_item_id`: `ffb9f795-c359-43c5-861c-5594eda75eef` — **approved** (مالك).
- `media_asset_id`: `20e13023-11c0-4040-832d-f72bcd77a4a8` — **approved**, consent **confirmed**, publishability **ready_for_review**.

## 10. الخطوة الحالية (NEXT)

1. التحقق من اتساق مسار الأكاديمية الكامل: Coach Brain → Factory → Design → Media Library → Review → Publish → Receipt.
2. الحفاظ على الميزانية بعدم إجراء اختبارات توليد أو نشر مدفوعة متكررة.
3. اعتماد التوثيق المحدث وتأكيد مطابقة مصفوفة قدرات المالك للواقع الفعلي للكود.

**آخر نقطة آمنة مؤكدة:** `main` = `851186b`، Production = READY (Vercel deployment: `35wQ6A2A5Pauym2qPsXtJSKhDY4v`).

## 11. تذكير إلزامي لكل Agent

- لا تبدأ من الصفر — التزم بـCURRENT_PHASE أعلاه.
- لا تعِد فحص البنود المغلقة في القسم 5.
- لا تستخدم `test-content-0001` كدليل جاهزية أو للنشر.
- أي نشر فعلي لعنصر Facebook يتطلب موافقة صريحة من المالك بعد عرض العنصر عليه، ضمن التفويض المحدود المذكور في القسم 9 (منشور واحد فقط، بدون Boost أو إعلانات أو إعادة نشر).
- عند غموض نتيجة النشر: لا تُعِد المحاولة تلقائيًا؛ أبلغ المدير/المالك.
- التزم بحدود الأنظمة المعتمدة في القسم 12 (APPROVED SYSTEM BOUNDARIES) ولا تلمس الأنظمة أو الحسابات غير المدرجة فيه.

## 12. APPROVED SYSTEM BOUNDARIES

- Active Supabase project only: `nmzxrjdxvmmzzmajrskm`
- Never touch inactive Supabase: `aazhniddjvhuimlxxjfd`
- Approved n8n workflow only: `xNwYPSXQiUyzDSyZ`
- Old workflows must remain inactive and untouched: `7OVKtZ2TAZsrDIXc`, `Vj8Xh4UQ534LYist`
- Facebook Page ID: `1164107840123575`
- Instagram Account ID: `17841439747493221`
- Never expose tokens or secrets in documentation.

## 13. FUTURE PHASE ASSETS — DO NOT REBUILD

نتيجة Second-Pass Discovery Audit (2026-08-03) على مستودع الموقع العام `swim-fluent-uae` وSupabase الفعّال وn8n المعتمد. لا تُعاد بناء ما يلي عند وصول دور المراحل 6-8؛ التحقق النهائي من الحسابات الخارجية يبقى مطلوبًا أولًا:

- **SEO**: البنية التقنية (sitemap.xml, robots.txt, canonical, Open Graph, Schema.org JSON-LD لـ Organization/Person/Service) مبنية ومختبرة بعقود في `swim-fluent-uae`؛ موثّقة بتفصيل في `docs/seo/`.
- **GA4**: الكود موجود (Consent Mode v2) لكنه معطّل (`VITE_ENABLE_GA4=false`) وبدون Measurement ID مؤكد.
- **Chatbot الموقع**: واجهة FAQ أمامية مبنية ومتحقَّق منها بصريًا مرة واحدة في Preview، لكنها معطّلة بـ Feature Flag ولا تُخزّن أو ترسل أي بيانات.
- **Supabase**: جداول `conversations`/`leads`/`knowledge_entries` جاهزة هيكليًا للمرحلة 8 لكنها فارغة (0 صف).
- لا يوجد اتصال حي مؤكد بـ WhatsApp Business API أو Facebook Messenger أو Instagram Messaging (لا Webhooks، لا بيانات مسجَّلة).
- **Vercel Production / الدومين / Google Search Console / Google Business Profile**: BLOCKED_BY_ACCESS أو UNVERIFIED — لم تُفحص مباشرة في هذا الجرد؛ تتطلب دخول المالك عند وصول دور المرحلة المعنية فقط.


## 14. Owner-directed technical task — BLK-01 (2026-10-01)

- Branch: `blk-01-coachbrain-cost-transparency`, based on latest main `a56d54c`.
- **Draft PR #171:** https://github.com/aymanmahrous/command-center-hub/pull/171. It is for review only; no merge or production deployment is authorized by this record. This technical task does not change the content-stage `CURRENT_PHASE` above.
- Coach Brain now forwards Gemini usage metadata and displays bilingual token counts plus a dated, paid-tier token-cost estimate. Missing usage is shown as unavailable; Google Search grounding costs and remaining quota are not guessed. Provider error detail is no longer returned.
- Validation on latest main: 15 focused tests passed; application TypeScript, strict pricing-helper TypeScript, Edge Function syntax transpile, and `git diff --check` passed. The Vite build compiles but the existing performance gate fails on both base and branch: limit 371,000 raw / 108,700 gzip; clean `origin/main` 400,062 / 117,338; PR branch 400,062 / 117,344. Raw size is unchanged; gzip differs by 6 bytes. No Gemini or Canva provider API call, DB/schema/auth/secret change, or publication occurred. PR pushes triggered Vercel Preview deployments; see section 15. No Production deployment was observed.

### Canva safe-verification boundary

- The read-only function/version listing and no-credential `OPTIONS` reachability check were completed; see section 15. They prove only function metadata and route/CORS reachability, not OAuth health.
- Do **not** use `POST mode: "status"` as a health check: current source calls `refreshCanvaAccessToken` and upserts refreshed credentials in `staff_canva_tokens`. Do **not** use `POST mode: "generate"`: it creates/exports a Canva design and stores media.
- Current repository source still contains `staffId = staffId` in the user-auth path. Deployed source parity was not checked, so do not assume the same code is live. Any fix or authenticated runtime test is a separate atomic step.

**NEXT ATOMIC STEP:** Owner review of open Draft PR #171. Do not merge or make a Production deployment without a separate decision. Bundle-budget optimization is a separate step; no code change is authorized by this record.


## 15. Follow-up verification — PR, Vercel, and Canva (2026-10-01)

- PR #171 remains **OPEN / DRAFT / unmerged**. All six GitHub checks passed. The PR includes the Coach Brain usage tests and records the 15 passing focused tests, TypeScript checks, Edge Function syntax check, diff check, and the current-base build-budget comparison.
- GitHub branch pushes triggered Vercel deployments. The two inspected deployments were **READY Preview deployments** for this PR branch (branch-specific `vercel.app` hosts, `target: null`); neither was a Production deployment. Future pushes to this branch may trigger more Preview deployments automatically. No production deployment or production-domain change was observed.
- Supabase lists `canva-design` as **ACTIVE, version 20**. A request with no Authorization/API-key headers to its deployed endpoint using `OPTIONS` returned **HTTP 204**, with an empty body and `POST, OPTIONS` in `Access-Control-Allow-Methods`. This proves only that the endpoint's OPTIONS/CORS handler is reachable; it does not verify Canva OAuth or credentials. No `POST status` or `POST generate` was sent.
- This follow-up supersedes the earlier expectation that the Canva metadata/route check was still pending. The PR remains for owner review; no merge or production deployment is authorized by this record.

**Safe future work, only as a separate atomic step:** Analyze the existing initial-JavaScript size gate and chunk/import graph against the clean main baseline, then propose the smallest reversible optimization. Do not change code, alter the budget, or deploy until that step is authorized and has a measurable acceptance criterion.


## 16. Executive Verification & Current Baseline (2026-10-09)

- **Latest commit on main:** `851186bd038dd16799959b4e453428965faaef93` (PR #239 merged).
- **Vercel Production Deployment:** Deployment ID `35wQ6A2A5Pauym2qPsXtJSKhDY4v`, state `SUCCESS` (completed `2026-10-09T03:27:14Z`).
- **Automated Verification:**
  - TypeScript typecheck (`npm run typecheck`): PASS (0 errors).
  - Test suite (`npm test`): 251 passed, 0 failed.
  - Production build & budget gate (`npm run build`): PASS (JS initial: 369,969 raw / 108,445 gzip vs limits 371,000 / 108,700).
- **PR #238 & #239 Summary:**
  - PR #238 implemented real Veo cost estimation display.
  - PR #239 exposed actionable Veo failure details (`providerStatus` HTTP code and bounded diagnostic detail) in Factory review panel, preventing blind retries upon upstream Google API 502 errors.
- **Pipeline Continuity:**
  - `Coach Brain → Factory → Generate → Design → Media Library → Review → Approve → Schedule/Publish → Meta → Receipt/Results → Coach Brain` is verified through source analysis and automated contracts.


## 17. Executive Consolidation & Media Hierarchy Implementation (2026-10-09)

- **Factory UX Simplification:**
  - Redundant 9-tab header (`content-section-nav`) and 4-card action desk (`factory-action-desk`) removed.
  - Replaced with a unified 5-stage sequential rail: `١. التوليد والخطة` → `٢. التصميم والفيديو` → `٣. المراجعة والاعتماد` → `٤. الجدولة` → `٥. النشر والإيصال`.
  - Added direct return-to-brain feedback loop in the Overview/Receipts stage: `[🧠 استشر Coach Brain حول هذه النتائج والخطوة القادمة]`.
- **Coach Brain Executive Partner Mandate:**
  - System prompt in `supabase/functions/coach-brain-research/index.ts` restructured to eliminate academic 12-heading essay format.
  - Every answer now strictly starts with:
    1. `## 1. الخلاصة والرأي الموصى به (Summary & Recommended Opinion)`
    2. `## 2. أفضل خطوة تالية وسبب اختيارها (Best Next Step & Rationale)`
    3. `## 3. التكلفة المتوقعة والمخاطر أو القيود (Expected Cost, Risks & Constraints)`
- **Media Repetition Root Cause & Multi-Source Picker:**
  - Root cause diagnosed: hardcoded Canva template ID (`DAHVAMAUP-s`) generated duplicate graphics; review panel lacked library selection and device upload.
  - Implemented multi-tier media picker on review cards:
    1. Select and link existing verified assets from `Media Library` with 1 click (`link_staff_media_to_content_item`).
    2. Direct device upload (`uploadStaffMediaFile` → `register_staff_media_upload` → auto-link).
    3. External AI/design generation (Canva / Veo) retained as opt-in choices with pre-generation cost estimates.
- **Publishing & Messaging Truth:**
  - **Meta (Facebook & Instagram):** Live publishing and receipt verification operational via `safe-content-publisher`.
  - **TikTok:** Content Posting API requires developer registration, Direct Post audit approval, and domain verification. Current honest state is `NEEDS_CREDENTIAL / DEVELOPER_APP_APPROVAL`. Draft/review/export flow prepared.
  - **Messaging (WhatsApp / Messenger / Instagram Direct):** Intelligent concierge response engine (`process_ai_sales_concierge_turn`) and human takeover (`AIInboxView`) are shared across channels without creating redundant AIs.
- **Verification Gates:**
  - `npm run typecheck`: 0 errors.
  - `npm test`: 251 / 251 passed.
  - `npm run build`: 370,077 bytes raw / 108,535 bytes gzip (well within strict 371,000 / 108,700 budget).
## 18. Executive Partner Mandate: Canva Diagnostics, AI Strategy & Unified Connections (2026-10-09)

- **Canva Root Cause Diagnosis & Resolution:**
  - **Diagnostic:** Browser error `Load failed` / `424 Needs Credential` was caused by missing Canva Developer App secrets (`CANVA_CLIENT_ID` / `CANVA_CLIENT_SECRET`) in Supabase Edge Secrets. An end-user Canva Pro subscription does not grant developer API access.
  - **Resolution:**
    - Localized bilingual error handling in `src/canva-adapter.ts` with explicit Arabic and English messages guiding the owner to the free, working alternative.
    - Added direct 1-click `[Open Canva / فتح Canva يدوياً]` actions in `src/integrations-center.tsx` and `src/media-library-controls.tsx`.
    - Preserved zero-cost `canvaBrief` workflow: automatically provides dimensions, headlines, and palette for manual creation in existing Canva Pro accounts without paid API tiers.
- **Unified AI Strategy (Google Gemini Core):**
  - Clarified architectural truth: All server operations (Coach Brain, content batch generation, media analysis, Veo video) are powered server-side by Google Gemini (`gemini-2.0-flash` & `gemini-3.7-flash`) via `GEMINI_API_KEY`.
  - Clarified that personal subscriptions (ChatGPT Plus $20/mo, Gemini Advanced $20/mo) cannot be connected as developer APIs by third-party software.
  - No OpenAI API subscriptions required; owner budget protected from redundant AI expenses.
  - Updated `src/integrations-center.tsx` descriptions and setup modal to explicitly state that Gemini AI is centrally active server-side.
- **Messaging & Notifications Truth:**
  - Telegram integration clarified as optional internal staff notifications channel; central customer AI concierge operates via verified Meta WhatsApp Cloud API.
- **Verification Gates:**
  - `npm run typecheck`: 0 errors.
  - `npm test`: 253 / 253 passed.
  - `npm run build`: 370,077 bytes raw / 108,531 bytes gzip (strictly within 371,000 / 108,700 budget).
