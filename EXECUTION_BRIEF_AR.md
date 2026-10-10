# موجز التنفيذ المعتمد قبل بدء التطوير

## الرأي الإداري على الملف المرفق

الملف المرفق هو أفضل صياغة للتنفيذ حتى الآن؛ لأنه يثبت القاعدة الصحيحة:

> **KEEP → ORGANIZE → INTEGRATE → IMPROVE**

وليس:

> DELETE → REBUILD

كما أنه يحدد بوضوح ما لا يجب لمسه: قاعدة البيانات، RLS، المصادقة، النشر، التكاملات الخارجية، الأرشيف، والوظائف الحالية.

سأعتمد الملف أساسًا للتنفيذ، مع تعديلين ضروريين:

1. عبارة **«نفذ كدفعة واحدة»** ستعني دفعة تطوير واحدة متماسكة في نطاق الواجهة والتنقل، وليس إعادة كتابة التطبيق كله.
2. عبارة **«فحص واحد فقط»** ستعني فحصًا واحدًا للمستخدم بعد اكتمال العمل، لكن سأستخدم داخليًا نقاط رجوع واختبارات آلية صامتة حتى لا نكتشف في النهاية أن إصلاح التنقل كسر Inbox أو Content.

لن أطلب منك مراجعة كل تعديل صغير، ولن أوقف العمل كل بضع دقائق. سأعمل ضمن النطاق المحدد، وأتوقف فقط إذا ظهر خطر حقيقي على البيانات أو الأمان أو الوظائف الحالية.

---

## نطاق هذه الدفعة

هذه الدفعة ستنفذ **إعادة تنظيم تجربة التطبيق فقط**، ولا ستفعل أي تكامل أو نشر أو توليد مكلف.

### ما سيتم تغييره

- Shell موحد للتطبيق.
- Navigation منظمة على شكل أقسام رئيسية وفرعية.
- دمج أفكار `command-center-workspace.ts` داخل الـShell الحالي دون حذف الملف.
- تحسين Back وForward وClose والحالة الداخلية.
- إعادة ترتيب Home لتعرض Today وNeeds Your Decision وSystem Status وResults.
- تحويل الإشعارات إلى Owner Action Panels قابلة للتنفيذ.
- تجميع الأقسام الحالية في الهيكل الجديد.
- تنظيم Inbox مع الحفاظ على الرسائل والاستلام البشري والرد.
- تنظيم Marketing وContent Factory وMedia وConnections داخل مساحات واضحة.
- تحسين الهاتف والـbottom navigation والـdrawers والـpreviews.
- الحفاظ على Massive Archive وكل الوظائف الحالية حتى إن وُضعت مؤقتًا داخل قسم أقرب منطقيًا.

### ما لن يتم تغييره

- لا حذف لأي قسم أو ملف أو وظيفة موجودة.
- لا حذف أو نقل للملفات الأصلية أو الأرشيف.
- لا Database migration.
- لا RLS أو Policy changes.
- لا Authentication changes.
- لا Publishing changes.
- لا TikTok publishing.
- لا Meta publishing.
- لا Canva أو Runway generation.
- لا Gemini bulk calls.
- لا Media Provider API activation.
- لا n8n workflow activation.
- لا أسرار في Frontend.
- لا تغيير في موقع Relax Fix UAE العام.
- لا إعادة كتابة كاملة لـ`main.tsx`.

---

## الهيكل الذي سيظهر للمستخدم

### Home

- Today.
- Needs Your Decision.
- System Status.
- Results.

### AI Factory

- Strategy.
- Ideas.
- Content.
- Designs.
- Reels.
- Campaigns.
- Review.

### Media Intelligence

- Media Library.
- Massive Archive.
- Cloud Sources.
- Search.
- Recommended Assets.
- Creative Fit.
- Quality.
- Consent.

### Inbox

- Conversations.
- Active Conversation.
- AI Suggestion.
- Human Takeover.
- Return to AI.
- Reply.

### Marketing

- Overview.
- Strategy.
- Content.
- Designs.
- Reels.
- Calendar.
- Review.
- Scheduled.
- Published.
- Performance.

### Automation

- Workflows.
- Current Step.
- Waiting for Owner.
- Failed.
- Retry.
- Audit.

### Customers

- CRM.
- Bookings.

### Analytics

- Analytics.
- Business Results.

### Connections

- Meta.
- Instagram.
- Facebook.
- TikTok.
- WhatsApp.
- Canva.
- Gemini.
- Runway.
- n8n.
- Google Drive.
- Google Photos.
- Dropbox.
- OneDrive.
- Google Calendar.

### Settings

- System settings.
- Account.
- Permissions.
- Preferences.

---

## طريقة إصلاح التنقل

سأجعل التطبيق يعمل كمساحة واحدة:

```text
Home → Inbox → Conversation → Back → Inbox
Home → AI Factory → Batch → Item → Back → Batch
Home → Marketing → Content → Preview → Close → Content
```

### القواعد

- التنقل الداخلي لا يستخدم فتح صفحة جديدة.
- Back يعيد القسم السابق داخل التطبيق.
- Forward يعيد القسم الذي تمت مغادرته.
- Close يغلق Drawer أو Preview فقط.
- فتح عنصر من Action Center يحفظ مصدر الوصول.
- العودة من التفاصيل تعيد المستخدم إلى نفس القائمة والفلتر.
- الروابط الخارجية فقط تفتح خارج التطبيق، مع حفظ نقطة العودة.

---

## طريقة بناء Owner Action Center

كل تنبيه يتحول إلى بطاقة قرار تحتوي على:

