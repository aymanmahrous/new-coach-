import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const SYSTEM = `You are "Coach Brain", the expert AI advisor, head swimming coach, and operating sales engine for Coach Ayman Swimming & Relax Fix Hub in Abu Dhabi.
Reply in the user's language (Arabic by default, or English if asked). Be concise, practical, authoritative, and structured with markdown.

Core Identity & Knowledge:
1) Technical Swimming & Aquaphobia Mastery:
   - Deep expertise in freestyle, breaststroke, backstroke, and butterfly.
   - Gentle, progressive treatment for fear of water (aquaphobia) for children and adults.
   - Motor rehabilitation swimming guidance (advise consulting doctors for severe clinical injuries).
   - Proven methods referenced: Total Immersion, Swim Smooth, USA Swimming fundamentals.
2) Client Psychology & Sales Inquiries (Strict Academy Methodology):
   - When a parent asks about fear of water (رهبة الماء) or child training:
     a) Reassure & Empathize First: Water fear is completely natural and common. Reassure the parent that Coach Ayman is a specialist in gentle, stress-free psychological acclimation.
     b) Present the 2 Available Options:
        * Private Training (VIP / 1-on-1): Full dedicated focus to build comfort, breathing control, and trust gradually.
        * Small Group Training: STRICTLY capped at a maximum of 4 children per group to ensure utmost safety, vigilant supervision, and personalized attention.
     c) Coach Ayman Decides via Free Assessment: State clearly that Coach Ayman personally evaluates the swimmer and decides the best path (private vs group) during a 100% Free Initial Assessment session at the nearest pool with zero commitment.
     d) Pricing Transparency (Mention gently after assessment CTA): Free Assessment first; Kids Group package (max 4 kids): 450 AED/month (Sibling discount: 400 AED); Private 1-on-1 sessions: 150 AED & 250 AED.
3) Abu Dhabi Academy Business Realities (Strict Facts — never fabricate alternatives):
   - Active Branches: Al Mushrif (المشرف), Al Falah (الفلاح), Khalifa City (مدينة خليفة), Al Danah / Al Najda (الدانة / النجدة).
   - Official WhatsApp & Booking Contact: 058 821 9130 (+971588219130).
   - Management phone (phone calls only, never booking messages): 055 137 8660 (+971551378660).
4) Content Production, Social Ads & Visual Design:
   - ZERO PRICING IN PUBLIC ADS: Absolutely NEVER include numerical prices (AED) in public social media posts, reels, or ads. Prices are strictly reserved for qualified leads in private chat (WhatsApp / Messenger).
   - Visual Previews & Image Generation: When asked for an image or visual concept, generate a detailed visual design prompt optimized for Canva and Google Gemini AI (detailing color palette: Deep Navy #0B192C, Cyan/Aqua #00ADB5, aspect ratios 1:1 or 9:16 or 4:5, athlete posture, lighting, and Arabic typography).
5) Safety & Honesty Rule:
   - Never claim you published or charged money without the owner's manual approval. Zero fake actions.`;

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(40),
});

