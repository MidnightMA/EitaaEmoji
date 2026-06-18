/**
 * iOS-Style Emoji Guessing Game
 * Engine: Pure Vanilla JS (ES6+)
 */

// ==========================================
// ⚠️ تنظیمات دیتابیس خارجی (حل مشکل ایتا)
// ==========================================
// برای اینکه سینک روی همه دستگاه‌ها کار کند:
// ۱. به سایت kvdb.io بروید (نیازی به فیلترشکن و ثبت نام نیست).
// ۲. روی دکمه مشکی Create Database کلیک کنید.
// ۳. یک رشته تصادفی به شما می‌دهد (مثلاً: WjXyZk123EmojiGame).
// ۴. آن رشته را در متغیر زیر قرار دهید!
const KVDB_BUCKET_ID = "E9u1ucHEsgf9B4m277eW4f"; 
// ==========================================

const PERSIAN_ALPHABET = "ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی";
const HINT_COST = 20;
const BASE_SCORE = 10;
const FAST_TIME_LIMIT = 15;

let DB = { categories: [] };

const GameState = {
    user: { id: 'guest', first_name: 'کاربر مهمان', photo_url: null },
    globalScore: 0,
    progress: {},
    unlockedMedals: [],
    settings: { sound: true, darkMode: false },
    activeCategory: null,
    activeLevelIndex: 0,
    startTime: 0,
    slots: [],
    keys: []
};

const MEDALS_DB = [
    { id: 'first_blood', name: 'اولین قدم', icon: '🥉', desc: 'اولین مرحله را حل کن', check: (state) => getTotalCompleted(state) >= 1 },
    { id: 'proverbs_novice', name: 'ضرب‌المثل آموز', icon: '📜', desc: '۵ ضرب‌المثل را حل کن', check: (state) => (state.progress['proverbs']?.length || 0) >= 5 },
    { id: 'rich', name: 'ثروتمند', icon: '💎', desc: '۵۰۰ امتیاز کسب کن', check: (state) => state.globalScore >= 500 }
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
            progress: GameState.progress,
            unlockedMedals: GameState.unlockedMedals,
            settings: GameState.settings
        });
        
        // همواره روی لوکال استوریج ذخیره می‌کنیم (بک‌آپ)
        localStorage.setItem(this.getKey(), payload);

        // اگر آیدی ایتا وجود داشت و باکت تنظیم شده بود، سینک ابری انجام می‌دهیم
        if (GameState.user.id !== 'guest' && KVDB_BUCKET_ID !== "E9u1ucHEsgf9B4m277eW4f") {
            try {
                await fetch(`https://kvdb.io/${KVDB_BUCKET_ID}/${GameState.user.id}`, {
                    method: 'PUT',
                    body: payload
                });
            } catch (e) { console.warn("Cloud sync failed (Network Error)."); }
        }
    },
    
    load: async function(callback) {
        let finalData = null;

        if (GameState.user.id !== 'guest' && KVDB_BUCKET_ID !== "E9u1ucHEsgf9B4m277eW4f") {
            try {
                const response = await fetch(`https://kvdb.io/${KVDB_BUCKET_ID}/${GameState.user.id}`);
                if (response.ok) finalData = await response.text();
            } catch (e) { console.warn("Could not reach cloud storage."); }
        }

        // استفاده از اطلاعات آفلاین در صورت قطع اینترنت
        if (!finalData) finalData = localStorage.getItem(this.getKey());

        if (finalData) {
            try {
                const data = JSON.parse(finalData);
                GameState.globalScore = data.globalScore || 0;
                GameState.progress = data.progress || {};
                GameState.unlockedMedals = data.unlockedMedals || [];
                GameState.settings = data.settings || GameState.settings;
            } catch(e) { console.error("Parse error."); }
        }
        callback();
    }
};

/* =========================================
   2. Super Fast Apple Emoji Engine
========================================= */
const emojiCache = {}; // کش برای سرعت ۱۰۰ برابری

function renderAppleEmojis(text) {
    if (emojiCache[text]) return emojiCache[text];
    
    let html = '';
    // استفاده از Intl.Segmenter در صورت پشتیبانی مرورگر
    if (window.Intl && window.Intl.Segmenter) {
        const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
        for (let {segment} of segmenter.segment(text)) {
            if (segment.trim() === '') { html += segment; continue; }
            let hexCodes = [];
            for (let i = 0; i < segment.length; i++) {
                let code = segment.codePointAt(i);
                if (code > 0xFFFF) i++;
                hexCodes.push(code.toString(16));
            }
            let cleanHex = hexCodes.filter(c => c !== 'fe0f').join('-');
            // اتصال به CDN فوق سریع
            let imgUrl = `https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.0.1/img/apple/64/${cleanHex}.png`;
            html += `<img src="${imgUrl}" class="apple-emoji" alt="${segment}" loading="lazy">`;
        }
    } else {
        // Fallback قدرتمند برای دستگاه‌های قدیمی اندروید
        const emojiRegex = /([\u{1f300}-\u{1f9ff}\u{2600}-\u{26ff}\u{2700}-\u{27bf}])/gu;
        html = text.replace(emojiRegex, match => {
            let code = match.codePointAt(0).toString(16);
            return `<img src="https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.0.1/img/apple/64/${code}.png" class="apple-emoji" alt="${match}">`;
        });
    }

    emojiCache[text] = html; // ذخیره در رم برای رندر آنی دفعات بعد
    return html;
}

