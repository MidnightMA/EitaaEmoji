/*
 * رازک — تنظیمات قابل ویرایش
 * همه‌ی چیزهایی که صاحب بازی ممکن است عوض کند همین‌جاست؛ برای این کارها
 * نیازی به باز کردن app.js نیست.
 *
 * نکته: هرجا «id» دیدی آن را بعد از انتشار عوض نکن؛ پیشرفت ذخیره‌شده‌ی
 * کاربرها با همین شناسه‌ها پیدا می‌شود.
 */
window.RAZAK_CONFIG = {
    version: '2.0.0',

    // شناسه‌ی باکت kvdb.io برای ذخیره‌ی ابری پیشرفت. تا وقتی مقدار واقعی
    // نگذاری، پیشرفت فقط روی همان گوشی ذخیره می‌شود.
    kvdbBucket: 'YOUR_BUCKET_ID_HERE',
    // پیشنهادهای کاربران هم در همین باکت (کلیدهای sug_*) ذخیره می‌شوند.
    suggestionsBucket: null, // null = همان kvdbBucket
    feedbackUrl: 'https://eitaa.com/ferstadeh',

    // تصاویر ایموجی. برای سرعت بیشتر در ایران، با tools/fetch-emojis.js
    // پوشه‌ی emoji/ را بساز و base را 'emoji/' بگذار.
    emoji: {
        base: 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.0.1/img/apple/64/'
    },

    // ---------- اقتصاد سکه ----------
    economy: {
        hintCost: 150,
        levelReward: 100,           // پیش‌فرض هر مرحله
        categoryReward: { proverbs: 250, movies: 100, countries: 100 },
        dailyChallengeReward: 500,
        dailyGift: { min: 100, max: 850 }
    },

    // دسته‌هایی که به‌جای حرف، کلمه‌به‌کلمه چیده می‌شوند
    wordModeCategories: ['proverbs'],
    // دسته‌هایی که بالای مرحله پیام «زبان محاوره» می‌گیرند
    colloquialCategories: { proverbs: 'ضرب‌المثل‌ها', idioms: 'اصطلاحات' },

    // ---------- عضویت اجباری هفتگی ----------
    // هر هفته یکی از کانال‌های فعال (به ترتیب) قبل از شروع بازی نشان داده
    // می‌شود. متن معرفی هر کانال در index.html (بلوک‌های data-channel-id) است.
    // startDate را بعد از اولین انتشار دست نزن؛ کل چرخش جابه‌جا می‌شود.
    joinGate: {
        startDate: '2025-01-06T00:00:00+03:30',
        weeksPerChannel: 1,
        channels: [
            { id: 'tech_nour', name: 'تِک‌نور', icon: '📢', username: 'Tech_nour', enabled: true },
            { id: 'rasa_meme', name: 'رسامیم', icon: '😂', username: 'Rasa_Meme', enabled: true },
            // جایگاه کانال همکار. name فقط اسم واقعی کانال باشد (کلمه‌ی «تبلیغ» نگذار).
            // لینک خصوصی joinchat را در مخزن عمومی کامیت نکن.
            { id: 'partner', name: 'PARTNER_CHANNEL_NAME_HERE', icon: '📌', username: 'joinchat/XXXXXXXX', enabled: false }
        ]
    },

    // ---------- کارت‌های «کانال‌های ما» در صفحه‌ی اصلی ----------
    // type: 'channel' یا 'ad'. theme: tech | gold | meme | default
    // icon: tech | poetry | meme | ad (وقتی عکس نباشد)
    // photo: مسیر عکس مربعی داخل پوشه‌ی prof/ (حدود ۳۰۰×۳۰۰). active: false = مخفی
    promos: [
        { type: 'ad', name: 'تبلیغات عمو', desc: 'برای رزرو تبلیغات پیام بدهید.', link: 'https://eitaa.com/tab_amoo', icon: 'ad', photo: 'prof/tab_ligh.webp', badge: 'Ads', cta: 'مشاهده' },
        { type: 'channel', name: 'تِک نور | 𝙏𝙚𝙘𝙝 𝙣𝙤𝙪𝙧', desc: 'اخبار هوش مصنوعی و آپدیت‌های بازی رو اینجا دنبال کن', link: 'https://eitaa.com/Tech_nour', icon: 'tech', photo: 'prof/tech_nour.webp', theme: 'tech' },
        { type: 'channel', name: 'Rasa Meme | رسامیم', desc: 'یسری میم جذاب و فان', link: 'https://eitaa.com/Rasa_Meme', icon: 'meme', photo: 'prof/rasa_meme.webp', theme: 'meme' },
        { type: 'channel', name: 'آشوب درون | Ashob daron', desc: 'آشوب درون؛ جایی برای حرف‌های ناگفته، احساسات عمیق و افکاری که در سکوت جریان دارن.', link: 'https://eitaa.com/Ashob_daron', icon: 'poetry', photo: 'prof/ashob_dar.webp', theme: 'gold' }
    ],
    promoInterval: 5000,

    // ---------- سکه با عضویت در کانال ----------
    // هر id فقط یک‌بار برای همیشه سکه می‌دهد.
    rewardChannels: [
        { id: 'tech_nour', name: 'تِک‌نور | 𝙏𝙚𝙘𝙝 𝙣𝙤𝙪𝙧', username: 'Tech_nour', reward: 1000 },
        { id: 'rasa_meme', name: 'رسامیم | Rasa Meme', username: 'Rasa_Meme', reward: 1000 },
        { id: 'ashob_daron', name: 'آشوب درون | Ashob daron', username: 'Ashob_daron', reward: 1000 },
        { id: 'tab_amoo', name: 'تبلیغات عمو', username: 'tab_amoo', reward: 2000 },
        { id: 'razak_plus', name: 'رازک | Razak', username: 'RazakPlus', reward: 1000 },
        { id: 'eitaayazd', name: 'ایتایز', username: 'eitaayazd', reward: 1000 },
        { id: 'all_channels', name: 'کانال‌های من!', username: 'all_Channels', reward: 1000 },
        { id: 'im_monk', name: 'راهب', username: 'im_monk', reward: 1000 },
        { id: 'amoo_rasool', name: 'عمو رسول', username: 'Amoo_rasool', reward: 1000 }
    ],
    // جایگاه چرخشی تبلیغ. با عوض شدن تبلیغ‌کننده slotVersion را یکی جلو ببر
    // (مثلاً v2 → v3) تا کاربرها دوباره بتوانند سکه بگیرند.
    rewardRotatingSlot: { id: 'chaharom', slotVersion: 'v2', name: 'هیچ', username: 'hich030', reward: 3000 },

    // ---------- عکس‌های آماده‌ی پروفایل ----------
    // پوشه‌ی عکس‌ها (حتماً با / تمام شود و دقیقاً هم‌نام پوشه‌ی مخزن باشد؛ حروف بزرگ/کوچک مهم است)
    avatarBase: 'carbar/',
    avatarPhotos: {
        Boy: [1, 2, 3, 4, 5, 6, 7, 10, 11, 12],
        Girl: [1, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    },

    // ---------- تبلیغات Adly (صفحه‌ی بازی) ----------
    adly: {
        enabled: true,
        script: 'https://myadino.ir/widget/adly-widget.js',
        apiKey: '2ce718bece973eefeede5b00822735aa',
        barnamk: 'razakplus_app',
        appRef: 31
    },

    // ---------- تازه‌های هر نسخه ----------
    // نسخه‌ی جدید را بالای لیست اضافه کن و version بالای همین فایل را هم عوض کن.
    changelog: [
        {
            version: '2.0.0',
            added: [
                'ظاهر کل بازی از نو طراحی شد',
                'اجرای بازی روی گوشی خیلی روان‌تر و سریع‌تر شد',
                'صفحه‌کلید بازی همیشه پایین صفحه در دسترسه',
                'دکمه‌ی پاک کردن آخرین حرف به صفحه‌کلید اضافه شد',
                'مدال جدید «اصطلاح‌دان»'
            ]
        },
        {
            version: '1.11.0',
            added: [
                'کانال جدید «آشوب درون» به بخش کانال‌های ما اضافه شد',
                'اصلاح بخش ایده‌های شما و اضافه شدن بخش پیشنهاد سوالات',
                'افزوده شدن بخش انتقادات و پیشنهادات در قسمت تنظیمات',
                'افزایش سوالات در بخش های مختلف بازی'
            ]
        },
        {
            version: '1.10.0',
            added: [
                'بخش جدید «🎁 جایزه» به تنظیمات اضافه شد',
                'امکان دریافت امتیاز روزانه رایگان',
                'امکان دریافت سکه با عضویت در کانال‌ها'
            ]
        },
        {
            version: '1.9.0',
            added: [
                'انتخاب عکس پروفایل از بین عکس‌های آماده 🖼️',
                'امکان تغییر نام نمایشی از صفحه‌ی پروفایل',
                'دسته‌بندی جدید «اصطلاحات»'
            ]
        },
        {
            version: '1.8.0',
            added: ['کارت‌های «کانال‌های ما» عکس پروفایل واقعی هر کانال را نشان می‌دهند']
        },
        {
            version: '1.7.0',
            added: [
                'آیکون‌های جدید پروفایل (پسر/دختر)',
                'سوال روزانه: بانک سوال‌ها بزرگ‌تر شد و دیگر تکراری نمی‌شود'
            ]
        },
        {
            version: '1.4.0',
            added: [
                'سوال روزانه: هر روز یک معمای تازه',
                'نمایش سطح سختی (آسان / متوسط / سخت) کنار هر مرحله'
            ]
        }
    ]
};
