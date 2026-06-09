/**
 * iOS-Style Emoji Guessing Game
 * Engine: Pure Vanilla JS (ES6+)
 * Framework-less, highly optimized.
 */

const PERSIAN_ALPHABET = "ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی";
const HINT_COST = 20;
const BASE_SCORE = 10;
const FAST_TIME_LIMIT = 15; // seconds

/* =========================================
   1. Database & State Definitions
========================================= */
let DB = { categories: [] };

const GameState = {
    user: { id: 'guest', first_name: 'کاربر مهمان' },
    globalScore: 0,
    progress: {}, // { categoryId: [0, 1, 3] } -> array of completed level indices
    unlockedMedals: [], // array of medal IDs
    settings: { sound: true, darkMode: false },
    // Runtime properties (Not saved)
    activeCategory: null,
    activeLevelIndex: 0,
    startTime: 0,
    slots: [],
    keys: []
};

// Achievements System Thresholds
const MEDALS_DB = [
    { id: 'first_blood', name: 'اولین قدم', icon: '🥉', desc: 'اولین مرحله را حل کن', check: (state) => getTotalCompleted(state) >= 1 },
    { id: 'proverbs_novice', name: 'ضرب‌المثل آموز', icon: '📜', desc: '۵ ضرب‌المثل را حل کن', check: (state) => (state.progress['proverbs']?.length || 0) >= 5 },
    { id: 'proverbs_master', name: 'استاد کهن', icon: '👑', desc: '۱۵ ضرب‌المثل را حل کن', check: (state) => (state.progress['proverbs']?.length || 0) >= 15 },
    { id: 'movie_buff', name: 'عشق سینما', icon: '🍿', desc: '۵ فیلم را حدس بزن', check: (state) => (state.progress['movies']?.length || 0) >= 5 },
    { id: 'globetrotter', name: 'جهانگرد', icon: '🌍', desc: '۵ کشور را حدس بزن', check: (state) => (state.progress['countries']?.length || 0) >= 5 },
    { id: 'rich', name: 'ثروتمند', icon: '💎', desc: '۵۰۰ امتیاز کسب کن', check: (state) => state.globalScore >= 500 }
];

function getTotalCompleted(state) {
    return Object.values(state.progress).reduce((sum, arr) => sum + arr.length, 0);
}

/* =========================================
   2. Audio Engine (Web Audio API)
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
   3. Data Storage (Eitaa Cloud + Local)
========================================= */
const StorageManager = {
    getKey: () => `ios_emoji_game_${GameState.user.id}`,
    save: function() {
        const payload = JSON.stringify({
            globalScore: GameState.globalScore,
            progress: GameState.progress,
            unlockedMedals: GameState.unlockedMedals,
            settings: GameState.settings
        });
        
        if (window.Eitaa && window.Eitaa.WebApp && window.Eitaa.WebApp.CloudStorage) {
            window.Eitaa.WebApp.CloudStorage.setItem(this.getKey(), payload, () => {});
        }
        localStorage.setItem(this.getKey(), payload);
    },
    load: function(callback) {
        const applyData = (str) => {
            if (str) {
                try {
                    const data = JSON.parse(str);
                    GameState.globalScore = data.globalScore || 0;
                    GameState.progress = data.progress || {};
                    GameState.unlockedMedals = data.unlockedMedals || [];
                    GameState.settings = data.settings || GameState.settings;
                } catch(e) { console.error("Data parse error."); }
            }
            callback();
        };

        if (window.Eitaa && window.Eitaa.WebApp && window.Eitaa.WebApp.CloudStorage) {
            window.Eitaa.WebApp.CloudStorage.getItem(this.getKey(), (err, val) => {
                applyData((!err && val) ? val : localStorage.getItem(this.getKey()));
            });
        } else {
            applyData(localStorage.getItem(this.getKey()));
        }
    }
};

/* =========================================
   4. UI Management & Flow
========================================= */
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    window.scrollTo(0, 0);
}

function showToast(message, icon = '✨') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span style="font-size:1.5rem">${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);
    AudioEngine.medal();
    setTimeout(() => toast.remove(), 3500);
}

function applyTheme() {
    document.body.setAttribute('data-theme', GameState.settings.darkMode ? 'dark' : 'light');
    if (window.Eitaa && window.Eitaa.WebApp && window.Eitaa.WebApp.setHeaderColor) {
        window.Eitaa.WebApp.setHeaderColor(GameState.settings.darkMode ? '#000000' : '#f2f2f7');
    }
}

function checkMedals() {
    MEDALS_DB.forEach(medal => {
        if (!GameState.unlockedMedals.includes(medal.id) && medal.check(GameState)) {
            GameState.unlockedMedals.push(medal.id);
            showToast(`مدال جدید: ${medal.name}`, medal.icon);
        }
    });
}