- ماذا حدث؟
- لماذا ظهر؟
- ما المطلوب من المالك؟
- ما توصية AI؟
- ما النتيجة المتوقعة؟
- ما المخاطر؟
- ما الإجراء الأساسي؟
- ما الإجراء البديل؟

الأفعال المعتمدة:

- Approve.
- Edit.
- Use Alternative.
- Choose Another Source.
- Reject with Reason.
- Defer.
- Stop Automation.
- Open Details.

لن تظهر عبارة `Cancel Task` وحدها دون تفسير.

---

## طريقة الحفاظ على الوظائف الحالية

سيتم عمل خريطة نقل داخلية:

| الوظيفة الحالية | مكانها الجديد |
|---|---|
| Dashboard | Home / Today |
| Today | Home / Today |
| Command | Command Palette / Home actions |
| Inbox | Inbox |
| CRM | Customers / CRM |
| Planner | Customers / Bookings |
| Automations | Automation / Workflows |
| Content | AI Factory + Marketing |
| Media | Media Intelligence / Media Library |
| Massive Archive | Media Intelligence / Massive Archive |
| Analytics | Analytics |
| Integrations | Automation / Operations أو Connections حسب نوعها |
| Connections | Connections |
| Radar | Home / Needs Your Decision أو Analytics |
| Coach Brain | AI Factory / AI Tools |
| Workspace | Command Center shell / AI Factory tools |
| Operations Queue | Automation / Operations |

إذا ظهرت وظيفة لا ينطبق عليها التصنيف، ستبقى موجودة في قسم `More tools` مؤقتًا بدل حذفها.

---

## كيف سنحمي الرصيد والوقت

### لا يوجد توليد خارجي في هذه الدفعة

لن يتم استدعاء:

- توليد صور.
- توليد فيديو.
- تحليل دفعات كبيرة.
- Gemini bulk.
- Canva generation.
- Runway.
- TikTok API.
- Meta publishing.
- n8n workflows.

### ما سيتم استخدامه فقط

- الكود الموجود.
- البيانات الموجودة.
- الحالات الحالية.
- RPCs الحالية دون توسيع نطاقها.
- CSS وReact وTypeScript محليًا.
- اختبارات البناء الحالية.

### لمنع التكرار

- لن أبدأ بتحليل جديد شامل للمشروع؛ الفحص الموجود والخطتان هما baseline.
- لن أعمل refactor جانبيًا.
- لن أصلح مشكلات غير مرتبطة.
- لن أعيد تصميم Backend في هذه الدفعة.
- لن أكرر توليد ملفات أو حلول متعددة لنفس المشكلة.

---

## كيف سننفذ دون توقفات متكررة

سأتعامل معها كدفعة واحدة متصلة من سبع حزم داخلية:

1. **Navigation model**.
2. **Shell composition**.
3. **Home and Action Center**.
4. **Section grouping**.
5. **Inbox and Marketing presentation**.
6. **Responsive/mobile behavior**.
7. **Preservation and cleanup**.

لن أطلب رأيك بين كل حزمة. بعد انتهاء الحزم السبع سأعرض لك تقريرًا واحدًا فقط:

- الحالة.
- الملفات التي تغيرت.
- الوظائف التي بقيت.
- الهيكل الجديد.
- نتيجة Back/Forward.
- ما لم يتغير لأسباب أمان.
- المشكلات غير المرتبطة إن وجدت.

---

## نقطة الأمان الداخلية الوحيدة

رغم أن المطلوب فحص واحد بعد التنفيذ، سأحافظ داخليًا على:

- فرع تطوير مستقل.
- نقطة Git رجوع قبل التعديل.
- فحص TypeScript محلي عند اكتمال الحزمة.
- اختبار البناء مرة واحدة في النهاية.
- مراجعة diff للتأكد من عدم لمس المسارات المحظورة.

هذه ليست توقفات للمستخدم، ولا تتطلب مراجعة متكررة، لكنها تمنع تسليم نسخة مكسورة أو حذف غير مقصود.

إذا ظهر خطأ متعلق مباشرة بالتعديل الحالي، سأصلحه ضمن نفس الدفعة. وإذا ظهر خطأ غير متعلق، سأسجله فقط ولن أوسع النطاق.

---

## معايير التسليم

لن أعتبر الدفعة ناجحة إلا إذا تحققت الشروط التالية:

- التطبيق يبدو كنظام واحد.
- لا توجد واجهتان منفصلتان لـDashboard وWorkspace.
- كل الوظائف القديمة ما زالت متاحة.
- Massive Archive ما زال موجودًا.
- Inbox واضح وقابل للاستخدام.
- Marketing منظم وليس صفحة طويلة.
- Factory واضح وله مكان معروف.
- Media وConnections واضحان.
- Back وForward يعملان داخل التطبيق.
- Close يغلق Drawer أو Preview فقط.
- الهاتف يعرض قسمًا واحدًا في كل مرة.
- لا توجد Database أو RLS أو Authentication changes.
- لا يوجد Publishing أو External API activation.
- لا يوجد توليد AI جماعي أو استهلاك رصيد غير ضروري.
- لا توجد ملفات أو وظائف محذوفة.

---

## القرار المقترح

**أوافق على تنفيذ الملف المرفق كأساس، مع التعديلين المذكورين:**

- تنفيذ دفعة واجهة وتنقل متماسكة، وليس إعادة بناء شاملة.
- فحص نهائي واحد ظاهر للمستخدم مع حماية واختبارات داخلية غير مزعجة.

وبعد هذه الدفعة فقط نعرض نسخة منظمة من التطبيق قبل اتخاذ قرار مستقل بشأن AI Factory الحقيقي، Media Intelligence، وTikTok. لا يتم الانتقال لهذه المراحل تلقائيًا.
