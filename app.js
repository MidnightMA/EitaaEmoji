/**
 * Emoji Proverb Game
 * Engine: Pure Vanilla JS
 * Environment: Eitaa Mini App / Web App
 */

/* =========================================
   1. Game Constants & Sound Engine
========================================= */
const PERSIAN_ALPHABET = "ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی";
const HINT_COST = 20;
const BASE_SCORE = 10;
const FAST_BONUS = 5;
const FAST_TIME_LIMIT = 15; // seconds

// Built-in WebAudio Synthesizer for zero-dependency sounds
const AudioEngine = (function() {
    let audioCtx = null;

    function init() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    function playTone(frequency, type, duration, vol = 0.1) {
        if (!GameState.settings.sound) return;
        init();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
        
        gainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + duration);
    }

    return {
        click: () => playTone(600, 'sine', 0.1, 0.05),
        slotClick: () => playTone(400, 'triangle', 0.1, 0.05),
        error: () => playTone(150, 'sawtooth', 0.3, 0.1),
        success: () => {
            playTone(400, 'sine', 0.1, 0.1);
            setTimeout(() => playTone(500, 'sine', 0.1, 0.1), 100);
            setTimeout(() => playTone(650, 'sine', 0.2, 0.1), 200);
        },
        hint: () => {
            playTone(800, 'sine', 0.1, 0.05);
            setTimeout(() => playTone(1200, 'sine', 0.2, 0.05), 100);
        }
    };
})();

