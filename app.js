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
const HINT_COST = 20;
const BASE_SCORE = 10;
const FAST_TIME_LIMIT = 15;
const DAILY_BASE_SCORE = 50;

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
const APP_VERSION = '1.5.0';
const CHANGELOG_DB = [
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
    settings: { sound: true, darkMode: false, gender: null }, // gender: null | 'boy' | 'girl'
    dailyChallenge: { lastCompletedDate: null, completedCount: 0 },
    isDailyChallenge: false,
    activeCategory: null,
    activeLevelIndex: 0,
    startTime: 0,
    slots: [],
    keys: []
};

const MEDALS_DB = [
    { id: 'first_blood', name: 'اولین قدم', icon: '🩴', desc: 'اولین مرحله را حل کن',
        check: (state) => getTotalCompleted(state) >= 1,
        progress: (state) => `${Math.min(getTotalCompleted(state), 1)}/۱` },
    { id: 'proverbs_novice', name: 'ضرب‌المثل آموز', icon: '📜', desc: '۵ ضرب‌المثل را حل کن',
        check: (state) => (state.progress['proverbs']?.length || 0) >= 5,
        progress: (state) => `${Math.min(state.progress['proverbs']?.length || 0, 5)}/۵` },
    { id: 'movies_novice', name: 'فیلم‌باز', icon: '🎬', desc: '۵ فیلم و سریال را حل کن',
        check: (state) => (state.progress['movies']?.length || 0) >= 5,
        progress: (state) => `${Math.min(state.progress['movies']?.length || 0, 5)}/۵` },
    { id: 'countries_novice', name: 'جهانگرد', icon: '🌍', desc: '۵ کشور را حل کن',
        check: (state) => (state.progress['countries']?.length || 0) >= 5,
        progress: (state) => `${Math.min(state.progress['countries']?.length || 0, 5)}/۵` },
    // نکته: عمداً از totalEarned استفاده می‌کنیم نه globalScore، چون globalScore با
    // خرج کردن روی راهنما کم می‌شود و ممکن بود کاربری که واقعاً ۵۰۰ امتیاز کسب
    // کرده ولی خرج کرده، هیچ‌وقت این مدال را نگیرد.
    { id: 'rich', name: 'ثروتمند', icon: '💎', desc: '۵۰۰ امتیاز کسب کن',
        check: (state) => state.totalEarned >= 500,
        progress: (state) => `${Math.min(state.totalEarned, 500)}/۵۰۰` },
    { id: 'daily_fan', name: 'اهل چالش روزانه', icon: '🔥', desc: '۵ چالش روزانه را حل کن',
        check: (state) => (state.dailyChallenge?.completedCount || 0) >= 5,
        progress: (state) => `${Math.min(state.dailyChallenge?.completedCount || 0, 5)}/۵` },
    { id: 'all_categories', name: 'استاد بازی', icon: '👑', desc: 'همه دسته‌ها را صد‌درصد کامل کن',
        check: (state) => DB.categories.length > 0 && DB.categories.every(c => (state.progress[c.id]?.length || 0) >= c.levels.length),
        progress: (state) => {
            const total = DB.categories.reduce((s, c) => s + c.levels.length, 0);
            const done = DB.categories.reduce((s, c) => s + Math.min(state.progress[c.id]?.length || 0, c.levels.length), 0);
            return `${done}/${total}`;
        } }
];

