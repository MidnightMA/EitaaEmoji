/**
 * iOS-Style Emoji Guessing Game
 * Engine: Pure Vanilla JS (ES6+)
 */

// ==========================================
// ⚠️ تنظیمات دیتابیس خارجی (حل مشکل سینک)
// آیدی باکت خود از kvdb.io را در اینجا قرار دهید
const KVDB_BUCKET_ID = "YOUR_BUCKET_ID_HERE"; 
// ==========================================

const PERSIAN_ALPHABET = "ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی";
const HINT_COST = 15;
// این دو تا هنوز برای کارت‌های «کانال‌های ما» در پایین صفحه استفاده می‌شوند.
const TECH_NOUR_LINK = 'https://eitaa.com/Tech_nour';
const AVAY_KHIYAL_LINK = 'https://eitaa.com/avay_khiyal';

/* =========================================
   عضویت اجباری چرخشی هفتگی (Weekly Mandatory Channel Rotation)
========================================= */
// ⚠️ محدودیت واقعی و مهم: این سایت کاملاً استاتیک است و هیچ ارتباطی با
// API عضویت واقعی ایتا ندارد (چنین APIای برای این پروژه در دسترس نیست، و
// حتی اگر بود، نیاز داشت ربات ما توی هرکدوم از این کانال‌ها ادمین/عضو باشه
// که نیستیم). پس این سیستم، دقیقاً مثل قبل، از روش «خوداظهاری» استفاده
// می‌کند: کاربر روی «عضویت» کلیک می‌کند، کانال باز می‌شود، و با زدن «بررسی
// عضویت» فقط تأیید می‌کند که عضو شده — نه اینکه واقعاً از سمت سرور چک شود.
// اگر تیک «عضویت شما تأیید شد» را نشان دهیم انگار واقعاً چک شده، این
// گمراه‌کننده است؛ به همین دلیل صادقانه همان الگوی قبلی حفظ شده.
//
// چیزی که این بخش واقعاً و به‌طور کامل پیاده می‌کند: چرخش هفتگیِ قطعی و
// بی‌نهایتِ «کدام کانال این هفته الزامی است» — این بخش صد‌درصد واقعی و
// قابل تست است چون فقط ریاضیِ تاریخ است، نیازی به بک‌اند ندارد.

// همه‌ی تنظیمات چرخش، از فایل‌های جداگانه‌ی هر کانال خوانده می‌شود — نه
// اینجا. برای تغییر دادن کانال‌ها، ترتیب، فعال/غیرفعال کردن، یا تاریخ
// شروع، به پوشه‌ی config/mandatory-channels/ برو (هر کانال یک فایل جدا،
// + یک index.js که ترتیب چرخش را مشخص می‌کند). این فایل‌ها باید در
// index.html قبل از app.js لود شوند.
//
// fallback زیر («اگر آن فایل‌ها به هر دلیلی لود نشده بودند») عمداً همان
// چهار کانال پیش‌فرض را دارد تا اگر یک نفر پوشه‌ی config/ را حذف کرد، بازی
// کاملاً نشکند.
const ROTATION_CONFIG = (typeof window !== 'undefined' && window.MANDATORY_CHANNELS_ROTATION)
    ? {
        startDate: window.MANDATORY_CHANNELS_ROTATION.startDate,
        weeksPerChannel: window.MANDATORY_CHANNELS_ROTATION.weeksPerChannel,
        channels: window.MANDATORY_CHANNELS_ROTATION.order.filter(Boolean)
      }
    : {
        startDate: '2025-01-06T00:00:00+03:30',
        weeksPerChannel: 1,
        channels: [
            { id: 'avay_khiyal', type: 'channel', name: 'آوای‌خیال', icon: '🕊️', username: 'avay_khiyal', enabled: true },
            { id: 'tech_nour', type: 'channel', name: 'تِک‌نور', icon: '📢', username: 'Tech_nour', enabled: true },
            { id: 'rasa_meme', type: 'channel', name: 'رسامیم', icon: '😂', username: 'Rasa_Meme', enabled: true },
            { id: 'partner', type: 'partner', name: 'کانال همکار', icon: '🤝', username: 'PARTNER_USERNAME_HERE', enabled: true }
        ]
      };
// این خط چیزی را عوض نمی‌کند؛ فقط برای دیباگ از کنسول مرورگر در دسترس
// می‌گذارد (چون const در سطح بالای فایل، به‌طور پیش‌فرض روی window در
// دسترس نیست).
window.ROTATION_CONFIG = ROTATION_CONFIG;

function getChannelUrl(channel) {
    return `https://eitaa.com/${channel.username}`;
}

// موتور اصلی چرخش. «now» عمداً قابل تزریق است (پیش‌فرض: همین لحظه) تا
// بشود بدون وابستگی به ساعت واقعی سیستم، تستش کرد.
// چون بر مبنای فاصله‌ی زمانی مطلق (میلی‌ثانیه) بین دو لحظه محاسبه می‌شود
// (نه روز تقویمی محلی)، این محاسبه کاملاً مستقل از منطقه‌زمانی مرورگر
// کاربر است؛ همه‌ی کاربران در سراسر دنیا در یک لحظه‌ی مشخص، دقیقاً همان
// نتیجه را می‌گیرند — دقیقاً همان چیزی که «برای همه یکسان باشد» نیاز دارد.
function getCurrentRotationInfo(now = new Date()) {
    const enabledChannels = ROTATION_CONFIG.channels.filter(c => c.enabled);
    if (enabledChannels.length === 0) return null; // اگر همه غیرفعال بودند، گیت را کلاً غیرفعال کن

    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const startMs = new Date(ROTATION_CONFIG.startDate).getTime();
    const nowMs = now.getTime();

    // اگر (به‌هر دلیلی، مثلاً ساعت اشتباه دستگاه) now قبل از startDate باشد،
    // در هفته‌ی صفر می‌مانیم، نه یک عدد منفی عجیب.
    const weekNumber = Math.max(0, Math.floor((nowMs - startMs) / msPerWeek));

    const cycleLength = ROTATION_CONFIG.weeksPerChannel * enabledChannels.length;
    const positionInCycle = weekNumber % cycleLength;
    const rotationIndex = Math.floor(positionInCycle / ROTATION_CONFIG.weeksPerChannel);

    const channel = enabledChannels[rotationIndex];
    const cycleStartWeek = weekNumber - (weekNumber % ROTATION_CONFIG.weeksPerChannel);
    const startsAt = new Date(startMs + cycleStartWeek * msPerWeek);
    const endsAt = new Date(startMs + (cycleStartWeek + ROTATION_CONFIG.weeksPerChannel) * msPerWeek);

    return { channel, rotationIndex, weekNumber, startsAt, endsAt };
}

function getCurrentMandatoryChannel(now) {
    const info = getCurrentRotationInfo(now);
    return info ? info.channel : null;
}

function getNextRotationChange(now) {
    const info = getCurrentRotationInfo(now);
    return info ? info.endsAt : null;
}

// کمک برای دیباگ از کنسول مرورگر (چون سرور/لاگ سرور برای این پروژه وجود
// ندارد، این معادل صادقانه‌اش سمت کلاینت است). توی کنسول بنویس: debugRotation()
window.debugRotation = function (customDate) {
    const info = getCurrentRotationInfo(customDate ? new Date(customDate) : undefined);
    if (!info) { console.log('[MandatoryJoin] هیچ کانال فعالی نیست (همه غیرفعال‌اند).'); return; }
    console.log('[MandatoryJoin] Week number:', info.weekNumber);
    console.log('[MandatoryJoin] Rotation index:', info.rotationIndex);
    console.log('[MandatoryJoin] Active channel:', info.channel.name, `(@${info.channel.username})`, info.channel.type === 'partner' ? '[کانال همکار]' : '');
    console.log('[MandatoryJoin] This period:', info.startsAt.toISOString(), '→', info.endsAt.toISOString());
    console.log('[MandatoryJoin] User confirmed this week already:',
        GameState.joinGate.confirmedChannelId === info.channel.id && GameState.joinGate.confirmedWeekNumber === info.weekNumber);
    return info;
};

const BASE_SCORE = 10;
const DAILY_BASE_SCORE = 50;
// فاصله‌ی چرخش خودکار کارت‌های «کانال‌های ما»
const PROMO_ROTATE_INTERVAL_MS = 4000;

// امتیاز پایه‌ی هر دسته؛ اگر دسته‌ای اینجا نبود از BASE_SCORE استفاده می‌شود.
// (درخواست: امتیاز ضرب‌المثل‌ها حداقل ۲۵ باشد)
const CATEGORY_SCORES = {
    proverbs: 25,
    movies: 10,
    countries: 10
};