/* =========================================
   2. Utilities & Text Normalization
========================================= */
function normalizePersian(text) {
    if (!text) return "";
    return text.replace(/ي/g, "ی")
               .replace(/ك/g, "ک")
               .replace(/[\u200B-\u200D\uFEFF]/g, "") // Remove zero-width spaces
               .replace(/\s+/g, " ") // Normalize standard spaces
               .trim();
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/* =========================================
   3. State & Storage Manager
========================================= */
const GameState = {
    user: { id: 'local_guest', first_name: 'مهمان' },
    currentLevel: 0,
    score: 0,
    completedLevels: [],
    settings: { sound: true, darkMode: false },
    questions: [],
    startTime: 0,
    // Active Level State
    slots: [], // Flat array of slot objects
    keys: []   // Array of keyboard key objects
};

const StorageManager = {
    getStorageKey: () => `eitaa_emoji_game_${GameState.user.id}`,

    save: function() {
        const data = {
            currentLevel: GameState.currentLevel,
            score: GameState.score,
            completedLevels: GameState.completedLevels,
            settings: GameState.settings,
            lastPlayed: new Date().toISOString()
        };
        const strData = JSON.stringify(data);

        // Try Eitaa Cloud Storage first
        if (window.Eitaa && window.Eitaa.WebApp && window.Eitaa.WebApp.CloudStorage) {
            window.Eitaa.WebApp.CloudStorage.setItem(this.getStorageKey(), strData, (err, success) => {
                if(err) console.warn("CloudStorage error, falling back to LocalStorage.");
            });
        }
        // Always save to LocalStorage as a fallback
        localStorage.setItem(this.getStorageKey(), strData);
    },

    load: function(callback) {
        const defaultState = { currentLevel: 0, score: 0, completedLevels: [], settings: { sound: true, darkMode: false } };
        
        const parseAndApply = (str) => {
            if (str) {
                try {
                    const parsed = JSON.parse(str);
                    GameState.currentLevel = parsed.currentLevel || 0;
                    GameState.score = parsed.score || 0;
                    GameState.completedLevels = parsed.completedLevels || [];
                    GameState.settings = parsed.settings || defaultState.settings;
                } catch(e) { console.error("Parse error", e); }
            }
            callback();
        };

        if (window.Eitaa && window.Eitaa.WebApp && window.Eitaa.WebApp.CloudStorage) {
            window.Eitaa.WebApp.CloudStorage.getItem(this.getStorageKey(), (err, value) => {
                if (!err && value) {
                    parseAndApply(value);
                } else {
                    parseAndApply(localStorage.getItem(this.getStorageKey()));
                }
            });
        } else {
            parseAndApply(localStorage.getItem(this.getStorageKey()));
        }
    }
};

/* =========================================
   4. Initialization & Eitaa Integration
========================================= */
function initEitaa() {
    if (typeof window.Eitaa !== 'undefined' && window.Eitaa.WebApp) {
        const webapp = window.Eitaa.WebApp;
        webapp.ready();
        webapp.expand();
        
        if (webapp.setHeaderColor) {
            webapp.setHeaderColor(GameState.settings.darkMode ? '#1e1e28' : '#ffffff');
        }
        
        if (webapp.initDataUnsafe && webapp.initDataUnsafe.user) {
            GameState.user = webapp.initDataUnsafe.user;
        }
    }
}

async function loadQuestions() {
    try {
        const response = await fetch('questions.json');
        if (!response.ok) throw new Error("Network response was not ok");
        GameState.questions = await response.json();
    } catch (error) {
        console.warn("Failed to load questions.json, using inline fallback data.", error);
        GameState.questions = [
            { "emoji": "👂🏻🚪👂🏻🥅", "answer": "یه گوشش دره یه گوشش دروازه" },
            { "emoji": "💧💧➕🌊", "answer": "قطره قطره جمع گردد وانگهی دریا شود" },
            { "emoji": "🐫💤☁️🌱", "answer": "شتر در خواب بیند پنبه دانه" },
            { "emoji": "⛰️❌⛰️👤✅👤", "answer": "کوه به کوه نمیرسه آدم به آدم میرسه" },
            { "emoji": "🐁❌🕳️🧹🪢", "answer": "موش تو سوراخ نمیرفت جارو به دمش میبست" }
        ];
    }
}

function applySettings() {
    document.body.setAttribute('data-theme', GameState.settings.darkMode ? 'dark' : 'light');
    document.getElementById('toggle-theme').checked = GameState.settings.darkMode;
    document.getElementById('toggle-sound').checked = GameState.settings.sound;
    
    if (window.Eitaa && window.Eitaa.WebApp && window.Eitaa.WebApp.setHeaderColor) {
        window.Eitaa.WebApp.setHeaderColor(GameState.settings.darkMode ? '#1e1e28' : '#ffffff');
    }
}

/* =========================================
   5. Game Logic & Rendering
========================================= */
function renderLevel() {
    // If completed all questions
    if (GameState.currentLevel >= GameState.questions.length) {
        GameState.currentLevel = 0; // Loop around for endless mode
    }

    const q = GameState.questions[GameState.currentLevel];
    const answer = normalizePersian(q.answer);
    
    // UI updates
    document.getElementById('ui-level').textContent = GameState.currentLevel + 1;
    document.getElementById('ui-score').textContent = GameState.score;
    document.getElementById('emoji-display').textContent = q.emoji;
    
    // Progress bar
    const progressPerc = ((GameState.currentLevel) / GameState.questions.length) * 100;
    document.getElementById('ui-progress-fill').style.width = `${progressPerc}%`;

    // Process Answer Slots
    const words = answer.split(' ');
    const answerArea = document.getElementById('answer-slots');
    answerArea.innerHTML = '';
    
    GameState.slots = [];
    let slotIdCounter = 0;
    let requiredChars = [];

    words.forEach(word => {
        const wordGroup = document.createElement('div');
        wordGroup.className = 'word-group';
        
        for (let char of word) {
            const slotObj = { id: slotIdCounter++, char: char, filledWith: '', keyId: null, locked: false };
            GameState.slots.push(slotObj);
            requiredChars.push(char);

            const slotEl = document.createElement('div');
            slotEl.className = 'slot';
            slotEl.id = `slot-${slotObj.id}`;
            slotEl.addEventListener('click', () => handleSlotClick(slotObj.id));
            wordGroup.appendChild(slotEl);
        }
        answerArea.appendChild(wordGroup);
    });

    // Generate Keyboard
    let keyChars = [...requiredChars];
    const totalKeys = Math.max(24, requiredChars.length + 6);
    while(keyChars.length < totalKeys) {
        keyChars.push(PERSIAN_ALPHABET[Math.floor(Math.random() * PERSIAN_ALPHABET.length)]);
    }
    shuffleArray(keyChars);

    GameState.keys = keyChars.map((char, idx) => ({ id: idx, char: char, used: false }));
    
    const kbArea = document.getElementById('keyboard');
    kbArea.innerHTML = '';
    
    GameState.keys.forEach(k => {
        const keyEl = document.createElement('button');
        keyEl.className = 'key bounce-in';
        keyEl.id = `key-${k.id}`;
        keyEl.textContent = k.char;
        keyEl.style.animationDelay = `${Math.random() * 0.2}s`;
        keyEl.addEventListener('click', () => handleKeyClick(k.id));
        kbArea.appendChild(keyEl);
    });

    GameState.startTime = Date.now();
    updateUI();
}

function updateUI() {
    // Update Score
    document.getElementById('ui-score').textContent = GameState.score;

    // Update Slots
    GameState.slots.forEach(s => {
        const el = document.getElementById(`slot-${s.id}`);
        if (!el) return;
        el.textContent = s.filledWith;
        if (s.filledWith !== '') el.classList.add('filled');
        else el.classList.remove('filled');
        
        if (s.locked) el.classList.add('locked');
        else el.classList.remove('locked');
    });

    // Update Keyboard Keys
    GameState.keys.forEach(k => {
        const el = document.getElementById(`key-${k.id}`);
        if (!el) return;
        if (k.used) el.classList.add('used');
        else el.classList.remove('used');
    });
}

/* =========================================
   6. Interactions
========================================= */
function handleKeyClick(keyId) {
    const key = GameState.keys.find(k => k.id === keyId);
    if (!key || key.used) return;

    const firstEmptySlot = GameState.slots.find(s => s.filledWith === '');
    if (!firstEmptySlot) return; // All slots full

    AudioEngine.click();
    firstEmptySlot.filledWith = key.char;
    firstEmptySlot.keyId = key.id;
    key.used = true;

    updateUI();
    checkWinCondition();
}

function handleSlotClick(slotId) {
    const slot = GameState.slots.find(s => s.id === slotId);
    if (!slot || slot.filledWith === '' || slot.locked) return;

    AudioEngine.slotClick();
    const key = GameState.keys.find(k => k.id === slot.keyId);
    if (key) key.used = false;

    slot.filledWith = '';
    slot.keyId = null;

    updateUI();
}

function useHint() {
    if (GameState.score < HINT_COST) {
        alert("امتیاز شما برای استفاده از راهنما کافی نیست.");
        return;
    }

    // Find slots that are neither locked nor correctly filled
    const candidateSlots = GameState.slots.filter(s => !s.locked && s.filledWith !== s.char);
    if (candidateSlots.length === 0) return;

    const targetSlot = candidateSlots[Math.floor(Math.random() * candidateSlots.length)];

    // Free the wrong key if slot is occupied
    if (targetSlot.filledWith !== '') {
        const wrongKey = GameState.keys.find(k => k.id === targetSlot.keyId);
        if (wrongKey) wrongKey.used = false;
        targetSlot.filledWith = '';
        targetSlot.keyId = null;
    }

    const correctChar = targetSlot.char;
    let validKeyIndex = GameState.keys.findIndex(k => k.char === correctChar && !k.used);

    // If key not found, it means it's used in another incorrect slot
    if (validKeyIndex === -1) {
        const wronglyUsedSlot = GameState.slots.find(s => !s.locked && s.filledWith === correctChar && s.char !== correctChar);
        if (wronglyUsedSlot) {
            validKeyIndex = wronglyUsedSlot.keyId;
            wronglyUsedSlot.filledWith = '';
            wronglyUsedSlot.keyId = null;
            const freedKey = GameState.keys.find(k => k.id === validKeyIndex);
            if(freedKey) freedKey.used = false;
        } else {
            // Edge case fallback
            const anyUsedSlot = GameState.slots.find(s => !s.locked && s.filledWith === correctChar);
            if(anyUsedSlot) {
                 validKeyIndex = anyUsedSlot.keyId;
                 anyUsedSlot.filledWith = '';
                 anyUsedSlot.keyId = null;
                 const freedKey = GameState.keys.find(k => k.id === validKeyIndex);
                 if(freedKey) freedKey.used = false;
            }
        }
    }

    if (validKeyIndex !== -1) {
        GameState.score -= HINT_COST;
        targetSlot.filledWith = correctChar;
        targetSlot.keyId = validKeyIndex;
        targetSlot.locked = true;
        GameState.keys.find(k => k.id === validKeyIndex).used = true;

        AudioEngine.hint();
        updateUI();
        checkWinCondition();
    }
}

function checkWinCondition() {
    if (GameState.slots.some(s => s.filledWith === '')) return;

    const isCorrect = GameState.slots.every(s => s.filledWith === s.char);
    if (isCorrect) {
        handleWin();
    } else {
        handleWrong();
    }
}

function handleWrong() {
    AudioEngine.error();
    const area = document.getElementById('answer-slots');
    area.classList.remove('shake');
    void area.offsetWidth; // Trigger reflow
    area.classList.add('shake');
}

function handleWin() {
    AudioEngine.success();
    
    const timeTaken = (Date.now() - GameState.startTime) / 1000;
    const bonus = timeTaken <= FAST_TIME_LIMIT ? FAST_BONUS : 0;
    
    GameState.score += BASE_SCORE + bonus;
    if (!GameState.completedLevels.includes(GameState.currentLevel)) {
        GameState.completedLevels.push(GameState.currentLevel);
    }
    
    StorageManager.save();

    // Show win modal
    document.getElementById('reward-base').textContent = `+${BASE_SCORE}`;
    const bonusEl = document.getElementById('reward-bonus');
    if (bonus > 0) {
        bonusEl.classList.remove('hidden');
        bonusEl.innerHTML = `پاداش سرعت: <strong>+${bonus}</strong>`;
    } else {
        bonusEl.classList.add('hidden');
    }
    document.getElementById('modal-success').classList.remove('hidden');
}

function nextLevel() {
    document.getElementById('modal-success').classList.add('hidden');
    GameState.currentLevel++;
    StorageManager.save();
    renderLevel();
}

/* =========================================
   7. UI Event Listeners binding
========================================= */
function setupListeners() {
    document.getElementById('btn-hint').addEventListener('click', useHint);
    document.getElementById('btn-next-level').addEventListener('click', nextLevel);
    
    // Modals
    document.getElementById('btn-settings').addEventListener('click', () => {
        document.getElementById('modal-settings').classList.remove('hidden');
    });
    document.getElementById('btn-stats').addEventListener('click', () => {
        document.getElementById('stat-user').textContent = GameState.user.first_name;
        document.getElementById('stat-completed').textContent = GameState.completedLevels.length;
        document.getElementById('stat-total-score').textContent = GameState.score;
        const perc = GameState.questions.length ? Math.round((GameState.completedLevels.length / GameState.questions.length) * 100) : 0;
        document.getElementById('stat-percentage').textContent = `${perc}%`;
        document.getElementById('modal-stats').classList.remove('hidden');
    });

    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.target.getAttribute('data-close');
            document.getElementById(targetId).classList.add('hidden');
        });
    });

    // Settings
    document.getElementById('toggle-theme').addEventListener('change', (e) => {
        GameState.settings.darkMode = e.target.checked;
        applySettings();
        StorageManager.save();
    });
    document.getElementById('toggle-sound').addEventListener('change', (e) => {
        GameState.settings.sound = e.target.checked;
        StorageManager.save();
    });
    document.getElementById('btn-reset').addEventListener('click', () => {
        if(confirm("آیا مطمئن هستید که می‌خواهید تمام پیشرفت خود را پاک کنید؟")) {
            GameState.currentLevel = 0;
            GameState.score = 0;
            GameState.completedLevels = [];
            StorageManager.save();
            document.getElementById('modal-settings').classList.add('hidden');
            renderLevel();
        }
    });
}

/* =========================================
   8. Bootstrapping
========================================= */
async function boot() {
    initEitaa();
    await loadQuestions();
    
    StorageManager.load(() => {
        applySettings();
        setupListeners();
        renderLevel();
    });
}

// Start Game
window.addEventListener('DOMContentLoaded', boot);