/* =========================================
   3. Audio Engine
========================================= */
const AudioEngine = (function() {
    let audioCtx = null;
    function init() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function playTone(freq, type, dur, vol = 0.05) {
        if (!GameState.settings.sound) return;
        init();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + dur);
    }
    return {
        tap: () => playTone(600, 'sine', 0.1, 0.02),
        pop: () => playTone(400, 'triangle', 0.1, 0.03),
        error: () => playTone(150, 'sawtooth', 0.3, 0.05),
        success: () => { playTone(400, 'sine', 0.1); setTimeout(() => playTone(600, 'sine', 0.15), 100); },
        medal: () => { playTone(500, 'sine', 0.1); setTimeout(() => playTone(800, 'sine', 0.3), 100); }
    };
})();

/* =========================================
   4. UI Management & Eitaa Profile
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

function renderHome() {
    document.getElementById('home-total-score').textContent = GameState.globalScore;
    document.getElementById('user-name').textContent = GameState.user.first_name;

    // بارگذاری دقیق عکس پروفایل ایتا
    const avatarEl = document.getElementById('user-avatar');
    if (GameState.user.photo_url) {
        avatarEl.innerHTML = `<img src="${GameState.user.photo_url}" alt="Profile" onerror="this.style.display='none'; this.parentElement.innerText='👤';">`;
        avatarEl.style.background = 'transparent';
    } else {
        avatarEl.textContent = '👤';
    }

    // مدال‌ها
    const medalsContainer = document.getElementById('medals-container');
    medalsContainer.innerHTML = '';
    MEDALS_DB.forEach(medal => {
        const isUnlocked = GameState.unlockedMedals.includes(medal.id);
        const div = document.createElement('div');
        div.className = `medal-card ${isUnlocked ? 'unlocked' : ''}`;
        div.innerHTML = `<span class="medal-icon">${medal.icon}</span><span class="medal-name">${medal.name}</span>`;
        medalsContainer.appendChild(div);
    });
    document.getElementById('medals-count').textContent = `${GameState.unlockedMedals.length}/${MEDALS_DB.length}`;

    // دسته‌بندی‌ها
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
}

function checkMedals() {
    MEDALS_DB.forEach(medal => {
        if (!GameState.unlockedMedals.includes(medal.id) && medal.check(GameState)) {
            GameState.unlockedMedals.push(medal.id);
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.innerHTML = `<span style="font-size:1.5rem">${medal.icon}</span> <span>مدال جدید: ${medal.name}</span>`;
            container.appendChild(toast);
            AudioEngine.medal();
            setTimeout(() => toast.remove(), 3500);
        }
    });
}

/* =========================================
   5. Game Logic Core
========================================= */
function startCategory(category) {
    GameState.activeCategory = category;
    document.getElementById('game-category-title').textContent = category.name;
    
    let completedArr = GameState.progress[category.id] || [];
    let nextIndex = 0;
    for(let i=0; i < category.levels.length; i++) {
        if(!completedArr.includes(i)) { nextIndex = i; break; }
    }
    GameState.activeLevelIndex = nextIndex;
    showScreen('screen-game');
    renderLevel();
}