// نسخه فعلی برنامه + لیست تغییرات هر نسخه. هر وقت آپدیت جدیدی منتشر کردی،
// یک آبجکت جدید بالای این آرایه اضافه کن و APP_VERSION را هم به‌روز کن؛
// خودکار یک بار برای کاربرهایی که نسخه قبلی را دیده‌اند، پنجره «تازه‌های این
// نسخه» نمایش داده می‌شود (و همیشه هم از تنظیمات قابل مشاهده است).
const APP_VERSION = '1.8.0';
const CHANGELOG_DB = [
    {
        version: '1.8.0',
        added: [
            'کارت‌های «کانال‌های ما» حالا عکس پروفایل واقعی هر کانال را نشان می‌دهند',
            'کارت تبلیغ هم عکس پروفایل تبلیغ‌کننده را نمایش می‌دهد',
            'باگ ها و عیوب گزارش شده برطرف شد',
            '.از این به بعد بازی روان تر اجرا می‌شود'
        ]
    },
    {
        version: '1.7.0',
        added: [
            'آیکون‌های جدید و شیک‌تر برای پروفایل (پسر/دختر) به‌جای ایموجی',
            'جای آماده برای انتخاب عکس پروفایل (به‌زودی فعال می‌شود)',
            'کارت‌های «کانال‌های ما» حالا آیکون‌های طراحی‌شده دارن، بزرگ‌تر و خواناتر از قبل',
            'سوال روزانه: بانک سوال‌ها بزرگ‌تر شد و دیگه سوال‌های تکراری پرسیده نمیشود'
        ]
    },
    {
        version: '1.6.0',
        added: [
            'روی سوال روزانه حالا مشخص می‌شود از کدوم دسته‌بندی است (مثلاً ضرب‌المثل، فیلم یا کشور)',
            'آیکون‌های اصلی برنامه بزرگ‌تر و خواناتر شدند'
        ],
        fixed: [
            'باز نشدن صفحه تنظیمات و صفحه پروفایل برطرف شد',
            'پیام «امتیاز کافی نیست» حالا به‌شکل یک نوتیفیکیشن ظریف نمایش داده می‌شود، نه یک پاپ‌آپ مرورگر',
            'نمای صفحه اصلی روی صفحه‌های بزرگ (دسکتاپ/تبلت) هم‌مرکز و منظم شد'
        ]
    },
    {
        version: '1.5.0',
        added: [
            'امتیاز سوال روزانه به ۵۰ امتیاز افزایش پیدا کرد',
            'ایموجی نمایش امتیاز جذاب‌تر شد',
            'آیکون‌های تازه و شیک‌تر جای ایموجی‌های قدیمی صفحه تنظیمات نشستن'
        ]
    },
    {
        version: '1.4.0',
        added: [
            'سوال روزانه: هر روز یک معمای تازه که درست بعد از نیمه‌شب عوض می‌شود',
            'قاب مخصوص تبلیغات ویژه با رنگ‌بندی جداگانه',
            'نمای کشویی کانال‌ها الان خودش هر ۵ ثانیه می‌چرخد',
            'نمایش سطح سختی (آسان / متوسط / سخت) کنار شماره هر مرحله',
            'صفحه تنظیمات بازطراحی شد'
        ],
        fixed: [
            'امتیاز دسته ضرب‌المثل‌ها به حداقل ۲۵ افزایش پیدا کرد',
            'مدال «ثروتمند» حالا بر اساس کل امتیازی که تا الان کسب کرده‌ای حساب می‌شود، نه موجودی فعلی',
            'مشکل نمایش و آنلاک‌شدن اشتباه مدال‌ها برطرف شد'
        ]
    },
    {
        version: '1.3.0',
        added: [
            'نمای کشویی معرفی کانال‌ها به صفحه اصلی اضافه شد'
        ],
        fixed: [
            'کلیک روی لینک کانال حالا داخل خود اپ ایتا باز می‌شود'
        ]
    }
];

let DB = { categories: [] };

const GameState = {
    user: { id: 'guest', first_name: 'کاربر مهمان', photo_url: null },
    globalScore: 0,
    totalEarned: 0, // مجموع کل امتیازی که تا الان کسب شده (برخلاف globalScore که با خرج راهنما کم می‌شود)
    progress: {},
    unlockedMedals: [],
    // gender: null | 'boy' | 'girl'
    // avatarId: رزرو شده برای انتخاب عکس پروفایل در آینده (فعلاً همیشه null)
    // displayName: نامی که کاربر خودش برای نمایش در بازی انتخاب کرده؛ اگر
    // null باشد، همان first_name ایتا نشان داده می‌شود (نگاه کن به
    // getDisplayName بالاتر همین فایل).
    settings: { sound: true, darkMode: false, gender: null, avatarId: null, displayName: null },
    dailyChallenge: { lastCompletedDate: null, completedCount: 0 },
    joinGate: { confirmedChannelId: null, confirmedWeekNumber: null },
    isDailyChallenge: false,
    activeCategory: null,
    activeLevelIndex: 0,
    startTime: 0,
    slots: [],
    keys: []
};
// برای دیباگ از کنسول مرورگر در دسترس است؛ چیزی در رفتار برنامه عوض نمی‌کند.
window.GameState = GameState;

const MEDALS_DB = [
    { id: 'first_blood', name: 'اولین قدم', icon: '🩴', desc: 'اولین مرحله را حل کن',
        check: (state) => getTotalCompleted(state) >= 1,
        progress: (state) => `${Math.min(getTotalCompleted(state), 1)}/1` },
    { id: 'proverbs_novice', name: 'ضرب‌المثل آموز', icon: '📜', desc: '50 ضرب‌المثل را حل کن',
        check: (state) => (state.progress['proverbs']?.length || 0) >= 5,
        progress: (state) => `${Math.min(state.progress['proverbs']?.length || 0, 50)}/5` },
    { id: 'movies_novice', name: 'فیلم‌باز', icon: '🎬', desc: '50 فیلم و سریال را حل کن',
        check: (state) => (state.progress['movies']?.length || 0) >= 5,
        progress: (state) => `${Math.min(state.progress['movies']?.length || 0, 50)}/5` },
    { id: 'countries_novice', name: 'جهانگرد', icon: '🌍', desc: '50 کشور را حل کن',
        check: (state) => (state.progress['countries']?.length || 0) >= 5,
        progress: (state) => `${Math.min(state.progress['countries']?.length || 0, 50)}/5` },
    // نکته: عمداً از totalEarned استفاده می‌کنیم نه globalScore، چون globalScore با
    // خرج کردن روی راهنما کم می‌شود و ممکن بود کاربری که واقعاً ۵۰۰ امتیاز کسب
    // کرده ولی خرج کرده، هیچ‌وقت این مدال را نگیرد.
    { id: 'rich', name: 'ثروتمند', icon: '💎', desc: '5000 امتیاز کسب کن',
        check: (state) => state.totalEarned >= 5000,
        progress: (state) => `${Math.min(state.totalEarned, 5000)}/5000` },
    { id: 'daily_fan', name: 'اهل چالش روزانه', icon: '🔥', desc: '50 چالش روزانه را حل کن',
        check: (state) => (state.dailyChallenge?.completedCount || 0) >= 5,
        progress: (state) => `${Math.min(state.dailyChallenge?.completedCount || 0, 5)}/5` },
    { id: 'all_categories', name: 'استاد بازی', icon: '👑', desc: 'همه دسته‌ها را صد‌درصد کامل کن',
        check: (state) => DB.categories.length > 0 && DB.categories.every(c => (state.progress[c.id]?.length || 0) >= c.levels.length),
        progress: (state) => {
            const total = DB.categories.reduce((s, c) => s + c.levels.length, 0);
            const done = DB.categories.reduce((s, c) => s + Math.min(state.progress[c.id]?.length || 0, c.levels.length), 0);
            return `${done}/${total}`;
        } }
];

// نمای کشویی «کانال‌های ما»: هر آبجکت یک کارت قابل سوایپ می‌سازد (هر
// PROMO_ROTATE_INTERVAL_MS خودش می‌چرخد). دو نوع کارت پشتیبانی می‌شود:
//   type: 'channel'  → کارت معرفی کانال (name, handle, desc, iconType, link, theme)
//   type: 'ad'       → کارت تبلیغ، ظاهر و رنگش عمداً متفاوته که کاربر سریع
//                      بفهمه تبلیغه (badge, desc, iconType, link, buttonText)
// برای افزودن کانال جدید، فقط یک آبجکت دیگر شبیه پایین به آرایه اضافه کن.
// theme برای کانال‌ها: 'tech' / 'poetry' / 'meme' (یا خالی برای آبی پیش‌فرض).
// iconType باید یکی از کلیدهای PROMO_ICONS باشد (چند خط پایین‌تر همین فایل)؛
// این آیکون فقط وقتی نمایش داده می‌شود که عکس پروفایل واقعی موجود نباشد.
// photoKey → کلید مربوطه در channel-photos.js (فایل جدا برای عکس‌های
// پروفایل)؛ اگر آنجا عکسی برای این کلید ثبت شده باشد همان نمایش داده
// می‌شود، وگرنه آیکون SVG (iconType) جایگزینش می‌شود.
const CHANNEL_PROMOS = [
    {
        type: 'channel',
        name: 'آواي‌خـــــــــیال',
        handle: '@avay_khiyal',
        desc: 'کانال شعر؛ اگه دلت یه گوشه‌ی آروم برای خوندن شعر می‌خواد، بیا اینجا',
        iconType: 'poetry',
        photoKey: 'avay_khiyal',
        link: AVAY_KHIYAL_LINK,
        theme: 'poetry'
    },
    {
        type: 'ad',
        name: 'تبلیغات عمو',
        badge: 'Ads',
        iconType: 'ad',
        photoKey: '@tab_amoo',
        desc: 'برای رزرو کلیک کنید و به مدیر پیام بدهید!',
        link: 'https://eitaa.com/tab_amoo',
        buttonText: 'مشاهده'
        // برای ثبت تبلیغ جدید، فقط همین چند خط را عوض کن (و در صورت وجود
        // عکس تبلیغ‌کننده، کلید photoKey را در channel-photos.js هم پر کن).
        // برای مخفی کردن موقت این کارت، active: false اضافه کن.
    },
    {
        type: 'channel',
        name: 'تِک نور | 𝙏𝙚𝙘𝙝 𝙣𝙤𝙪𝙧',
        handle: '@Tech_nour',
        desc: 'اخبار هوش مصنوعی و آپدیت‌های بازی رو اینجا دنبال کن',
        iconType: 'tech',
        photoKey: 'tech_nour',
        link: TECH_NOUR_LINK,
        theme: 'tech'
    },
    {
        type: 'channel',
        name: 'Rasa Meme | رسامیم',
        handle: '@Rasa_Meme',
        desc: 'یسری میم چرت و پرت',
        iconType: 'meme',
        photoKey: 'rasa_meme',
        link: 'https://eitaa.com/Rasa_Meme',
        theme: 'meme'
    }
];

