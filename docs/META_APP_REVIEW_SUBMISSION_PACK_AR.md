# حزمة Meta App Review — Command Center Hub

**تاريخ التحقق:** 24 سبتمبر 2026
**Meta App ID:** `980385998373405`
**المستودع:** [command-center-hub](https://github.com/aymanmahrous/command-center-hub)
**رابط الإنتاج الذي فُتح أثناء الفحص:** [Command Center Hub](https://command-center-3plryjgqw-swimmingayman-8492s-projects.vercel.app/)

> **النتيجة التنفيذية: التطبيق منشور على الويب، لكنه غير جاهز الآن لإعادة تقديم صلاحيات صفحات Facebook.** صفحة الإنتاج تعرض تسجيل دخول موظف بالبريد وكلمة المرور. لم يظهر فيها Facebook Login أو شاشة منح صلاحيات Facebook أو اختيار صفحة. لذلك يجب عدم تسجيل فيديو أو إعادة إرسال الطلب بنص يصف هذه الخطوات قبل أن تُنفذ فعلًا داخل التطبيق.

## 1. ما تحققنا منه وما لم نغيّره

تم فتح نسخة الإنتاج المرتبطة بآخر إصدار من `main`. ظهرت صفحة دخول الموظفين بعنوان **Relax Fix Command Center**، مع حقلي البريد وكلمة المرور. لا يستطيع مراجع Meta الوصول إلى تجربة النشر من دون حساب موظف اختباري صالح.

مراجعة مصدر التطبيق تؤكد أن وظيفة النشر الحالية تستخدم `FACEBOOK_PAGE_ID` و`FACEBOOK_PAGE_ACCESS_TOKEN` المحفوظين في الخادم. هذا مسار نشر محمي لمنشور معتمد، لكنه لا يساوي ربط حساب Facebook للمستخدم. لا توجد في ملفات التطبيق التي جرت مراجعتها دعوة فعلية إلى Facebook Login، ولا شاشة لاختيار Page من قائمة المستخدم، ولا شاشة تعرض محتوى Page للمستخدم داخل التطبيق، ولا مسار واجهة لإظهار تعديل المنشور وحذفه.

في المهمة السابقة فُتحت صفحة ملاحظات Meta الخاصة بالطلب، وسُجل أنه **لا يوجد Feedback إضافي غير ملاحظة الفيديو**. لم نعد فتح لوحة Meta في هذا التحديث، حتى لا نكرر فحصًا أُنجز. ملاحظة الفيديو وحدها تتفق مع الفجوة التي ظهرت في التطبيق.

لم نعدّل `safe-content-publisher` أو Page ID أو Supabase أو n8n أو إعدادات Meta أو أسرار Vercel. لم ننشر منشورًا تجريبيًا، ولم نرسل طلب مراجعة، ولم نغيّر وضع التطبيق.

## 2. المطلوب قبل أن تصبح إعادة المراجعة ممكنة

تقول إرشادات Meta الحالية إن التطبيق يجب أن يكون متاحًا للمراجعين، وإن كل صلاحية مطلوبة يجب أن يكون لها استدعاء API ناجح حديث، كما يجب أن يبيّن التسجيل منح الصلاحية واستخدامها الفعلي داخل التطبيق. توصي Meta بتسجيل واضح بدقة 1080p أو أفضل وبواجهة إنجليزية عندما يكون ذلك ممكنًا. وتوضح إرشادات `pages_manage_posts` أن الفيديو يجب أن يعرض تسجيل الدخول، ثم إنشاء منشور وتعديله وحذفه، مع عرض المنشور بعد تحديثه. كما يجب على التطبيق عرض محتوى Page داخل التطبيق إذا كان طلب المراجعة يشمل `pages_read_engagement`.[1] [2]

| الأولوية | ما يجب أن يعمل داخل التطبيق | دليل النجاح المطلوب |
|---|---|---|
| 1 | منح Facebook Login صلاحيات Page المطلوبة من حساب الاختبار. | شاشة Meta الحقيقية تظهر في جلسة جديدة، ثم يعود الحساب إلى التطبيق. |
| 2 | عرض الصفحات التي يستطيع مستخدم Facebook إدارتها. | قائمة صفحات حقيقية من الحساب، واختيار صفحة اختبار واحدة داخل التطبيق. |
| 3 | عرض محتوى Page ذي الصلة داخل التطبيق إذا احتجنا `pages_read_engagement`. | يقرأ التطبيق منشورًا على الصفحة المختارة ويعرض محتواه للمستخدم. فتح Facebook في تبويب خارجي وحده لا يثبت هذه الوظيفة. |
| 4 | نشر منشور موافق عليه على الصفحة المختارة. | يظهر نجاح حقيقي ورابط أو معرف منشور، ثم يظهر المنشور على صفحة الاختبار. |
| 5 | تعديل المنشور وحذفه من الواجهة، إذا طلبنا `pages_manage_posts`. | يظهر الفيديو عملية التعديل ثم عرض النص المحدث، وبعد توثيق النتيجة يحذف منشور الاختبار فقط. |
| 6 | توفير مسار دخول مراجعين آمن. | حساب موظف اختباري وحساب Meta اختباري لهما أقل الصلاحيات اللازمة، مع بيانات دخول صالحة في حقل التعليمات الآمن في Meta، لا داخل مستودع عام. |

هذه المتطلبات لا تعني إعادة بناء التطبيق كاملًا. لكنها تتطلب تنفيذ تدفق Facebook Login واختيار الصفحة وقراءة المنشور وتعديل/حذف المنشور بصورة حقيقية، ثم اختبارها على صفحة غير إنتاجية. لا ينبغي اعتبار عملية نشر ثابتة إلى Page ID محفوظ في الخادم بديلًا عن تدفق المستخدم الذي يطلبه نموذج المراجعة.

## 3. نصوص مقترحة للصلاحيات — لا تُلصق قبل تنفيذ التدفق

النصوص الإنجليزية أدناه **مسودات مشروطة**. لا تُرسلها إلى Meta حتى تعمل الشاشات الموضحة ويُسجّل فيديو مطابق لها. اطلب فقط الصلاحيات التي يستخدمها التطبيق فعلًا.[1] [2]

### `pages_show_list`

> Command Center Hub uses `pages_show_list` to display the Facebook Pages that the signed-in Facebook user is authorized to manage. The user selects the destination Page inside the publishing workspace before reviewing or confirming any publishing action. We request access only to the Pages available to that user. The recording demonstrates Facebook Login, the permission grant, the returned Page list, and the user selecting a test Page.

**يُرسل فقط بعد:** ظهور Facebook Login وقائمة صفحات حقيقية مع اختيار المستخدم. هذه الصلاحية تابعة أيضًا لمسار `pages_manage_posts`.[1]

### `pages_read_engagement`

> Command Center Hub uses `pages_read_engagement` to retrieve Page post content for the Page selected by the authorized user and display that content inside the app for review and verification. The user can open the selected Page’s content in the publishing workspace and confirm the result of a post update. We do not use this permission to read unrelated Pages or for advertising or profiling. The recording shows the user granting access and the selected Page’s post content appearing inside Command Center Hub.

**يُرسل فقط بعد:** أن يعرض التطبيق محتوى منشور Page داخل واجهته. إذا كان الاستخدام الفعلي يقتصر على النشر ولا يتضمن عرض المحتوى داخل التطبيق، فلا تفترض أن هذا النص أو هذه الصلاحية مبرران؛ راجع متطلبات Meta لكل مسار قبل الطلب.[1]

### `pages_manage_posts`

> Command Center Hub uses `pages_manage_posts` to create, edit, and delete posts on the Facebook Page explicitly selected by the authorized user. The user signs in with Facebook, grants the requested Page permissions, chooses a Page, reviews an approved content item, and confirms the publishing action in the app. The user can then edit the resulting post, view the updated post, and delete the test post from the app. The recording demonstrates the complete login and permission flow and verifies the updated post on the selected test Page. The app does not publish to Pages that the user has not selected and authorized.

**يُرسل فقط بعد:** عمل الإنشاء والتعديل والحذف من واجهة التطبيق، وعلى صفحة اختبار، وظهور النسخة المعدلة. يطلب Meta عرض العمليات الثلاث لهذه الصلاحية.[1] [2]

## 4. تعليمات المراجع — قالب يُستكمل بعد توفير حساب الاختبار

لا توجد الآن بيانات حساب موظف اختباري أو اسم صفحة اختبار أو رابطها أو محتوى منشور اختبار موثق. لا تضع كلمات مرور أو رموز وصول في هذا الملف أو في GitHub. أضف بيانات الحساب فقط في وسيلة Meta الآمنة المخصصة لتعليمات المراجع بعد إنشائها.[1]

**قالب English — لا ترسله قبل استبدال الأقواس واختبار كل خطوة:**

> 1. Open the Command Center Hub production URL: `https://command-center-3plryjgqw-swimmingayman-8492s-projects.vercel.app/`.
> 2. Sign in with the reviewer staff account provided in the secure review instructions.
> 3. Choose **Connect Facebook** and sign in with the Meta test account provided for this review.
> 4. Grant `pages_show_list`, `pages_read_engagement`, and `pages_manage_posts` when prompted.
> 5. In Command Center Hub, select the test Page: `[EXACT TEST PAGE NAME]`.
> 6. Open the Page content view and confirm that the test Page’s post content is displayed in the app.
> 7. Open the approved test item titled `[EXACT ITEM TITLE]`, review its destination and text, and select **Publish**.
> 8. Verify that the app displays a successful result and the post identifier or link.
> 9. Open the post-management view in Command Center Hub, edit the test post, save the change, and verify that the updated post is displayed.
> 10. Delete only the test post after the reviewer has verified the updated result.
> 11. The selected test Page is `[EXACT PAGE URL]`. The expected unique test prefix is `[UNIQUE PREFIX]`.

إذا تعذّر تنفيذ خطوة من هذه الخطوات في الواجهة، احذف الصلاحية أو الخطوة من طلب المراجعة بدل الادعاء بأنها تعمل. لا تضع اسم مستخدم أو كلمة مرور تخمينية.

## 5. سيناريو التسجيل الصحيح

سجّل الشاشة بعد نجاح كل الخطوات أعلاه، وابدأ من نافذة خاصة جديدة. اجعل لغة الواجهة الإنجليزية إن أمكن. سجّل بدقة 1080p أو أعلى، وبدون صوت؛ إرشادات Meta تقول إن المراجعين لن يستمعوا إلى الصوت. أظهر المؤشر والنقرات، ولا تعرض أي كلمات مرور أو مفاتيح أو رموز وصول.[1]

| الجزء | ما يجب أن يظهر بوضوح |
|---|---|
| البداية | رابط التطبيق، صفحة الدخول، ثم تسجيل دخول الموظف الاختباري. |
| Facebook Login | اختيار ربط Facebook، حساب الاختبار، شاشة الموافقة، والصلاحيات المطلوبة كما تظهر فعلًا. |
| اختيار الصفحة | قائمة Pages الحقيقية، ثم اختيار صفحة الاختبار وظهور اسمها داخل التطبيق. |
| `pages_read_engagement` | فتح محتوى منشور من الصفحة وعرضه داخل Command Center Hub. |
| `pages_manage_posts` | اختيار محتوى معتمد، مراجعة الوجهة والنص، نشره، ثم تعديل المنشور والتحقق من ظهور النسخة المحدثة وحذف منشور الاختبار. |
| التحقق | إظهار نتيجة العملية ومعرف المنشور، ثم فتح صفحة الاختبار لإثبات النتيجة الحقيقية. لا تحذف المنشور قبل إثبات التحديث. |

لا تستخدم شاشة تجريبية أو مقطعًا مركبًا يوحي أن وظائف غير موجودة تعمل. أظهر المسار الحقيقي فقط.

## 6. تحقق الإصدار قبل اختبار النشر

وظيفة النشر في المصدر تستخدم `META_GRAPH_VERSION` إن وُجد، وإلا ترجع إلى `v21.0`. لا نعرف من فحص المصدر وحده القيمة الحالية المحفوظة في أسرار Supabase. أعلنت Meta أن `v21.0` سيُزال في **21 يناير 2027**، وأن أحدث نسخة موثقة في 24 سبتمبر 2026 هي `v26.0`.[3] لا تغيّر سر الإنتاج أو ترقية API مباشرة قبل اختبار التوافق على بيئة اختبار؛ لكن يجب تسجيل النسخة الفعلية والتحقق منها قبل توثيق نجاح النشر.

وتشترط Meta وجود استدعاء API ناجح لكل صلاحية خلال 30 يومًا من تقديم طلب App Review. يمكن إجراء هذا الاستدعاء من التطبيق أو Graph API Explorer، لكن يجب الاحتفاظ بدليل واضح وعدم إدخال رموز وصول في هذا المستودع.[1]

## 7. حالة الفحوص والتسليم

- رابط إنتاج Vercel الذي جرى فتحه أعاد صفحة تسجيل دخول موظفين قابلة للعرض؛ لم يتم تجاوز تسجيل الدخول.
- مجموعة اختبارات المستودع نجحت بعد تثبيت الاعتماديات: **222 اختبارًا ناجحًا من 222**. كانت المحاولة الأولى غير مكتملة بسبب غياب `node_modules` محليًا، لا بسبب فشل اختبار في مسار Meta.
- نتائج الاختبارات تثبت سلوك الشيفرة المختبر، لكنها لا تثبت صحة Page ID أو صلاحية رمز Meta أو نجاح نشر حي.
- حالة آخر فحص لصفحة Meta في المهمة السابقة: لا يوجد Feedback إضافي غير ملاحظة التسجيل/إثبات الاستخدام. ينبغي التحقق مجددًا من الحالة فقط قبل الإرسال النهائي لأن حالة لوحة Meta قد تتغير.
- لا يوجد تسجيل شاشة ناجح ولا منشور اختبار حي ولا بيانات مراجعين في هذه الحزمة. هذه عناصر مطلوبة لإكمال الإرسال، ولا يجوز الادعاء بأنها أُنجزت.

### ملاحظة منفصلة عن خصوصية المستودع

وصف مستودع GitHub يقول إنه خاص وداخلي، لكن فحص الصلاحية أعاد أن المستودع **عام**. لم يُعثر على ملف `.env` متعقب؛ الموجود هو `.env.example` فقط. لم نغيّر الخصوصية لأن ذلك تغيير في ملكية/إتاحة المستودع ويجب أن يختاره المالك. قبل إضافة أي بيانات اختبار، يجب إبقاء كلمات المرور ورموز Meta وأسرار Supabase خارج المستودع العام.

## 8. الترتيب الأقل تكلفة والأكثر أمانًا

1. إنشاء مستخدم Meta اختباري وصفحة Facebook غير إنتاجية، وإنشاء حساب موظف اختباري لا يحتوي إلا على الصلاحيات اللازمة للمراجعة.
2. تنفيذ Facebook Login ومنح الصلاحيات واختيار Page داخل التطبيق. لا تغيّر أسرار الإنتاج أثناء البناء.
3. إظهار محتوى الصفحة داخل التطبيق إذا كان طلب `pages_read_engagement` سيبقى ضمن الطلب.
4. اختبار إنشاء منشور واحد واضح العلامة على صفحة الاختبار، ثم التحقق منه. لا تنشر على صفحة العملاء أو الصفحة التسويقية الحية.
5. اختبار تعديل المنشور ثم حذفه من حساب الاختبار فقط؛ لا تلمس منشورًا حقيقيًا.
6. التحقق من نسخة Graph API ورمز صفحة الاختبار. احفظ نتيجة الخطأ فقط إذا فشل الطلب، ولا تكرر المحاولة بلا معرفة ما إذا كانت المحاولة السابقة قد وصلت إلى Meta.
7. سجّل فيديو الشاشة الحقيقي بعد نجاح التدفق، ثم الصق النصوص أعلاه في الطلب.
8. راجع الصفحة والفيديو وتعليمات الدخول مرة أخيرة. بعد ذلك يرسل مالك التطبيق الطلب من لوحة Meta.

**لا تُرسل الطلب الحالي بالنصوص القديمة**؛ فهي تصف Facebook Login واختيار Pages وعرض المحتوى داخل التطبيق، وهي خطوات لم تظهر في نسخة الإنتاج التي فُحصت. لا نُعدّل مسار النشر أو أسرار Meta ضمن هذا التحديث.

## المراجع

[1]: https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review/submission-guide "Meta App Review submission walkthrough"
[2]: https://developers.facebook.com/documentation/development/permissions "Meta Platform permissions reference"
[3]: https://developers.facebook.com/docs/graph-api/changelog/version26.0/ "Meta Graph API v26.0 changelog and deprecation schedule"
[4]: https://developers.facebook.com/documentation/pages-api/posts "Meta Pages API posts guide"

**إعداد:** Manus AI