// نمای کشویی «کانال‌های ما»: هر آبجکت یک کارت قابل سوایپ می‌سازد (هر ۵ ثانیه
// خودش می‌چرخد). دو نوع کارت پشتیبانی می‌شود:
//   type: 'channel'  → کارت معرفی کانال (name, handle, desc, icon, link, theme)
//   type: 'ad'       → کارت تبلیغ ویژه، ظاهر و رنگش عمداً متفاوته که کاربر
//                      سریع بفهمه تبلیغه (badge, desc, icon, link, buttonText)
// برای افزودن کانال جدید، فقط یک آبجکت دیگر شبیه پایین به آرایه اضافه کن.
// theme برای کانال‌ها: 'tech' / 'poetry' / 'meme' (یا خالی برای آبی پیش‌فرض).
const CHANNEL_PROMOS = [
    {
        type: 'channel',
        name: 'آواي‌خـــــــــیال',
        handle: '@avay_khiyal',
        desc: 'کانال شعر؛ اگه دلت یه گوشه‌ی آروم برای خوندن شعر می‌خواد، بیا اینجا',
        icon: '🕊️',
        link: 'https://eitaa.com/avay_khiyal',
        theme: 'poetry'
    },
    {
        type: 'ad',
        badge: 'تبلیغ ویژه',
        icon: '🎯',
        desc: 'برای رزرو کلیک کنید و به مدیر پیام بدهید!',
        link: 'https://eitaa.com/tab_amoo',
        buttonText: 'مشاهده'
        // برای ثبت تبلیغ جدید، فقط همین چند خط را عوض کن.
        // برای مخفی کردن موقت این کارت، active: false اضافه کن.
    },
    {
        type: 'channel',
        name: 'تِک نور | 𝙏𝙚𝙘𝙝 𝙣𝙤𝙪𝙧',
        handle: '@Tech_nour',
        desc: 'اخبار هوش مصنوعی و آپدیت‌های بازی رو اینجا دنبال کن',
        icon: '📢',
        link: 'https://eitaa.com/Tech_nour',
        theme: 'tech'
    },
    {
        type: 'channel',
        name: 'Rasa Meme | رسامیم',
        handle: '@Rasa_Meme',
        desc: 'یسری میم چرت و پرت',
        icon: '😂',
        link: 'https://eitaa.com/Rasa_Meme',
        theme: 'meme'
    }
];

function getTotalCompleted(state) {
    return Object.values(state.progress).reduce((sum, arr) => sum + arr.length, 0);
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
            dailyChallenge: GameState.dailyChallenge
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
    img.loading = 'lazy';
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

function renderHome() {
    document.getElementById('home-total-score').textContent = GameState.globalScore;
    document.getElementById('user-name').textContent = GameState.user.first_name;

    const avatarEl = document.getElementById('user-avatar');
    if (GameState.user.photo_url) {
        avatarEl.innerHTML = '';
        const img = document.createElement('img');
        img.src = GameState.user.photo_url;
        img.alt = 'Profile';
        img.addEventListener('error', () => {
            img.style.display = 'none';
            avatarEl.textContent = GameState.settings.gender === 'girl' ? '👧' : GameState.settings.gender === 'boy' ? '👦' : '👤';
            avatarEl.style.background = '';
        });
        avatarEl.appendChild(img);
        avatarEl.style.background = 'transparent';
    } else {
        avatarEl.textContent = GameState.settings.gender === 'girl' ? '👧' : GameState.settings.gender === 'boy' ? '👦' : '👤';
    }

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
        div.className = `category-card ${completed === total && total > 0 ? 'completed' : ''}`;
        div.innerHTML = `
            <div class="cat-icon">${cat.icon}</div>
            <div class="cat-info">
                <h3 class="cat-title">${cat.name}</h3>
                <div class="cat-stats">${completed} از ${total} مرحله</div>
                <div class="progress-track"><div class="progress-fill" style="width: ${perc}%"></div></div>
            </div>`;
        div.addEventListener('click', () => { AudioEngine.tap(); startCategory(cat); });
        catContainer.appendChild(div);
    });

    renderDailyChallengeCard();
    renderChannelPromos();
}

let promoRotateInterval = null;