// آیکون‌های خط-محور (line icons) به سبک بقیه‌ی آیکون‌های SVG همین اپ (به‌جای
// ایموجی ساده)، برای هر «نوع» کارت کانال. عمداً فقط از شکل‌های هندسی ساده
// (دایره/مستطیل/خط) ساخته شده‌اند تا روی هر پس‌زمینه‌ای تمیز و شارپ دیده بشن.
const PROMO_ICONS = {
    tech: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="18" y="55" width="14" height="27" rx="4" fill="#fff"/>
        <rect x="43" y="38" width="14" height="44" rx="4" fill="#fff"/>
        <rect x="68" y="20" width="14" height="62" rx="4" fill="#fff" fill-opacity="0.9"/>
    </svg>`,
    poetry: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M50 28V76" stroke="#fff" stroke-width="6" stroke-linecap="round"/>
        <path d="M50 32C37 24 24 25 15 30V72C24 67 37 66 50 74" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path d="M50 32C63 24 76 25 85 30V72C76 67 63 66 50 74" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>`,
    meme: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="50" cy="50" r="34" fill="#fff"/>
        <circle cx="38" cy="45" r="5.5" fill="#3a2a55"/>
        <circle cx="62" cy="45" r="5.5" fill="#3a2a55"/>
        <path d="M32 58C38 72 62 72 68 58" stroke="#3a2a55" stroke-width="6" stroke-linecap="round" fill="none"/>
    </svg>`,
    ad: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="50" cy="50" r="32" stroke="#fff" stroke-width="7"/>
        <circle cx="50" cy="50" r="18" stroke="#fff" stroke-width="7"/>
        <circle cx="50" cy="50" r="5" fill="#fff"/>
    </svg>`
};

function getPromoIconMarkup(iconType) {
    return PROMO_ICONS[iconType] || PROMO_ICONS.tech;
}

// عکس پروفایل کانال/تبلیغ‌کننده را داخل container (همان .channel-promo-icon)
// می‌گذارد. عکس‌ها در فایل جداگانه‌ی channel-photos.js (متغیر CHANNEL_PHOTOS)
// نگهداری می‌شوند تا تغییرشان نیازی به دست‌زدن به این فایل نداشته باشد.
// اگر برای این photoKey عکسی ثبت نشده باشد، یا لود عکس با خطا مواجه شود
// (لینک خراب/حذف‌شده)، به‌طور خودکار به همان آیکون SVG طراحی‌شده (iconType)
// برمی‌گردد؛ یعنی کاربر هیچ‌وقت جای خالی یا آیکون شکسته نمی‌بیند.
function populateChannelIcon(container, photoKey, iconType) {
    const entry = typeof CHANNEL_PHOTOS !== 'undefined' && photoKey ? CHANNEL_PHOTOS[photoKey] : null;
    const photoUrl = entry && entry.photo;
    if (!photoUrl) {
        container.innerHTML = getPromoIconMarkup(iconType);
        return;
    }
    const img = document.createElement('img');
    img.src = photoUrl;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => {
        container.innerHTML = getPromoIconMarkup(iconType);
    }, { once: true });
    container.innerHTML = '';
    container.appendChild(img);
}

function getTotalCompleted(state) {
    return Object.values(state.progress).reduce((sum, arr) => sum + arr.length, 0);
}

// --- نام نمایشی قابل‌ویرایش کاربر ---
const DISPLAY_NAME_MAX_LENGTH = 20;

// همه‌جای بازی که اسم کاربر نشان داده می‌شود (هدر صفحه اصلی، صفحه پروفایل)
// باید از همین تابع استفاده کند، نه مستقیم از GameState.user.first_name —
// اینطوری اگر کاربر اسم دلخواه انتخاب کرده باشد همه‌جا یکسان به‌روز است.
function getDisplayName() {
    return GameState.settings.displayName || GameState.user.first_name || 'کاربر مهمان';
}

// اعتبارسنجی/پاک‌سازی نام ورودی کاربر. کاراکتر خاصی محدود نشده (فارسی،
// انگلیسی، عدد، ایموجی همه مجازند)، فقط:
//   ۱. فاصله‌های اضافه‌ی ابتدا/انتها حذف می‌شود
//   ۲. کاراکترهای کنترلی نامرئی (که می‌توانند چیدمان را به‌هم بریزند) حذف می‌شوند
//   ۳. طول به DISPLAY_NAME_MAX_LENGTH محدود می‌شود
// خروجی یا رشته‌ی پاک‌شده‌ی معتبر است، یا null (یعنی نامعتبر/خالی). چون همه‌جا
// با .textContent (نه innerHTML) رندر می‌شود، تزریق HTML/اسکریپت از همان
// مسیر رندر هم به‌طور خودکار مسدود است؛ این تابع فقط چیدمان/طول را کنترل
// می‌کند، نه امنیت رندر را (که جای دیگری قبلاً تضمین شده).
function sanitizeDisplayName(raw) {
    if (typeof raw !== 'string') return null;
    let cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, '');
    cleaned = cleaned.trim().replace(/\s+/g, ' ');
    if (cleaned.length === 0) return null;
    // برش بر مبنای کدپوینت (نه UTF-16 code unit) تا وسط یک ایموجی چندبخشی برش نخورد
    const codepoints = Array.from(cleaned);
    if (codepoints.length > DISPLAY_NAME_MAX_LENGTH) {
        cleaned = codepoints.slice(0, DISPLAY_NAME_MAX_LENGTH).join('');
    }
    return cleaned;
}

/* =========================================
   1. Cloud Storage Sync (KVDB)
========================================= */
const StorageManager = {
    getKey: () => `eitaa_game_${GameState.user.id}`,
    save: async function() {
        const payload = JSON.stringify({
            globalScore: GameState.globalScore,
            totalEarned: GameState.totalEarned,
            progress: GameState.progress,
            unlockedMedals: GameState.unlockedMedals,
            settings: GameState.settings,
            dailyChallenge: GameState.dailyChallenge,
            joinGate: GameState.joinGate
        });
        localStorage.setItem(this.getKey(), payload);
        if (GameState.user.id !== 'guest' && KVDB_BUCKET_ID !== "YOUR_BUCKET_ID_HERE") {
            try { await fetch(`https://kvdb.io/${KVDB_BUCKET_ID}/${GameState.user.id}`, { method: 'PUT', body: payload }); } catch (e) {}
        }
    },
    load: async function(callback) {
        let finalData = null;
        if (GameState.user.id !== 'guest' && KVDB_BUCKET_ID !== "YOUR_BUCKET_ID_HERE") {
            try {
                const response = await fetch(`https://kvdb.io/${KVDB_BUCKET_ID}/${GameState.user.id}`);
                if (response.ok) finalData = await response.text();
            } catch (e) {}
        }
        if (!finalData) finalData = localStorage.getItem(this.getKey());
        if (finalData) {
            try {
                const data = JSON.parse(finalData);
                GameState.globalScore = data.globalScore || 0;
                // برای کسانی که از قبل پیشرفت داشته‌اند و totalEarned ذخیره‌شده ندارند،
                // globalScore فعلی را به‌عنوان تخمین اولیه در نظر می‌گیریم تا مدال «ثروتمند»
                // ناگهان قفل نشود.
                GameState.totalEarned = typeof data.totalEarned === 'number' ? data.totalEarned : (data.globalScore || 0);
                GameState.progress = data.progress || {};
                GameState.unlockedMedals = data.unlockedMedals || [];
                GameState.settings = { ...GameState.settings, ...(data.settings || {}) };
                GameState.dailyChallenge = data.dailyChallenge || { lastCompletedDate: null, completedCount: 0 };
                GameState.joinGate = data.joinGate || { confirmedChannelId: null, confirmedWeekNumber: null };
            } catch(e) {}
        }
        callback();
    }
};

/* =========================================
   2. Super Fast Apple Emoji Engine
========================================= */
const emojiSegmentCache = {}; // کش گرافیم‌ها برای سرعت رندر دفعات بعد
const EMOJI_CDN_BASE = 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.0.1/img/apple/64/';

// استخراج تمام کدپوینت‌های یک گرافیم (نه فقط کدپوینت اول!) با پدینگ ۴ رقمی هگز.
// نکته مهم: ایموجی‌های ترکیبی مثل 👂🏻 (گوش + رنگ پوست)، 🧙‍♂️ (ZWJ)
// یا 1️⃣ (کیکپ) از چند کدپوینت تشکیل شده‌اند؛ اگر فقط کدپوینت اول گرفته شود
// (مثل نسخه قبلی)، بخش دوم ایموجی (رنگ پوست، جنسیت، کیکپ و ...) گم می‌شود.
function getPaddedHexCodes(segment) {
    let hexCodes = [];
    for (let i = 0; i < segment.length; i++) {
        let code = segment.codePointAt(i);
        if (code > 0xFFFF) i++; // سوروگیت پایین را رد کن
        hexCodes.push(code.toString(16).padStart(4, '0'));
    }
    return hexCodes;
}