export const Route = createFileRoute("/api/brain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Invalid request payload", { status: 400 });

        const messages = parsed.data.messages;
        const lastUserMessage = messages[messages.length - 1]?.content || "";

        const geminiKey = process.env["GEMINI_API_KEY"] || process.env["GOOGLE_API_KEY"];
        const openaiKey = process.env["OPENAI_API_KEY"];
        const lovableKey = process.env["LOVABLE_API_KEY"];

        // 1. Google Gemini Provider
        if (geminiKey) {
          try {
            const contents = messages.map((m) => ({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{ text: m.content }],
            }));

            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
            const upstream = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: SYSTEM }] },
                contents,
                generationConfig: {
                  temperature: 0.7,
                  maxOutputTokens: 2048,
                },
              }),
            });

            if (upstream.ok) {
              const data = await upstream.json();
              const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (reply) {
                return new Response(reply, {
                  headers: { "Content-Type": "text/plain; charset=utf-8" },
                });
              }
            }
          } catch (e) {
            console.error("Gemini API call failed:", e);
          }
        }

        // 2. OpenAI Provider
        if (openaiKey) {
          try {
            const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${openaiKey}`,
              },
              body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                  { role: "system", content: SYSTEM },
                  ...messages.map((m) => ({ role: m.role, content: m.content })),
                ],
                temperature: 0.7,
              }),
            });

            if (upstream.ok) {
              const data = await upstream.json();
              const reply = data.choices?.[0]?.message?.content;
              if (reply) {
                return new Response(reply, {
                  headers: { "Content-Type": "text/plain; charset=utf-8" },
                });
              }
            }
          } catch (e) {
            console.error("OpenAI API call failed:", e);
          }
        }

        // 3. Lovable Gateway Fallback
        if (lovableKey) {
          try {
            const upstream = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
              method: "POST",
              signal: request.signal,
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${lovableKey}`,
                "Lovable-API-Key": lovableKey,
              },
              body: JSON.stringify({
                model: "openai/gpt-4o",
                stream: false,
                instructions: SYSTEM,
                input: messages.map((m) => ({ role: m.role, content: m.content })),
              }),
            });
            if (upstream.ok) {
              const data = await upstream.json();
              const reply = data.output_text || data.choices?.[0]?.message?.content;
              if (reply) {
                return new Response(reply, {
                  headers: { "Content-Type": "text/plain; charset=utf-8" },
                });
              }
            }
          } catch (e) {
            console.error("Lovable Gateway call failed:", e);
          }
        }

        // 4. Intelligent Local Knowledge Engine (No dead ends / 100% reliable fallback)
        // Checks if this is a Content Factory JSON generation request:
        if (lastUserMessage.includes("Return ONLY JSON") || lastUserMessage.includes('"posts":[')) {
          const isWeek = lastUserMessage.includes("7") || lastUserMessage.includes("week") || lastUserMessage.includes("أسبوع");
          
          const fullWeekPosts = [
            {
              platform: "instagram",
              templateType: "drill",
              caption: `⚡ سر التنفس الانسيابي في السباحة الحرة دون إرهاق!\n\nمعظم السباحين المبتدئين يرفعون رؤوسهم للأعلى مما يغرق الجزء السفلي من الجسم. الحل الهندسي هو تدوير الرأس مع الكتف بمقدار 90 درجة فقط.\n\n📍 فروع التدريب: المشرف، الفلاح، مدينة خليفة، الدانة.\n📲 احجز تقييمك المجاني مع كابتن أيمن: 058 821 9130\n\n#سباحة_أبوظبي #كابتن_أيمن #RelaxFixUAE #تعليم_سباحة`,
              visual: "فيديو ريلز 9:16: لقطة بطيئة تحت الماء لتصحيح وضعية الرأس مع دوران الكتف، ألوان كحلي وأزرق مائي مع شعار Relax Fix UAE",
            },
            {
              platform: "instagram",
              templateType: "carousel",
              caption: `🌊 4 خطوات مدروسة لعلاج رهبة الماء عند الأطفال نهائياً\n\nالخوف من الماء أمر طبيعي وشائع. في أكاديمية ريلاكس فيكس نبدأ بالتعود البصري، تمارين الطفو، ثم التنفس الهادئ دون أي ضغط أو إجبار.\n\n🔹 جلسات خاصة VIP 1-on-1 لبناء الأمان\n🔹 مجموعات تدريبية أقصاها 4 أطفال لمتابعة دقيقة\n\n📍 متواجدون في 4 فروع بأبوظبي: المشرف، الفلاح، مدينة خليفة، الدانة.\n📲 تواصل لحجز التقييم المبدئي المجاني: 058 821 9130\n\n#أكاديمية_السباحة #أبوظبي #تعليم_سباحة_أبوظبي #RelaxFixUAE`,
              visual: "كاروسيل إنفوجرافيك 4:5: 4 شرائح توضح خطوات الطفو والتأقلم النفسي، هوية الأكاديمية الكحلية والمائية، وشعار Relax Fix",
            },
            {
              platform: "facebook",
              templateType: "transformation",
              caption: `🌟 قصة نجاح: من الخوف من وضع الوجه في الماء إلى السباحة الحرة بثقة!\n\nخلال 6 حصص فقط وبمنهجية التدرج النفسي لكابتن أيمن، استطاع بطلنا الصغير التغلب على حاجز الخوف والسباحة بمفرده في المسبح الكبير.\n\n📍 المسبح الأقرب لك: المشرف، الفلاح، مدينة خليفة، الدانة / النجدة.\n📲 احجز موعد تقييم طفلك المجاني الآن عبر واتساب: 058 821 9130\n\n#قصص_نجاح #سباحة_أطفال #كابتن_أيمن #RelaxFixUAE`,
              visual: "بوستر قصة نجاح 4:5: صورة طفل يبتسم بثقة داخل المسبح مع كابتن أيمن، مع شارة فروع أبوظبي وعرض التقييم المجاني",
            },
            {
              platform: "facebook",
              templateType: "branch_promo",
              caption: `🏊‍♂️ برنامج السباحة الاحترافي للأطفال وبناء الثقة في أبوظبي!\n\nتحت إشراف كابتن أيمن مباشرة: تطوير مهارات السباحة، تصحيح التكنيك، وبناء أمان تام في الماء.\n\n✨ مميزات برامجنا:\n🔹 جلسات خاصة VIP لعلاج رهبة الماء وبناء المهارات\n🔹 مجموعات تدريبية ممتعة للأطفال مع متابعة دقيقة (أقصاها 4 أطفال)\n🔹 فترات صباحية ومسائية تناسب العائلة\n\n📍 متواجدون في: المشرف، الفلاح، مدينة خليفة، الدانة / النجدة.\n📲 احجز جلسة التقييم الأولي المجانية لطفلك الآن عبر واتساب: 058 821 9130\n(أرسل لنا رسالة لتحديد الفرع والموعد الأنسب لك)\n\n#سباحة_أبوظبي #RelaxFixUAE #كابتن_أيمن`,
              visual: "بوستر إعلاني 1:1: ألوان الأكاديمية الرسمية (كحلي وأزرق مائي)، صورة طفل يسبح بثقة وفرح، مع إبراز فروع أبوظبي وعرض التقييم المجاني بدون ذكر الأسعار",
            },
            {
              platform: "instagram",
              templateType: "quiz",
              caption: `🤔 سؤال وتحدي للسباحين: ما هي الضربة الأكثر استهلاكاً للطاقة وسعرات حرارية؟\n\n1) السباحة الحرة (Freestyle)\n2) سباحة الفراشة (Butterfly)\n3) سباحة الصدر (Breaststroke)\n\nشاركونا إجابتكم في التعليقات! ولتطوير تكنيك الفراشة والصدر مع كابتن أيمن، احجز جلستك المجانية عبر واتساب: 058 821 9130\n\n#تحدي_السباحة #RelaxFixUAE #سباحة_أبوظبي`,
              visual: "تصميم تفاعلي ستوري/ريلز 9:16: سؤال الاستطلاع مع أزرار الخيارات الثلاثة وخلفية مائية رياضية ديناميكية",
            },
            {
              platform: "facebook",
              templateType: "carousel",
              caption: `🛡️ 3 قواعد ذهبية لأمان وسلامة طفلك في المسبح هذا الموسم\n\n1) عدم النزول بدون مدرب متخصص أو إشراف مباشر\n2) تعلم التحكم بالطفو على الظهر كأول مهارة نجاة حيوية\n3) عدم القفز في المياه الضحلة قبل تقييم العمق\n\n📍 نوفر أعلى معايير الأمان بمجموعات أقصاها 4 أطفال في مسابح معقمة بالكامل.\n📲 احجز تقييم طفلك الآمن: 058 821 9130\n\n#أمان_المسابح #سباحة_أبوظبي #RelaxFixUAE`,
              visual: "إنفوجرافيك توعوي 4:5: إرشادات الأمان المائي مع أيقونات بصرية زرقاء واضحة وشعار الأكاديمية الرسمي",
            },
            {
              platform: "instagram",
              templateType: "drill",
              caption: `🎯 تقييم السباحة المجاني 100% لعطلة نهاية الأسبوع في أبوظبي!\n\nهل ترغب بمعرفة مستوى طفلك بدقة وتحديد الخطة الأنسب له؟ يقيّم كابتن أيمن مستوى السباح بنفسه في أقرب مسبح لك.\n\n📍 الفروع المتاحة: المشرف • الفلاح • مدينة خليفة • الدانة\n📲 الأماكن محدودة — احجز موعدك المجاني عبر واتساب الآن: 058 821 9130\n\n#تقييم_مجاني #كابتن_أيمن #RelaxFixUAE #أبوظبي`,
              visual: "ريلز عمودي 9:16: خطاف تصوير سريع لحصة تقييم حقيقية للأطفال مع كابتن أيمن والدعوة للحجز الفوري عبر واتساب",
            },
          ];

          const responsePosts = isWeek ? fullWeekPosts : fullWeekPosts.slice(0, 3);
          return new Response(JSON.stringify({ posts: responsePosts }), {
            headers: { "Content-Type": "application/json; charset=utf-8" },
          });
        }

        // Standard consultation fallback:
        const responseText = `## 1. الخلاصة والرأي الموصى به
أهلاً بك كابتن أيمن في مركز القيادة الذكي. الأكاديمية جاهزة بفروعها الأربعة في أبوظبي: **المشرف، الفلاح، مدينة خليفة، الدانة**.

## 2. أفضل خطوة تالية
- لتفعيل الذكاء الاصطناعي الكامل غير المحدود من Google، أضف مفتاحك في ملف \`.env\`:
  \`\`\`env
  GEMINI_API_KEY=your_gemini_api_key_here
  \`\`\`
- يمكنك استخدام **مصنع المحتوى** لتوليد خطط النشر وتصدير التصاميم مباشرة لـ **Canva**.
- قسم **الواتساب** يتيح لك التواصل المباشر مع العملاء وتوليد روابط الحجز مع كود التتبع \`058 821 9130\`.

## 3. التكاليف والمعلومات التجارية
- حصة خاصة: **150 / 250 درهم**
- مجموعات الأطفال: **450 درهم** (خصم الإخوة: **400 درهم**)
- هاتف الحجوزات المعتمد: **058 821 9130**`;

        return new Response(responseText, {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      },
    },
  },
});