// صفحه پروفایل: آواتار و نام کاربر را از GameState می‌خواند و کارت جنسیت
// انتخاب‌شده را هایلایت می‌کند.
function renderProfile() {
    document.getElementById('profile-name').textContent = GameState.user.first_name;
    const gender = GameState.settings.gender;
    const avatarEl = document.getElementById('profile-avatar');

    if (GameState.user.photo_url) {
        avatarEl.innerHTML = `<img src="${GameState.user.photo_url}" alt="Profile">`;
        avatarEl.style.background = 'transparent';
    } else {
        avatarEl.innerHTML = '';
        avatarEl.textContent = gender === 'girl' ? '👧' : gender === 'boy' ? '👦' : '👤';
        avatarEl.style.background = '';
    }

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

    CHANNEL_PROMOS.forEach((promo, index) => {
        if (promo.active === false) return; // برای مخفی کردن موقت یک کارت (مثلاً تبلیغ تمام‌شده)

        const card = document.createElement('a');
        card.href = promo.link;
        card.target = '_blank';
        card.rel = 'noopener noreferrer';

        if (promo.type === 'ad') {
            // کارت تبلیغ ویژه: عمداً ظاهر متفاوتی دارد (رنگ + نوار «تبلیغ ویژه»)
            // تا کاربر سریع بفهمد این یک تبلیغه، نه یک کانال خودمان.
            card.className = 'channel-promo-card promo-type-ad';
            card.innerHTML = `
                <span class="ad-ribbon">${promo.badge || 'تبلیغ ویژه'}</span>
                <div class="channel-promo-icon">${promo.icon || '🎯'}</div>
                <div class="channel-promo-info">
                    <p class="channel-promo-desc ad-desc">${promo.desc}</p>
                </div>
                <div class="ad-cta-btn">${promo.buttonText || 'مشاهده'}</div>`;
        } else {
            card.className = `channel-promo-card theme-${promo.theme || 'default'}`;
            card.innerHTML = `
                <div class="channel-promo-icon">${promo.icon}</div>
                <div class="channel-promo-info">
                    <h3 class="channel-promo-title">${promo.name}</h3>
                    <span class="channel-promo-handle">${promo.handle}</span>
                    <p class="channel-promo-desc">${promo.desc}</p>
                </div>
                <div class="channel-promo-arrow">‹</div>`;
        }

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

    // فقط وقتی بیش از یک کانال هست نقطه‌ها را نشان بده
    dotsContainer.classList.toggle('hidden', CHANNEL_PROMOS.length <= 1);

    if (CHANNEL_PROMOS.length > 1) {
        container.addEventListener('scroll', () => {
            const cardWidth = container.firstElementChild ? container.firstElementChild.offsetWidth + 12 : 1;
            const activeIndex = Math.round(Math.abs(container.scrollLeft) / cardWidth);
            dotsContainer.querySelectorAll('.channel-promo-dot').forEach((dot, i) => {
                dot.classList.toggle('active', i === activeIndex);
            });
        });

        // چرخش خودکار هر ۵ ثانیه. از scrollIntoView به‌جای دستکاری مستقیم
        // scrollLeft استفاده می‌کنیم چون علامت (مثبت/منفی) scrollLeft در حالت
        // RTL بین مرورگرها فرق می‌کند و scrollIntoView این مشکل را ندارد.
        let rotateIndex = 0;
        promoRotateInterval = setInterval(() => {
            rotateIndex = (rotateIndex + 1) % CHANNEL_PROMOS.length;
            const target = container.children[rotateIndex];
            if (target) target.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
        }, 5000);

        // با تعامل دستی کاربر، چرخش خودکار موقتاً متوقف و بعد از چند ثانیه از سر گرفته می‌شود
        let resumeTimeout = null;
        container.addEventListener('pointerdown', () => {
            clearInterval(promoRotateInterval);
            clearTimeout(resumeTimeout);
            resumeTimeout = setTimeout(() => {
                promoRotateInterval = setInterval(() => {
                    rotateIndex = (rotateIndex + 1) % CHANNEL_PROMOS.length;
                    const target = container.children[rotateIndex];
                    if (target) target.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
                }, 5000);
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
   