// شکستن متن به گرافیم‌ها (کاراکترهای مستقل بصری). نتیجه کش می‌شود چون
// هر مرحله بارها رندر می‌شود ولی محاسبه‌ی گرافیم‌ها فقط لازم است یک‌بار انجام شود.
function getGraphemeSegments(text) {
    if (emojiSegmentCache[text]) return emojiSegmentCache[text];
    let segments = [];
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
        for (const { segment } of segmenter.segment(text)) segments.push(segment);
    } else {
        // حالت fallback برای مرورگرهای قدیمی: دنباله‌های ZWJ/رنگ‌پوست/کیکپ را هم می‌گیرد
        const emojiRegex = /([\u{1f300}-\u{1f9ff}\u{2600}-\u{26ff}\u{2700}-\u{27bf}\u{2190}-\u{21ff}\u{2300}-\u{23ff}0-9#*](?:[\u{fe0f}\u{200d}\u{1f3fb}-\u{1f3ff}\u{20e3}]|[\u{1f300}-\u{1f9ff}])*)/gu;
        let lastIndex = 0;
        for (const m of text.matchAll(emojiRegex)) {
            if (m.index > lastIndex) segments.push(text.slice(lastIndex, m.index));
            segments.push(m[0]);
            lastIndex = m.index + m[0].length;
        }
        if (lastIndex < text.length) segments.push(text.slice(lastIndex));
    }
    emojiSegmentCache[text] = segments;
    return segments;
}

// اگر عکس دقیق پیدا نشد، ابتدا نسخه‌ی جایگزین را امتحان کن،
// و در نهایت خود ایموجی را به صورت متن سیستم نشان بده (به جای آیکون شکسته).
// این تابع با addEventListener وصل می‌شود، نه با attribute «onerror=""»، چون
// خیلی از وب‌ویوهای اپ‌های پیام‌رسان (مثل ایتا) به‌خاطر سیاست امنیتی CSP
// اجرای event handlerهای درون-خطی (inline) را بی‌صدا مسدود می‌کنند و باعث
// می‌شدند ایموجی‌هایی مثل ☁️ برای همیشه به شکل آیکون شکسته بمانند.
function handleEmojiImgError(e) {
    const img = e.target;
    if (img.dataset.stage === 'fallback') {
        const span = document.createElement('span');
        span.textContent = img.dataset.native;
        span.className = 'apple-emoji apple-emoji-native';
        img.replaceWith(span);
        return;
    }
    img.dataset.stage = 'fallback';
    img.src = img.dataset.fallback;
}

function buildEmojiImg(segment) {
    const hex = getPaddedHexCodes(segment);
    // برای اکثریت ایموجی‌های این بازی (نماد ساده + FE0F مثل ☁️، ⛰️، 🌧️)
    // نام فایل CDN بدون fe0f است، پس همان را اول امتحان می‌کنیم.
    // فقط دنباله‌های خاص مثل کیکپ‌ها (0031-fe0f-20e3.png) fe0f را نگه می‌دارند
    // که به عنوان حالت دوم امتحان می‌شود.
    const withoutFe0f = hex.filter(c => c !== 'fe0f').join('-');
    const withFe0f = hex.join('-');

    const img = document.createElement('img');
    img.src = `${EMOJI_CDN_BASE}${withoutFe0f}.png`;
    img.dataset.fallback = `${EMOJI_CDN_BASE}${withFe0f}.png`;
    img.dataset.native = segment;
    img.alt = segment;
    // این تصاویر همیشه همون چیزی هستن که کاربر باید فوراً ببینه (خود معمای
    // بازی)، پس lazy-load نباید باشن؛ برعکس، اولویت بالا می‌گیرن تا زودتر بیان.
    img.decoding = 'async';
    img.fetchPriority = 'high';
    img.className = 'apple-emoji';
    img.addEventListener('error', handleEmojiImgError);
    return img;
}

// container: عنصر DOM که ایموجی‌ها داخلش رندر می‌شوند. text: رشته‌ی ایموجی مرحله.
function renderAppleEmojis(container, text) {
    container.innerHTML = '';
    const frag = document.createDocumentFragment();
    getGraphemeSegments(text).forEach(segment => {
        if (segment.trim() === '') {
            frag.appendChild(document.createTextNode(segment));
            return;
        }
        frag.appendChild(buildEmojiImg(segment));
    });
    container.appendChild(frag);
}

// بعد از اینکه صفحه اصلی نمایش داده شد، در پس‌زمینه (بدون کند کردن چیزی)
// تصاویر ایموجی چند مرحله اول هر دسته را در کش مرورگر گرم می‌کنیم؛ همین باعث
// می‌شود اولین باری که کاربر وارد یک دسته می‌شود، عکس‌ها فوراً بیایند نه اینکه
// آن لحظه منتظر دانلود از CDN بماند.
function preloadUpcomingEmojis() {
    if (!DB || !DB.categories) return;
    const PRELOAD_LEVELS_PER_CATEGORY = 3;
    DB.categories.forEach(cat => {
        cat.levels.slice(0, PRELOAD_LEVELS_PER_CATEGORY).forEach(lvl => {
            getGraphemeSegments(lvl.emoji).forEach(segment => {
                if (segment.trim() === '') return;
                const hex = getPaddedHexCodes(segment).filter(c => c !== 'fe0f').join('-');
                const img = new Image();
                img.src = `${EMOJI_CDN_BASE}${hex}.png`;
            });
        });
    });
}


/* =========================================
   3. Audio Engine
========================================= */
const AudioEngine = (function() {
    let audioCtx = null;
    function init() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); }
    function playTone(freq, type, dur, vol = 0.05) {
        if (!GameState.settings.sound) return;
        init();
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.type = type; osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + dur);
    }
    return {
        tap: () => playTone(600, 'sine', 0.1, 0.02), pop: () => playTone(400, 'triangle', 0.1, 0.03), error: () => playTone(150, 'sawtooth', 0.3, 0.05),
        success: () => { playTone(400, 'sine', 0.1); setTimeout(() => playTone(600, 'sine', 0.15), 100); }, medal: () => { playTone(500, 'sine', 0.1); setTimeout(() => playTone(800, 'sine', 0.3), 100); }
    };
})();

/* =========================================
   4. UI Management & Eitaa Navigation
========================================= */
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    window.scrollTo(0, 0);
}

function applyTheme() {
    document.body.setAttribute('data-theme', GameState.settings.darkMode ? 'dark' : 'light');
    if (window.Eitaa && window.Eitaa.WebApp && window.Eitaa.WebApp.setHeaderColor) {
        window.Eitaa.WebApp.setHeaderColor(GameState.settings.darkMode ? '#000000' : '#f2f2f7');
    }
}

// دکمه بازگشت اصلی
function goBackToHome() {
    AudioEngine.tap(); 
    renderHome(); 
    showScreen('screen-home');
    
    // مخفی کردن دکمه بازگشت سیستمی ایتا
    if (window.Eitaa && window.Eitaa.WebApp && window.Eitaa.WebApp.BackButton) {
        window.Eitaa.WebApp.BackButton.hide();
    }
}

// وب‌ویوی داخل اپ ایتا معمولاً ناوبری مستقیم <a> یا window.open را مسدود
// می‌کند، پس باید از متدهای رسمی خود SDK استفاده کنیم:
//   1) openEitaaLink → مخصوص لینک‌های خود ایتا (eitaa.com/...)، دقیقاً مثل
//      openTelegramLink در تلگرام؛ کاربر را بدون خروج از اپ مستقیم می‌برد
//      روی صفحه کانال برای جوین شدن.
//   2) openLink → بازکننده عمومی لینک (fallback، وقتی متد اول در دسترس نبود).
//   3) window.open → فقط برای زمانی که خارج از اپ ایتا (مرورگر معمولی) تست
//      می‌کنیم و اصلاً SDK لود نشده.
function openExternalLink(url) {
    const wa = window.Eitaa && window.Eitaa.WebApp;
    if (wa && typeof wa.openEitaaLink === 'function') {
        wa.openEitaaLink(url);
    } else if (wa && typeof wa.openLink === 'function') {
        wa.openLink(url);
    } else {
        window.open(url, '_blank', 'noopener');
    }
}