function renderLevel() {
    const cat = GameState.activeCategory;
    if (GameState.activeLevelIndex >= cat.levels.length) GameState.activeLevelIndex = 0;

    const levelData = cat.levels[GameState.activeLevelIndex];
    const answer = levelData.answer.replace(/ي/g, "ی").replace(/ك/g, "ک").trim();
    
    document.getElementById('ui-level').textContent = GameState.activeLevelIndex + 1;
    document.getElementById('game-score').textContent = GameState.globalScore;
    
    // تزریق ایموجی‌های کش شده و سریع
    document.getElementById('emoji-inner-container').innerHTML = renderAppleEmojis(levelData.emoji);

    const answerArea = document.getElementById('answer-slots');
    answerArea.innerHTML = '';
    GameState.slots = [];
    let requiredChars = [];
    let slotId = 0;

    answer.split(' ').forEach(word => {
        const group = document.createElement('div');
        group.className = 'word-group';
        for (let char of word) {
            const slotObj = { id: slotId++, char: char, filledWith: '', keyId: null, locked: false };
            GameState.slots.push(slotObj);
            requiredChars.push(char);
            
            const slotEl = document.createElement('div');
            slotEl.className = 'slot';
            slotEl.id = `slot-${slotObj.id}`;
            slotEl.addEventListener('click', () => handleSlotClick(slotObj.id));
            group.appendChild(slotEl);
        }
        answerArea.appendChild(group);
    });

    let keyChars = [...requiredChars];
    while(keyChars.length < Math.max(24, requiredChars.length + 6)) {
        keyChars.push(PERSIAN_ALPHABET[Math.floor(Math.random() * PERSIAN_ALPHABET.length)]);
    }
    keyChars.sort(() => Math.random() - 0.5);

    GameState.keys = keyChars.map((c, i) => ({ id: i, char: c, used: false }));
    const kbArea = document.getElementById('keyboard');
    kbArea.innerHTML = '';
    
    GameState.keys.forEach(k => {
        const btn = document.createElement('button');
        btn.className = 'key pop-in';
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
            el.className = `slot ${s.filledWith ? 'filled' : ''} ${s.locked ? 'locked' : ''}`;
        }
    });
    GameState.keys.forEach(k => {
        const el = document.getElementById(`key-${k.id}`);
        if(el) el.className = `key ${k.used ? 'used' : ''}`;
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
    if (GameState.globalScore < HINT_COST) return alert("امتیاز کافی نیست!");
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
        const timeTaken = (Date.now() - GameState.startTime) / 1000;
        const bonus = timeTaken <= FAST_TIME_LIMIT ? 5 : 0;
        
        GameState.globalScore += BASE_SCORE + bonus;
        const catId = GameState.activeCategory.id;
        if (!GameState.progress[catId]) GameState.progress[catId] = [];
        if (!GameState.progress[catId].includes(GameState.activeLevelIndex)) {
            GameState.progress[catId].push(GameState.activeLevelIndex);
        }
        
        checkMedals();
        StorageManager.save();

        const bonusEl = document.getElementById('reward-bonus');
        if (bonus > 0) { bonusEl.classList.remove('hidden'); bonusEl.innerHTML = `پاداش سرعت: <strong>+${bonus}</strong>`; } 
        else { bonusEl.classList.add('hidden'); }
        
        document.getElementById('modal-success').classList.remove('hidden');
    } else {
        AudioEngine.error();
        const area = document.getElementById('answer-slots');
        area.classList.remove('shake');
        void area.offsetWidth;
        area.classList.add('shake');
    }
}

/* =========================================
   6. Bootstrapping
========================================= */
function setupEvents() {
    document.getElementById('btn-back-home').addEventListener('click', () => { AudioEngine.tap(); renderHome(); showScreen('screen-home'); });
    document.getElementById('btn-next-level').addEventListener('click', () => {
        AudioEngine.tap();
        document.getElementById('modal-success').classList.add('hidden');
        GameState.activeLevelIndex++;
        renderLevel();
    });
    document.getElementById('btn-hint').addEventListener('click', useHint);
    document.getElementById('btn-open-settings').addEventListener('click', () => { AudioEngine.tap(); document.getElementById('modal-settings').classList.remove('hidden'); });
    document.querySelectorAll('.close-btn').forEach(b => b.addEventListener('click', (e) => { document.getElementById(e.target.dataset.close).classList.add('hidden'); }));
    document.getElementById('toggle-theme').addEventListener('change', e => { GameState.settings.darkMode = e.target.checked; applyTheme(); StorageManager.save(); });
    document.getElementById('toggle-sound').addEventListener('change', e => { GameState.settings.sound = e.target.checked; StorageManager.save(); });
    document.getElementById('btn-reset').addEventListener('click', () => {
        if(confirm("پیشرفت شما حذف خواهد شد. ادامه می‌دهید؟")) {
            GameState.globalScore = 0; GameState.progress = {}; GameState.unlockedMedals = [];
            StorageManager.save(); applyTheme(); renderHome();
            document.getElementById('modal-settings').classList.add('hidden');
        }
    });
}

window.addEventListener('DOMContentLoaded', async () => {
    // Inject Eitaa User Data
    if (window.Eitaa && window.Eitaa.WebApp && window.Eitaa.WebApp.initDataUnsafe?.user) {
        GameState.user = window.Eitaa.WebApp.initDataUnsafe.user;
        window.Eitaa.WebApp.ready();
        window.Eitaa.WebApp.expand();
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
        applyTheme();
        setupEvents();
        renderHome();
    });
});