/* =========================================
   5. Home Screen Logic
========================================= */
function renderHome() {
    document.getElementById('home-total-score').textContent = GameState.globalScore;
    document.getElementById('user-name').textContent = GameState.user.first_name;

    // Render Medals
    const medalsContainer = document.getElementById('medals-container');
    medalsContainer.innerHTML = '';
    MEDALS_DB.forEach(medal => {
        const isUnlocked = GameState.unlockedMedals.includes(medal.id);
        const div = document.createElement('div');
        div.className = `medal-card ${isUnlocked ? 'unlocked' : ''}`;
        div.innerHTML = `
            <span class="medal-icon">${medal.icon}</span>
            <span class="medal-name">${medal.name}</span>
        `;
        medalsContainer.appendChild(div);
    });
    document.getElementById('medals-count').textContent = `${GameState.unlockedMedals.length}/${MEDALS_DB.length}`;

    // Render Categories
    const catContainer = document.getElementById('categories-container');
    catContainer.innerHTML = '';
    
    DB.categories.forEach(cat => {
        const completed = GameState.progress[cat.id]?.length || 0;
        const total = cat.levels.length;
        const perc = total > 0 ? (completed / total) * 100 : 0;
        const isComplete = completed === total && total > 0;

        const div = document.createElement('div');
        div.className = `category-card ${isComplete ? 'completed' : ''}`;
        div.innerHTML = `
            <div class="cat-icon">${cat.icon}</div>
            <div class="cat-info">
                <h3 class="cat-title">${cat.name}</h3>
                <div class="cat-stats">${completed} از ${total} مرحله</div>
                <div class="progress-track">
                    <div class="progress-fill" style="width: ${perc}%"></div>
                </div>
            </div>
        `;
        div.addEventListener('click', () => {
            AudioEngine.tap();
            startCategory(cat);
        });
        catContainer.appendChild(div);
    });
}

/* =========================================
   6. Game Logic
========================================= */
function normalizeText(text) {
    return text.replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim();
}

function startCategory(category) {
    GameState.activeCategory = category;
    document.getElementById('game-category-title').textContent = category.name;
    
    // Find first uncompleted level, or loop back to 0
    let completedArr = GameState.progress[category.id] || [];
    let nextIndex = 0;
    for(let i=0; i < category.levels.length; i++) {
        if(!completedArr.includes(i)) {
            nextIndex = i;
            break;
        }
    }
    GameState.activeLevelIndex = nextIndex;
    showScreen('screen-game');
    renderLevel();
}

function renderLevel() {
    const cat = GameState.activeCategory;
    // Loop if finished all
    if (GameState.activeLevelIndex >= cat.levels.length) GameState.activeLevelIndex = 0;

    const levelData = cat.levels[GameState.activeLevelIndex];
    const answer = normalizeText(levelData.answer);
    
    document.getElementById('ui-level').textContent = GameState.activeLevelIndex + 1;
    document.getElementById('game-score').textContent = GameState.globalScore;
    document.getElementById('emoji-display').textContent = levelData.emoji;

    // Build Slots
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

    // Build Keyboard
    let keyChars = [...requiredChars];
    const targetKeyCount = Math.max(24, requiredChars.length + 6);
    while(keyChars.length < targetKeyCount) {
        keyChars.push(PERSIAN_ALPHABET[Math.floor(Math.random() * PERSIAN_ALPHABET.length)]);
    }
    // Shuffle
    for (let i = keyChars.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [keyChars[i], keyChars[j]] = [keyChars[j], keyChars[i]];
    }

    GameState.keys = keyChars.map((c, i) => ({ id: i, char: c, used: false }));
    const kbArea = document.getElementById('keyboard');
    kbArea.innerHTML = '';
    
    GameState.keys.forEach(k => {
        const btn = document.createElement('button');
        btn.className = 'key pop-in';
        btn.id = `key-${k.id}`;
        btn.textContent = k.char;
        btn.style.animationDelay = `${Math.random() * 0.15}s`;
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
        if(!el) return;
        el.textContent = s.filledWith;
        el.className = `slot ${s.filledWith ? 'filled' : ''} ${s.locked ? 'locked' : ''}`;
    });
    GameState.keys.forEach(k => {
        const el = document.getElementById(`key-${k.id}`);
        if(!el) return;
        el.className = `key ${k.used ? 'used' : ''}`;
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
        // Find a slot that wrongly used this correct character
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
        
        // Save progress
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
   7. Bootstrapping & Listeners
========================================= */
async function loadDB() {
    try {
        const res = await fetch('data.json');
        if (!res.ok) throw new Error("JSON Network error");
        DB = await res.json();
    } catch (e) {
        console.warn("Using fallback local data.");
        // Fallback data if JSON fails to load
        DB = {
            categories: [
                { id: "proverbs", name: "ضرب‌المثل‌ها", icon: "🎭", levels: [{ emoji: "👂🏻🚪👂🏻🥅", answer: "یه گوشش دره یه گوشش دروازه" }] },
                { id: "movies", name: "فیلم و سریال", icon: "🎬", levels: [{ emoji: "🕷️👨🏻", answer: "مرد عنکبوتی" }] }
            ]
        };
    }
}

function setupEvents() {
    // Nav
    document.getElementById('btn-back-home').addEventListener('click', () => { AudioEngine.tap(); renderHome(); showScreen('screen-home'); });
    document.getElementById('btn-next-level').addEventListener('click', () => {
        AudioEngine.tap();
        document.getElementById('modal-success').classList.add('hidden');
        GameState.activeLevelIndex++;
        renderLevel();
    });
    document.getElementById('btn-hint').addEventListener('click', useHint);

    // Settings
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
    // Init Eitaa SDK
    if (window.Eitaa && window.Eitaa.WebApp) {
        const app = window.Eitaa.WebApp;
        app.ready(); app.expand();
        if (app.initDataUnsafe?.user) GameState.user = app.initDataUnsafe.user;
    }

    await loadDB();
    StorageManager.load(() => {
        document.getElementById('toggle-theme').checked = GameState.settings.darkMode;
        document.getElementById('toggle-sound').checked = GameState.settings.sound;
        applyTheme();
        setupEvents();
        renderHome();
    });
});