// --- آیکون‌های آواتار پروفایل (به‌جای ایموجی 👤/👦/👧) ---
// طراحی عمداً ساده و هندسی است (فقط دایره/مستطیل/دو منحنی Q برای هر مدل مو)
// تا سبک‌وزن بماند و روی هر پس‌زمینه‌ای شارپ دیده بشه. اگر بعداً خواستی
// آواتارهای آماده/عکس دلخواه اضافه کنی (طبق درخواستی که دادی)، همینجا یک
// کلید تازه به AVATAR_ICONS اضافه کن و در GameState.settings.avatarId مقدار
// همون کلید را ذخیره کن؛ applyAvatarVisual خودش کارهای بعدی (نمایش/پس‌زمینه)
// را انجام می‌دهد.
const AVATAR_SHOULDERS = `<path d="M14 94 L24 64 L76 64 L86 94 Z" fill="#fff" fill-opacity="0.95"/><circle cx="50" cy="36" r="19" fill="#fff" fill-opacity="0.95"/>`;
const AVATAR_TOP_HAIR = `<path d="M28 26 Q50 2 72 26 L72 34 Q50 14 28 34 Z" fill="#fff" fill-opacity="0.85"/>`;
const AVATAR_ICONS = {
    neutral: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${AVATAR_SHOULDERS}</svg>`,
    boy: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${AVATAR_SHOULDERS}${AVATAR_TOP_HAIR}</svg>`,
    girl: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="19" y="28" width="13" height="42" rx="6.5" fill="#fff" fill-opacity="0.85"/>
        <rect x="68" y="28" width="13" height="42" rx="6.5" fill="#fff" fill-opacity="0.85"/>
        ${AVATAR_SHOULDERS}${AVATAR_TOP_HAIR}
    </svg>`
};

// عنصر آواتار (هدر صفحه اصلی یا صفحه پروفایل) را بر اساس عکس ایتا (اگر بود)
// یا آیکون جنسیت انتخابی کاربر پر می‌کند، و کلاس گرادیان پس‌زمینه متناسب با
// جنسیت را ست می‌کند (آبی برای پسر، صورتی برای دختر، آبی خنثی پیش‌فرض).
function applyAvatarVisual(avatarEl, gender) {
    avatarEl.classList.remove('gender-boy', 'gender-girl');
    if (gender === 'boy') avatarEl.classList.add('gender-boy');
    if (gender === 'girl') avatarEl.classList.add('gender-girl');

    if (GameState.user.photo_url) {
        avatarEl.innerHTML = '';
        const img = document.createElement('img');
        img.src = GameState.user.photo_url;
        img.alt = 'Profile';
        img.addEventListener('error', () => {
            avatarEl.innerHTML = AVATAR_ICONS[gender] || AVATAR_ICONS.neutral;
            avatarEl.style.background = '';
        });
        avatarEl.appendChild(img);
        avatarEl.style.background = 'transparent';
    } else {
        avatarEl.innerHTML = AVATAR_ICONS[gender] || AVATAR_ICONS.neutral;
        avatarEl.style.background = '';
    }
}

function renderHome() {
    document.getElementById('home-total-score').textContent = GameState.globalScore;
    document.getElementById('user-name').textContent = getDisplayName();

    applyAvatarVisual(document.getElementById('user-avatar'), GameState.settings.gender);

    const medalsContainer = document.getElementById('medals-container');
    medalsContainer.innerHTML = '';
    MEDALS_DB.forEach(medal => {
        const isUnlocked = GameState.unlockedMedals.includes(medal.id);
        const div = document.createElement('div');
        div.className = `medal-card ${isUnlocked ? 'unlocked' : ''}`;
        const progressHtml = (!isUnlocked && medal.progress) ? `<span class="medal-progress">${medal.progress(GameState)}</span>` : '';
        div.innerHTML = `<span class="medal-icon">${medal.icon}</span><span class="medal-name">${medal.name}</span>${progressHtml}`;
        medalsContainer.appendChild(div);
    });
    document.getElementById('medals-count').textContent = `${GameState.unlockedMedals.length}/${MEDALS_DB.length}`;

    const catContainer = document.getElementById('categories-container');
    catContainer.innerHTML = '';
    DB.categories.forEach(cat => {
        const completed = GameState.progress[cat.id]?.length || 0;
        const total = cat.levels.length;
        const perc = total > 0 ? (completed / total) * 100 : 0;
        const div = document.createElement('div');
        // دسته‌بندی‌ای که هنوز هیچ مرحله‌ای ندارد (total === 0) به‌طور خودکار
        // به‌شکل «قفل/به‌زودی» نمایش داده می‌شود و قابل‌کلیک نیست — این قانون
        // عمومی است، یعنی هر دسته‌بندی جدیدی که levels آن هنوز خالی است
        // (مثل «اصطلاحات» یا «ایده‌های شما» تا وقتی که مرحله‌ای برایش اضافه
        // نشده) خودکار همین رفتار را می‌گیرد، بدون نیاز به هیچ کد اضافه‌ای؛
        // به‌محض این‌که در data.json حداقل یک مرحله به levels آن اضافه شود،
        // خودش قابل‌بازی می‌شود.
        const isLocked = total === 0;
        div.className = `category-card ${isLocked ? 'locked' : (completed === total ? 'completed' : '')}`;
        div.innerHTML = `
            <div class="cat-icon">${cat.icon}</div>
            <div class="cat-info">
                <h3 class="cat-title">${cat.name}</h3>
                <div class="cat-stats">${isLocked ? 'به‌زودی...' : `${completed} از ${total} مرحله`}</div>
                ${isLocked ? '' : `<div class="progress-track"><div class="progress-fill" style="width: ${perc}%"></div></div>`}
            </div>`;
        if (!isLocked) {
            div.addEventListener('click', () => { AudioEngine.tap(); requireChannelJoin(() => startCategory(cat)); });
        }
        catContainer.appendChild(div);
    });

    renderDailyChallengeCard();
    renderChannelPromos();
    renderSuggestionsSection();
}

// بخش «پیشنهادات شما 🫂» — جایگزین کارت قبلی «به‌زودی...» است. تمام متن‌ها
// (عنوان، توضیح، متن الگو، برچسب دکمه‌ها، لینک ایتا) از DB.suggestions
// خوانده می‌شود (بخش suggestions در data.json)، نه از این فایل — برای
// تغییرشان فقط data.json را ویرایش کن.
function renderSuggestionsSection() {
    const s = DB.suggestions;
    const section = document.getElementById('suggestions-section');
    if (!section || !s) return;

    document.getElementById('suggestions-title').textContent = s.title || 'پیشنهادات شما 🫂';
    document.getElementById('suggestions-intro').textContent = s.intro || '';
    document.getElementById('suggestions-template').textContent = s.template || '';

    const copyBtn = document.getElementById('btn-copy-suggestion-template');
    copyBtn.textContent = s.copyButtonText || '📋 کپی متن';
    copyBtn.onclick = () => copySuggestionTemplate(s.template || '');

    const contactBtn = document.getElementById('btn-send-suggestion');
    contactBtn.textContent = s.contactButtonText || 'ارسال پیشنهاد';
    contactBtn.onclick = () => {
        AudioEngine.tap();
        openExternalLink(s.contactUrl || 'https://eitaa.com/ferstadeh');
    };
}

// کپی متن الگو در کلیپ‌بورد. روش اصلی navigator.clipboard (مرورگرهای مدرن،
// هم دسکتاپ هم موبایل روی HTTPS)؛ اگر در دسترس نبود (مثلاً وب‌ویوی
// قدیمی‌تر)، به روش قدیمی execCommand('copy') برمی‌گردیم تا کپی همچنان کار
// کند. در هر دو حالت با یک toast به کاربر خبر می‌دهیم.
async function copySuggestionTemplate(text) {
    AudioEngine.tap();
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
        } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            document.execCommand('copy');
            ta.remove();
        }
        showToast('📋', 'متن کپی شد!');
    } catch (e) {
        showToast('⚠️', 'کپی نشد، لطفاً متن را دستی کپی کنید.');
    }
}

let promoRotateInterval = null;

// صفحه پروفایل: آواتار و نام کاربر را از GameState می‌خواند و کارت جنسیت
// انتخاب‌شده را هایلایت می‌کند.
function renderProfile() {
    document.getElementById('profile-name').textContent = getDisplayName();
    document.getElementById('profile-current-name').textContent = getDisplayName();
    const gender = GameState.settings.gender;

    applyAvatarVisual(document.getElementById('profile-avatar'), gender);

    document.querySelectorAll('.gender-option').forEach(el => {
        el.classList.toggle('selected', el.dataset.gender === gender);
    });
}

// نمای کشویی تبلیغ کانال‌ها: از روی آرایه CHANNEL_PROMOS کارت می‌سازد،
// امکان سوایپ افقی می‌دهد، نقطه‌های پایین را با اسکرول همگام می‌کند و هر ۵
// ثانیه خودش به کانال بعدی می‌چرخد (با تعامل دستی کاربر موقتاً متوقف می‌شود).
function renderChannelPromos() {
    const container = document.getElementById('channel-promo-container');
    const dotsContainer = document.getElementById('channel-promo-dots');
    if (!container || !dotsContainer) return;

    clearInterval(promoRotateInterval);
    container.innerHTML = '';
    dotsContainer.innerHTML = '';

    // فقط کارت‌هایی که active:false نشده‌اند رندر می‌شوند؛ همه محاسبات بعدی
    // (نقطه‌ها، چرخش خودکار) هم باید بر همین لیست فیلترشده باشد، نه آرایه کامل،
    // وگرنه با مخفی کردن یک تبلیغ تمام‌شده، شمارش‌ها به‌هم می‌ریزد.
    const visiblePromos = CHANNEL_PROMOS.filter(p => p.active !== false);

    visiblePromos.forEach((promo, index) => {
        const card = document.createElement('a');
        card.href = promo.link;
        card.target = '_blank';
        card.rel = 'noopener noreferrer';

        if (promo.type === 'ad') {
            // کارت تبلیغ: عمداً ظاهر متفاوتی دارد (رنگ + نوار «Ads») تا کاربر
            // سریع بفهمد این یک تبلیغه، نه یک کانال خودمان.
            card.className = 'channel-promo-card promo-type-ad';
            card.innerHTML = `
                <span class="ad-ribbon">${promo.badge || 'Ads'}</span>
                <div class="channel-promo-icon"></div>
                <div class="channel-promo-info">
                    <p class="channel-promo-desc ad-desc">${promo.desc}</p>
                </div>
                <div class="ad-cta-btn">${promo.buttonText || 'مشاهده'}</div>`;
        } else {
            card.className = `channel-promo-card theme-${promo.theme || 'default'}`;
            card.innerHTML = `
                <div class="channel-promo-icon"></div>
                <div class="channel-promo-info">
                    <h3 class="channel-promo-title">${promo.name}</h3>
                    <span class="channel-promo-handle">${promo.handle}</span>
                    <p class="channel-promo-desc">${promo.desc}</p>
                </div>
                <div class="channel-promo-arrow">‹</div>`;
        }
        populateChannelIcon(card.querySelector('.channel-promo-icon'), promo.photoKey, promo.iconType);

        card.addEventListener('click', (e) => {
            AudioEngine.tap();
            const wa = window.Eitaa && window.Eitaa.WebApp;
            if (wa && (typeof wa.openEitaaLink === 'function' || typeof wa.openLink === 'function')) {
                e.preventDefault();
                openExternalLink(promo.link);
            }
            // در مرورگر معمولی (خارج از اپ ایتا) رفتار پیش‌فرض <a> اجرا می‌شود
            // و لینک مستقیماً باز می‌شود.
        });
        container.appendChild(card);

        const dot = document.createElement('span');
        dot.className = `channel-promo-dot ${index === 0 ? 'active' : ''}`;
        dotsContainer.appendChild(dot);
    });

    // فقط وقتی بیش از یک کارت هست نقطه‌ها را نشان بده
    dotsContainer.classList.toggle('hidden', visiblePromos.length <= 1);

    if (visiblePromos.length > 1) {
        container.addEventListener('scroll', () => {
            const cardWidth = container.firstElementChild ? container.firstElementChild.offsetWidth + 12 : 1;
            const activeIndex = Math.round(Math.abs(container.scrollLeft) / cardWidth);
            dotsContainer.querySelectorAll('.channel-promo-dot').forEach((dot, i) => {
                dot.classList.toggle('active', i === activeIndex);
            });
        });

        // چرخش خودکار هر ۴ ثانیه. از scrollIntoView به‌جای دستکاری مستقیم
        // scrollLeft استفاده می‌کنیم چون علامت (مثبت/منفی) scrollLeft در حالت
        // RTL بین مرورگرها فرق می‌کند و scrollIntoView این مشکل را ندارد.
        let rotateIndex = 0;
        const rotateToNext = () => {
            rotateIndex = (rotateIndex + 1) % visiblePromos.length;
            const target = container.children[rotateIndex];
            if (target) target.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
        };
        promoRotateInterval = setInterval(rotateToNext, PROMO_ROTATE_INTERVAL_MS);

        // با تعامل دستی کاربر، چرخش خودکار موقتاً متوقف و بعد از چند ثانیه از سر گرفته می‌شود
        let resumeTimeout = null;
        container.addEventListener('pointerdown', () => {
            clearInterval(promoRotateInterval);
            clearTimeout(resumeTimeout);
            resumeTimeout = setTimeout(() => {
                promoRotateInterval = setInterval(rotateToNext, PROMO_ROTATE_INTERVAL_MS);
            }, 6000);
        });
    }
}




/* =========================================
   5. Game Logic Core
========================================= */

// --- سوال روزانه ---
// کلید امروز بر اساس ساعت محلی گوشی ساخته می‌شود، پس دقیقاً «بعد از نیمه‌شب
// محلی» عوض می‌شود، نه یک منطقه زمانی ثابت جهانی.
function getTodayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hashStringToInt(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = (hash * 31 + str.charCodeAt(i)) >>> 0; }
    return hash;
}

// یک مرحله را بر اساس تاریخ امروز، به‌صورت قطعی از بین همه مراحل همه دسته‌ها
// انتخاب می‌کند. «قطعی» یعنی همه کاربران در یک روز، سوال یکسانی می‌بینند و
// این سوال فقط با عوض شدن تاریخ (نیمه‌شب) تغییر می‌کند.
//
// نکته مهم درباره «تکرار نشدن»: قبلاً اینجا فقط hash(تاریخ) % تعداد سوال‌ها
// حساب می‌شد؛ این روش با اینکه هر روز یک سوال «تصادفی‌نما» می‌داد، از نظر
// آماری (masalan مسئله‌ی تولد/Birthday Paradox) احتمال زیادی داشت که خیلی
// زودتر از تمام‌شدن کل بانک سوال‌ها، یک سوال تکراری بیفتد (با ۱۵۰ سوال،
// به‌طور میانگین هر ~۱۲-۱۳ روز یک برخورد رخ می‌داد).
// روش جدید: یک «چیدمان» (permutation) ثابت و قطعی از همه‌ی سوال‌ها می‌سازیم
// (Fisher-Yates با یک seed ثابت، پس چیدمان برای همه کاربران یکسان است) و هر
// روز فقط یک قدم روی همین چیدمان جلو می‌رویم. این یعنی تا وقتی همه‌ی سوال‌ها
// یک‌بار دیده نشده باشند، هیچ سوالی دوباره تکرار نمی‌شود؛ فقط بعد از عبور از
// کل بانک سوال (الان ۶۵×۳=۱۹۵ سوال یعنی حدود ۶.5 ماه)، چیدمان دوباره از اول
// شروع می‌شود. برای طولانی‌تر کردن این چرخه، کافیست مرحله‌ی بیشتری به
// data.json اضافه کنی؛ خودکار وارد چرخه می‌شوند.
function seededRandom(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function () {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

const DAILY_PERMUTATION_SEED = 20240101; // ثابت نگه‌دار؛ عوض کردنش چیدمان را کلاً بهم می‌ریزد
let dailyPermutationCache = null;
let dailyPermutationForLength = 0;

function getDailyPermutation(length) {
    if (dailyPermutationCache && dailyPermutationForLength === length) return dailyPermutationCache;
    const arr = Array.from({ length }, (_, i) => i);
    const rand = seededRandom(DAILY_PERMUTATION_SEED);
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    dailyPermutationCache = arr;
    dailyPermutationForLength = length;
    return arr;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// عدد ثابتی که شمارش «روز» را همیشه از یک نقطه‌ی مشخص در گذشته شروع می‌کند
// (تا مستقل از تایم‌زون سرور/کاربر، یک عدد صحیح و پایدار برای «امروز» بدهد).
const DAILY_EPOCH = Date.UTC(2024, 0, 1);

function getDailyChallengeLevel() {
    const allLevels = [];
    DB.categories.forEach(cat => {
        cat.levels.forEach(lvl => allLevels.push({ ...lvl, categoryId: cat.id, categoryName: cat.name, categoryIcon: cat.icon }));
    });
    if (allLevels.length === 0) return null;
    const daysSinceEpoch = Math.floor((Date.now() - DAILY_EPOCH) / DAY_MS);
    const permutation = getDailyPermutation(allLevels.length);
    const cyclePosition = ((daysSinceEpoch % permutation.length) + permutation.length) % permutation.length;
    const idx = permutation[cyclePosition];
    return allLevels[idx];
}

function renderDailyChallengeCard() {
    const card = document.getElementById('daily-challenge-card');
    if (!card) return;
    const doneToday = GameState.dailyChallenge.lastCompletedDate === getTodayKey();
    card.classList.toggle('done', doneToday);
    document.getElementById('daily-badge').textContent = doneToday ? '✅ انجام‌شد' : '🔥 جدید';
    document.getElementById('daily-status-text').textContent = doneToday
        ? 'امروز حلش کردی! نیمه‌شب یه چالش تازه میاد 🌙'
        : 'یه معمای ایموجی مخصوص امروز، هر روز عوض می‌شه';
}

// --- عضویت اجباری در کانال قبل از بازی (چرخشی هفتگی) ---
// action همان کاری است که کاربر می‌خواست انجام دهد (باز کردن یک دسته یا
// چالش روزانه). فقط کانال «فعال همین هفته» چک می‌شود، نه همه‌ی کانال‌ها با
// هم. عضویت هفته‌ی قبل، برای هفته‌ی جدید کافی نیست چون channelId عوض شده.
let pendingJoinAction = null;
function requireChannelJoin(action) {
    const info = getCurrentRotationInfo();
    if (!info) { action(); return; } // اگر هیچ کانال فعالی نبود (همه غیرفعال)، چیزی را بلاک نکن

    const alreadyConfirmedThisWeek =
        GameState.joinGate.confirmedChannelId === info.channel.id &&
        GameState.joinGate.confirmedWeekNumber === info.weekNumber;

    if (alreadyConfirmedThisWeek) { action(); return; }

    pendingJoinAction = action;
    renderJoinGateModal(info);
    document.getElementById('modal-join-gate').classList.remove('hidden');
}

// محتوای پنجره را بر اساس کانالِ فعالِ همین هفته می‌سازد. متن معرفیِ هر
// کانال دیگر از JS نمی‌آید — مستقیماً در index.html نوشته شده (چهار
// <p class="join-gate-msg" data-channel-id="..."> داخل modal-join-gate)؛
// این تابع فقط همان‌یکی که با کانال فعال این هفته می‌خواند را نشان
// می‌دهد و بقیه را مخفی می‌کند. فقط ردیف پایین (نام/آیکون/دکمه‌ی عضویت)
// همچنان پویاست، چون لینک آن هر هفته عوض می‌شود.
function renderJoinGateModal(info) {
    document.querySelectorAll('.join-gate-msg').forEach(el => {
        el.classList.toggle('hidden', el.dataset.channelId !== info.channel.id);
    });

    const container = document.getElementById('join-gate-channels');
    if (!container) return;
    container.innerHTML = '';

    const row = document.createElement('div');
    row.className = 'join-gate-channel-row';
    row.innerHTML = `
        <span class="jg-channel-name">${info.channel.icon} ${info.channel.name}</span>
        <button type="button" class="ios-btn primary-btn jg-join-btn">عضویت</button>`;
    row.querySelector('.jg-join-btn').addEventListener('click', () => {
        AudioEngine.tap();
        openExternalLink(getChannelUrl(info.channel));
    });
    container.appendChild(row);
}

function startDailyChallenge() {
    AudioEngine.tap();
    if (GameState.dailyChallenge.lastCompletedDate === getTodayKey()) {
        showToast('🌙', 'چالش امروز رو قبلاً حل کردی! بعد از نیمه‌شب یه چالش جدید میاد.');
        return;
    }
    const lvl = getDailyChallengeLevel();
    if (!lvl) return;

    GameState.isDailyChallenge = true;
    GameState.activeCategory = { id: 'daily', name: '🔥 چالش روزانه', icon: '🔥', levels: [lvl] };
    GameState.activeLevelIndex = 0;
    document.getElementById('game-category-title').textContent = '🔥 چالش روزانه';
    document.getElementById('category-notice').classList.add('hidden');

    // نمایش دسته‌بندی (نوع) سوال روزانه، مثلاً «🎭 ضرب‌المثل‌ها»
    const badgeEl = document.getElementById('daily-type-badge');
    if (badgeEl) {
        badgeEl.textContent = `${lvl.categoryIcon || ''} ${lvl.categoryName || ''}`.trim();
        badgeEl.classList.remove('hidden');
    }

    showScreen('screen-game');
    renderLevel();

    if (window.Eitaa && window.Eitaa.WebApp && window.Eitaa.WebApp.BackButton) {
        window.Eitaa.WebApp.BackButton.show();
    }
}

// --- سطح سختی هر مرحله ---
// اگر خود مرحله در data.json مقدار "difficulty" داشته باشد از همان استفاده
// می‌شود (برای سفارشی‌سازی دستی در آینده)، وگرنه بر اساس تعداد حروف پاسخ
// به‌صورت خودکار تخمین زده می‌شود؛ راهی سبک برای سطح‌بندی ۱۵۰+ مرحله فعلی
// بدون نیاز به ویرایش دستی تک‌تک آن‌ها در data.json.
const DIFFICULTY_LABELS = {
    easy: { text: 'آسان', className: 'diff-easy' },
    medium: { text: 'متوسط', className: 'diff-medium' },
    hard: { text: 'سخت', className: 'diff-hard' }
};
function computeDifficulty(levelData, isWordMode) {
    if (levelData.difficulty && DIFFICULTY_LABELS[levelData.difficulty]) return levelData.difficulty;
    if (isWordMode) {
        // برای دسته‌های کلمه‌به‌کلمه (مثل ضرب‌المثل)، سختی واقعی که کاربر حس
        // می‌کند به تعداد کلماتی که باید بچیند بستگی دارد، نه تعداد کل حروف
        // جمله؛ یک ضرب‌المثل ۶ کلمه‌ای حتی اگر حروفش زیاد باشد، سخت‌تر از یک
        // جمله ۹ کلمه‌ای با کلمات کوتاه نیست.
        const wordCount = levelData.answer.trim().split(/\s+/).length;
        if (wordCount <= 3) return 'easy';
        if (wordCount <= 6) return 'medium';
        return 'hard';
    }
    const len = levelData.answer.replace(/\s/g, '').length;
    if (len <= 6) return 'easy';
    if (len <= 12) return 'medium';
    return 'hard';
}

function startCategory(category) {
    GameState.isDailyChallenge = false;
    GameState.activeCategory = category;
    document.getElementById('game-category-title').textContent = category.name;
    document.getElementById('daily-type-badge').classList.add('hidden');
    
    let completedArr = GameState.progress[category.id] || [];
    let nextIndex = 0;
    for(let i=0; i < category.levels.length; i++) {
        if(!completedArr.includes(i)) { nextIndex = i; break; }
    }
    GameState.activeLevelIndex = nextIndex;
    
    // نمایش هشدار برای ضرب‌المثل‌ها
    const noticeEl = document.getElementById('category-notice');
    if (category.id === 'proverbs') {
        noticeEl.innerHTML = '💡 <strong>توجه:</strong> برخی از ضرب‌المثل‌ها به زبان محاوره و عامیانه نوشته شده‌اند.';
        noticeEl.classList.remove('hidden');
    } else {
        noticeEl.classList.add('hidden');
    }

    showScreen('screen-game');
    renderLevel();

    // فعال‌سازی دکمه بازگشت سیستمی ایتا
    if (window.Eitaa && window.Eitaa.WebApp && window.Eitaa.WebApp.BackButton) {
        window.Eitaa.WebApp.BackButton.show();
    }
}

function renderLevel() {
    const cat = GameState.activeCategory;
    if (GameState.activeLevelIndex >= cat.levels.length) GameState.activeLevelIndex = 0;

    const levelData = cat.levels[GameState.activeLevelIndex];
    const answer = levelData.answer.replace(/ي/g, "ی").replace(/ك/g, "ک").trim();
    
    document.getElementById('ui-level').textContent = GameState.activeLevelIndex + 1;
    document.getElementById('game-score').textContent = GameState.globalScore;

    const isWordMode = cat.id === 'proverbs';

    const diffKey = computeDifficulty(levelData, isWordMode);
    const diffInfo = DIFFICULTY_LABELS[diffKey];
    const diffEl = document.getElementById('ui-difficulty');
    diffEl.textContent = diffInfo.text;
    diffEl.className = `difficulty-badge ${diffInfo.className}`;

    renderAppleEmojis(document.getElementById('emoji-inner-container'), levelData.emoji);

    const answerArea = document.getElementById('answer-slots');
    answerArea.innerHTML = '';
    GameState.slots = [];
    let slotId = 0;

    // فقط دسته‌ی ضرب‌المثل‌ها به‌جای حرف، کلمه‌به‌کلمه ساخته می‌شود؛ چون
    // ضرب‌المثل‌ها جمله‌های بلندی هستند و چیدن تک‌تک حروفشان برای کاربر
    // خسته‌کننده بود. بقیه دسته‌ها (فیلم/کشور) دقیقاً مثل قبل حرف‌به‌حرف می‌مانند.
    let requiredUnits = [];

    if (isWordMode) {
        answer.split(' ').forEach(word => {
            const slotObj = { id: slotId++, char: word, filledWith: '', keyId: null, locked: false, isWord: true };
            GameState.slots.push(slotObj);
            requiredUnits.push(word);

            const slotEl = document.createElement('div');
            slotEl.className = 'slot word-slot';
            slotEl.id = `slot-${slotObj.id}`;
            slotEl.addEventListener('click', () => handleSlotClick(slotObj.id));
            answerArea.appendChild(slotEl);
        });
    } else {
        answer.split(' ').forEach(word => {
            const group = document.createElement('div');
            group.className = 'word-group';
            for (let char of word) {
                const slotObj = { id: slotId++, char: char, filledWith: '', keyId: null, locked: false, isWord: false };
                GameState.slots.push(slotObj);
                requiredUnits.push(char);

                const slotEl = document.createElement('div');
                slotEl.className = 'slot';
                slotEl.id = `slot-${slotObj.id}`;
                slotEl.addEventListener('click', () => handleSlotClick(slotObj.id));
                group.appendChild(slotEl);
            }
            answerArea.appendChild(group);
        });
    }

    let keyUnits = [...requiredUnits];
    if (isWordMode) {
        // چند کلمه‌ی مزاحم (اشتباه ولی باورپذیر) از دیتابیس کلمات data.json اضافه
        // می‌شود تا انتخاب کلمه‌ی درست کمی چالش داشته باشد، نه اینکه دقیقاً همان
        // تعداد کلمه‌ی درست روی کیبورد باشد.
        const bank = (DB.wordBank || []).filter(w => !requiredUnits.includes(w));
        const shuffledBank = [...bank].sort(() => Math.random() - 0.5);
        const decoyCount = Math.min(shuffledBank.length, Math.max(4, Math.min(8, requiredUnits.length + 3)));
        keyUnits.push(...shuffledBank.slice(0, decoyCount));
    } else {
        while (keyUnits.length < Math.max(24, requiredUnits.length + 6)) {
            keyUnits.push(PERSIAN_ALPHABET[Math.floor(Math.random() * PERSIAN_ALPHABET.length)]);
        }
    }
    keyUnits.sort(() => Math.random() - 0.5);

    GameState.keys = keyUnits.map((c, i) => ({ id: i, char: c, used: false, isWord: isWordMode }));
    const kbArea = document.getElementById('keyboard');
    kbArea.innerHTML = '';
    
    GameState.keys.forEach(k => {
        const btn = document.createElement('button');
        btn.className = `key pop-in ${k.isWord ? 'word-key' : ''}`;
        btn.id = `key-${k.id}`;
        btn.textContent = k.char;
        btn.addEventListener('click', () => handleKeyClick(k.id));
        kbArea.appendChild(btn);
    });

    GameState.startTime = Date.now();
    updateGameUI();
}

function updateGameUI() {
    document.getElementById('game-score').textContent = GameState.globalScore;
    GameState.slots.forEach(s => {
        const el = document.getElementById(`slot-${s.id}`);
        if(el) {
            el.textContent = s.filledWith;
            el.className = `slot ${s.isWord ? 'word-slot' : ''} ${s.filledWith ? 'filled' : ''} ${s.locked ? 'locked' : ''}`;
        }
    });
    GameState.keys.forEach(k => {
        const el = document.getElementById(`key-${k.id}`);
        if(el) el.className = `key ${k.isWord ? 'word-key' : ''} ${k.used ? 'used' : ''}`;
    });
}

function handleKeyClick(keyId) {
    const key = GameState.keys.find(k => k.id === keyId);
    if (!key || key.used) return;
    const emptySlot = GameState.slots.find(s => s.filledWith === '');
    if (!emptySlot) return;

    AudioEngine.tap();
    emptySlot.filledWith = key.char;
    emptySlot.keyId = key.id;
    key.used = true;
    updateGameUI();
    checkWin();
}

function handleSlotClick(slotId) {
    const slot = GameState.slots.find(s => s.id === slotId);
    if (!slot || !slot.filledWith || slot.locked) return;
    
    AudioEngine.pop();
    const key = GameState.keys.find(k => k.id === slot.keyId);
    if (key) key.used = false;
    slot.filledWith = '';
    slot.keyId = null;
    updateGameUI();
}

function useHint() {
    if (GameState.globalScore < HINT_COST) { showToast('🪙', 'امتیاز کافی نیست!'); return; }
    const candidates = GameState.slots.filter(s => !s.locked && s.filledWith !== s.char);
    if (candidates.length === 0) return;
    
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    if (target.filledWith !== '') {
        const k = GameState.keys.find(x => x.id === target.keyId);
        if(k) k.used = false;
        target.filledWith = '';
    }

    let validKeyId = GameState.keys.findIndex(k => k.char === target.char && !k.used);
    if (validKeyId === -1) {
        const wrongSlot = GameState.slots.find(s => !s.locked && s.filledWith === target.char);
        if(wrongSlot) {
            validKeyId = wrongSlot.keyId;
            wrongSlot.filledWith = '';
            const freed = GameState.keys.find(k => k.id === validKeyId);
            if(freed) freed.used = false;
        }
    }

    if (validKeyId !== -1) {
        GameState.globalScore -= HINT_COST;
        target.filledWith = target.char;
        target.keyId = validKeyId;
        target.locked = true;
        GameState.keys.find(k => k.id === validKeyId).used = true;
        AudioEngine.pop();
        updateGameUI();
        StorageManager.save();
        checkWin();
    }
}

function checkWin() {
    if (GameState.slots.some(s => s.filledWith === '')) return;
    const isCorrect = GameState.slots.every(s => s.filledWith === s.char);
    
    if (isCorrect) {
        AudioEngine.success();
        let base;

        if (GameState.isDailyChallenge) {
            base = DAILY_BASE_SCORE;
            GameState.globalScore += base;
            GameState.totalEarned += base;
            const todayKey = getTodayKey();
            if (GameState.dailyChallenge.lastCompletedDate !== todayKey) {
                GameState.dailyChallenge.completedCount = (GameState.dailyChallenge.completedCount || 0) + 1;
            }
            GameState.dailyChallenge.lastCompletedDate = todayKey;
        } else {
            const catId = GameState.activeCategory.id;
            base = CATEGORY_SCORES[catId] ?? BASE_SCORE;
            GameState.globalScore += base;
            GameState.totalEarned += base;
            if (!GameState.progress[catId]) GameState.progress[catId] = [];
            if (!GameState.progress[catId].includes(GameState.activeLevelIndex)) {
                GameState.progress[catId].push(GameState.activeLevelIndex);
            }
        }
        
        checkMedals();
        StorageManager.save();

        document.getElementById('reward-base-score').textContent = `+${base}`;
        
        document.getElementById('modal-success').classList.remove('hidden');
    } else {
        AudioEngine.error();
        const area = document.getElementById('answer-slots');
        area.classList.remove('shake');
        void area.offsetWidth;
        area.classList.add('shake');
    }
}

function showToast(icon, text, duration = 3500) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span style="font-size:1.5rem">${icon}</span> <span>${text}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
}

function checkMedals() {
    MEDALS_DB.forEach(medal => {
        if (!GameState.unlockedMedals.includes(medal.id) && medal.check(GameState)) {
            GameState.unlockedMedals.push(medal.id);
            showToast(medal.icon, `مدال جدید: ${medal.name}`);
            AudioEngine.medal();
        }
    });
}

/* =========================================
   6. Bootstrapping
========================================= */
function setupEvents() {
    document.getElementById('btn-back-home').addEventListener('click', goBackToHome);
    
    // اتصال دکمه بازگشت سخت‌افزاری/سیستمی ایتا به برنامه ما
    if (window.Eitaa && window.Eitaa.WebApp && window.Eitaa.WebApp.BackButton) {
        window.Eitaa.WebApp.BackButton.onClick(goBackToHome);
    }

    document.getElementById('btn-next-level').addEventListener('click', () => {
        AudioEngine.tap();
        document.getElementById('modal-success').classList.add('hidden');
        if (GameState.isDailyChallenge) {
            GameState.isDailyChallenge = false;
            goBackToHome();
            return;
        }
        GameState.activeLevelIndex++;
        renderLevel();
    });
    
    document.getElementById('btn-hint').addEventListener('click', useHint);

    document.getElementById('daily-challenge-card').addEventListener('click', () => requireChannelJoin(startDailyChallenge));

    document.getElementById('btn-confirm-joined').addEventListener('click', () => {
        AudioEngine.tap();
        // نکته فنی مهم: از داخل مرورگر (بدون سرور و بدون Bot API رسمی ایتا برای
        // احراز عضویت) امکان بررسی واقعی و قطعی عضویت کاربر در کانال وجود ندارد.
        // به همین دلیل، به‌جای شبیه‌سازی یک "تأیید" دروغین، این دکمه صادقانه به
        // عنوان «خودم عضو شدم» عمل می‌کند (self-report). فقط برای کانال و
        // هفته‌ی فعلیِ چرخش ثبت می‌شود؛ با شروع هفته‌ی بعد و عوض شدن کانال،
        // این تأیید خودکار باطل می‌شود و کاربر باید دوباره تأیید کند.
        const info = getCurrentRotationInfo();
        if (info) {
            GameState.joinGate.confirmedChannelId = info.channel.id;
            GameState.joinGate.confirmedWeekNumber = info.weekNumber;
            StorageManager.save();
        }
        document.getElementById('modal-join-gate').classList.add('hidden');
        if (pendingJoinAction) {
            const action = pendingJoinAction;
            pendingJoinAction = null;
            action();
        }
    });

    document.getElementById('btn-open-settings').addEventListener('click', () => { AudioEngine.tap(); document.getElementById('modal-settings').classList.remove('hidden'); });
    document.getElementById('btn-open-changelog').addEventListener('click', () => {
        AudioEngine.tap();
        document.getElementById('modal-settings').classList.add('hidden');
        renderChangelog(true);
        document.getElementById('modal-changelog').classList.remove('hidden');
    });
    document.querySelectorAll('.close-btn').forEach(b => b.addEventListener('click', (e) => { document.getElementById(e.target.dataset.close).classList.add('hidden'); }));
    document.getElementById('toggle-theme').addEventListener('change', e => { GameState.settings.darkMode = e.target.checked; applyTheme(); StorageManager.save(); });
    document.getElementById('toggle-sound').addEventListener('change', e => { GameState.settings.sound = e.target.checked; StorageManager.save(); });

    // صفحه پروفایل: با لمس آواتار/اسم کاربر در هدر باز می‌شود
    document.getElementById('user-info-trigger').addEventListener('click', () => {
        AudioEngine.tap();
        renderProfile();
        showScreen('screen-profile');
        if (window.Eitaa && window.Eitaa.WebApp && window.Eitaa.WebApp.BackButton) {
            window.Eitaa.WebApp.BackButton.show();
        }
    });
    document.getElementById('btn-back-profile').addEventListener('click', goBackToHome);
    document.querySelectorAll('.gender-option').forEach(el => {
        el.addEventListener('click', () => {
            AudioEngine.tap();
            GameState.settings.gender = el.dataset.gender;
            StorageManager.save();
            renderProfile();
        });
    });

    // دکمه‌ی «انتخاب عکس پروفایل» فعلاً فقط جای‌گیر است (طبق درخواست، مجموعه‌ی
    // عکس‌ها بعداً اضافه می‌شود)؛ همین الان فقط یک پیام می‌دهد.
    const avatarPhotoBtn = document.getElementById('btn-choose-avatar-photo');
    if (avatarPhotoBtn) {
        avatarPhotoBtn.addEventListener('click', () => {
            AudioEngine.tap();
            showToast('🖼️', 'انتخاب عکس پروفایل به‌زودی اضافه می‌شه!');
        });
    }

    // --- تغییر نام نمایشی ---
    document.getElementById('btn-edit-name').addEventListener('click', () => {
        AudioEngine.tap();
        const input = document.getElementById('edit-name-input');
        input.value = getDisplayName();
        document.getElementById('modal-edit-name').classList.remove('hidden');
        input.focus();
    });
    document.getElementById('btn-save-name').addEventListener('click', () => {
        AudioEngine.tap();
        const input = document.getElementById('edit-name-input');
        const clean = sanitizeDisplayName(input.value);
        if (!clean) {
            showToast('⚠️', 'نام نمی‌تواند خالی باشد.');
            return;
        }
        GameState.settings.displayName = clean;
        StorageManager.save();
        document.getElementById('modal-edit-name').classList.add('hidden');
        renderProfile();
        renderHome();
        showToast('✅', 'نام شما ذخیره شد.');
    });
    document.getElementById('btn-cancel-name').addEventListener('click', () => {
        AudioEngine.tap();
        document.getElementById('modal-edit-name').classList.add('hidden');
    });
}

/* =========================================
   7. نسخه‌ی جدید برنامک (Changelog)
========================================= */
// showAll=true یعنی همه نسخه‌ها (برای ردیف «نسخه‌ی جدید برنامک» در تنظیمات)،
// showAll=false یعنی فقط نسخه‌هایی که کاربر هنوز ندیده (برای پاپ‌آپ خودکار).
// نکته: عمداً فقط لیست «added» (امکانات جدید) نمایش داده می‌شود؛ باگ‌فیکس‌ها و
// تغییرات داخلی برای کاربر عادی جذابیتی ندارد و در CHANGELOG_DB می‌مانند فقط
// برای مستندسازی داخلی خودمان.
function renderChangelog(showAll) {
    const body = document.getElementById('changelog-body');
    if (!body) return;
    const seen = localStorage.getItem('lastSeenVersion');
    let entries = CHANGELOG_DB;
    if (!showAll && seen) {
        const seenIdx = CHANGELOG_DB.findIndex(e => e.version === seen);
        entries = seenIdx === -1 ? CHANGELOG_DB.slice(0, 1) : CHANGELOG_DB.slice(0, seenIdx);
    }
    if (entries.length === 0) entries = CHANGELOG_DB.slice(0, 1);

    body.innerHTML = entries.map(entry => `
        <div class="changelog-entry">
            <div class="changelog-version">نسخه ${entry.version}</div>
            ${entry.added?.length ? `
                <ul class="changelog-list">${entry.added.map(t => `<li>✨ ${t}</li>`).join('')}</ul>` : ''}
        </div>`).join('');
}

function checkForUpdates() {
    const seen = localStorage.getItem('lastSeenVersion');
    localStorage.setItem('lastSeenVersion', APP_VERSION);
    // بار اول نصب (seen خالی) پاپ‌آپ نشون داده نمی‌شود؛ فقط وقتی نسخه قبلی
    // دیده شده و با نسخه فعلی فرق دارد (یعنی واقعاً یک آپدیت اتفاق افتاده).
    if (seen && seen !== APP_VERSION) {
        renderChangelog(false);
        document.getElementById('modal-changelog').classList.remove('hidden');
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    if (window.Eitaa && window.Eitaa.WebApp) {
        window.Eitaa.WebApp.ready();
        window.Eitaa.WebApp.expand();
        if (window.Eitaa.WebApp.initDataUnsafe?.user) {
            GameState.user = window.Eitaa.WebApp.initDataUnsafe.user;
        }
    }

    try {
        const res = await fetch('data.json');
        DB = await res.json();
    } catch (e) {
        DB = { categories: [{ id: "proverbs", name: "ضرب‌المثل‌ها", icon: "🎭", levels: [{ emoji: "👂🏻🚪👂🏻🥅", answer: "یه گوشش دره یه گوشش دروازه" }] }] };
    }

    StorageManager.load(() => {
        document.getElementById('toggle-theme').checked = GameState.settings.darkMode;
        document.getElementById('toggle-sound').checked = GameState.settings.sound;
        document.getElementById('settings-version-label').textContent = `نسخه ${APP_VERSION}`;
        applyTheme();
        setupEvents();
        renderHome();
        checkForUpdates();
        preloadUpcomingEmojis();
    });
});
