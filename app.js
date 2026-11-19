/*
 * Razak — emoji guessing mini-app for Eitaa.
 * Plain ES2020, no build step. Settings live in config.js.
 */
(function () {
    'use strict';

    const CFG = window.RAZAK_CONFIG || {};
    const VERSION = CFG.version || '2.0.0';
    const ECON = Object.assign({
        hintCost: 150,
        levelReward: 100,
        categoryReward: {},
        dailyChallengeReward: 500,
        dailyGift: { min: 100, max: 850 }
    }, CFG.economy);

    const isRealBucket = id => !!id && id !== 'YOUR_BUCKET_ID_HERE';
    const BUCKET = isRealBucket(CFG.kvdbBucket) ? CFG.kvdbBucket : null;
    const SUGGEST_BUCKET = isRealBucket(CFG.suggestionsBucket) ? CFG.suggestionsBucket : BUCKET;
    const FEEDBACK_URL = CFG.feedbackUrl || 'https://eitaa.com/ferstadeh';

    // Old saves stored 1/10 of today's coin values; records without this flag get migrated once.
    const ECONOMY_VERSION = 2;
    const ECONOMY_MULTIPLIER = 10;
    const LETTERS = 'ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی';

    /* ---------------------------------------------------------------- utils */

    const $ = id => document.getElementById(id);
    const $$ = (sel, root) => (root || document).querySelectorAll(sel);
    const FA = '۰۱۲۳۴۵۶۷۸۹';
    const fa = v => String(v).replace(/\d/g, d => FA[d]);
    const faNum = n => fa(String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '٬'));
    const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
    const rand = n => Math.floor(Math.random() * n);
    const pad = n => String(n).padStart(2, '0');
    const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const todayKey = () => dateKey(new Date());
    const idle = window.requestIdleCallback
        ? fn => window.requestIdleCallback(fn, { timeout: 2000 })
        : fn => setTimeout(fn, 300);

    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = rand(i + 1);
            const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
    }

    const store = {
        get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
    };

    const webApp = () => (window.Eitaa && window.Eitaa.WebApp) || null;

    function fetchWithTimeout(url, opts, ms) {
        if (!window.AbortController) return fetch(url, opts);
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), ms);
        return fetch(url, Object.assign({}, opts, { signal: ctrl.signal })).finally(() => clearTimeout(t));
    }

    // Weak phones get a still background and lighter effects.
    const LITE = (() => {
        try {
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
            const cores = navigator.hardwareConcurrency || 8;
            const mem = navigator.deviceMemory || 8;
            return cores <= 4 || mem <= 2;
        } catch (e) { return false; }
    })();
    if (LITE) document.documentElement.classList.add('lite');

    /* ---------------------------------------------------------------- state */

    const DEFAULT_SETTINGS = { sound: true, darkMode: false, gender: null, avatarId: null, displayName: null };

    const S = {
        user: { id: 'guest', first_name: 'کاربر مهمان', photo_url: null },
        globalScore: 0,
        totalEarned: 0,
        progress: {},      // { catId: [solved level indexes] }
        levelStats: {},    // { catId: { index: { hints, stars } } }
        unlockedMedals: [],
        settings: Object.assign({}, DEFAULT_SETTINGS),
        dailyChallenge: { lastCompletedDate: null, completedCount: 0 },
        joinGate: { confirmedChannelId: null, confirmedWeekNumber: null },
        rewards: {
            daily: { weekStartKey: null, claimedDaysThisWeek: [], lastGrantedDateKey: null },
            channels: {}
        }
    };
    window.GameState = S; // handy from the console

    let DB = { categories: [], wordBank: [] };
    let appReady = false;

    const doneCache = new Map();
    function doneSet(catId) {
        let set = doneCache.get(catId);
        if (!set) {
            set = new Set(S.progress[catId] || []);
            doneCache.set(catId, set);
        }
        return set;
    }
    const isDone = (catId, i) => doneSet(catId).has(i);
    function markDone(catId, i) {
        if (!S.progress[catId]) S.progress[catId] = [];
        S.progress[catId].push(i);
        doneSet(catId).add(i);
    }
    function doneCount(cat) {
        let n = 0;
        doneSet(cat.id).forEach(i => { if (i < cat.levels.length) n++; });
        return n;
    }
    function isUnlocked(cat, i) {
        if (!cat || i < 0 || i >= cat.levels.length) return false;
        return i === 0 || isDone(cat.id, i) || isDone(cat.id, i - 1);
    }
    function firstUnsolved(cat) {
        const set = doneSet(cat.id);
        for (let i = 0; i < cat.levels.length; i++) if (!set.has(i)) return i;
        return -1;
    }
    const totalLevels = () => DB.categories.reduce((s, c) => s + c.levels.length, 0);
    const totalSolved = () => DB.categories.reduce((s, c) => s + doneCount(c), 0);

    // stars: 3 without hints, 2 with 1–3 hints, 1 otherwise
    const starsFor = hints => (hints <= 0 ? 3 : hints <= 3 ? 2 : 1);
    function levelStat(catId, i) {
        const c = S.levelStats[catId];
        return (c && c[i]) || null;
    }
    function ensureStat(catId, i) {
        if (!S.levelStats[catId]) S.levelStats[catId] = {};
        if (!S.levelStats[catId][i]) S.levelStats[catId][i] = { hints: 0 };
        return S.levelStats[catId][i];
    }
    function levelHints(catId, i) {
        const s = levelStat(catId, i);
        return s && typeof s.hints === 'number' ? s.hints : 0;
    }
    function levelStars(catId, i) {
        if (!isDone(catId, i)) return 0;
        const s = levelStat(catId, i);
        return s && typeof s.stars === 'number' ? s.stars : 3; // solved before stars existed
    }
    function categoryStars(cat) {
        let sum = 0;
        doneSet(cat.id).forEach(i => { if (i < cat.levels.length) sum += levelStars(cat.id, i); });
        return sum;
    }
    const totalStars = () => DB.categories.reduce((s, c) => s + categoryStars(c), 0);

    function addCoins(amount) {
        S.globalScore += amount;
        S.totalEarned += amount;
    }

    /* -------------------------------------------------------------- storage */

    const Storage = {
        ready: false, // never write before a successful load, or we could wipe a real record
        timer: 0,
        pending: false,

        key: () => `eitaa_game_${S.user.id}`,
        cloudUrl: suffix => `https://kvdb.io/${BUCKET}/${S.user.id}${suffix || ''}`,
        hasCloud: () => !!BUCKET && S.user.id !== 'guest',

        payload() {
            return JSON.stringify({
                globalScore: S.globalScore,
                totalEarned: S.totalEarned,
                economyVersion: ECONOMY_VERSION,
                progress: S.progress,
                levelStats: S.levelStats,
                unlockedMedals: S.unlockedMedals,
                settings: S.settings,
                dailyChallenge: S.dailyChallenge,
                joinGate: S.joinGate,
                rewards: S.rewards
            });
        },

        save() {
            if (!this.ready) return;
            store.set(this.key(), this.payload());
            if (!this.hasCloud()) return;
            this.pending = true;
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this.flush(), 1200);
        },

        flush(keepalive) {
            clearTimeout(this.timer);
            if (!this.pending || !this.ready || !this.hasCloud()) return;
            this.pending = false;
            fetch(this.cloudUrl(), { method: 'PUT', body: this.payload(), keepalive: !!keepalive })
                .catch(() => { this.pending = true; });
        },

        migrateEconomy(data, raw) {
            const gs = Number(data.globalScore) || 0;
            const te = typeof data.totalEarned === 'number' ? data.totalEarned : gs;
            const ngs = gs * ECONOMY_MULTIPLIER;
            const nte = te * ECONOMY_MULTIPLIER;
            if (gs < 0 || te < 0 || !Number.isSafeInteger(ngs) || !Number.isSafeInteger(nte)) {
                console.error('economy migration skipped, bad values', gs, te);
                return null;
            }
            store.set(this.key() + '_backup_pre_x10', raw);
            if (this.hasCloud()) {
                fetch(this.cloudUrl('_backup_pre_x10'), { method: 'PUT', body: raw }).catch(() => {});
            }
            return { globalScore: ngs, totalEarned: nte };
        },

        apply(data, raw) {
            const migrated = Math.max(Number(data.economyVersion) || 0,
                Number(data.settings && data.settings.economyVersion) || 0) >= ECONOMY_VERSION;
            const upgrade = migrated ? null : this.migrateEconomy(data, raw);

            S.globalScore = Number(data.globalScore) || 0;
            S.totalEarned = typeof data.totalEarned === 'number' ? data.totalEarned : S.globalScore;
            if (upgrade) {
                S.globalScore = upgrade.globalScore;
                S.totalEarned = upgrade.totalEarned;
            }
            S.progress = data.progress && typeof data.progress === 'object' ? data.progress : {};
            S.levelStats = data.levelStats && typeof data.levelStats === 'object' ? data.levelStats : {};
            S.unlockedMedals = Array.isArray(data.unlockedMedals) ? data.unlockedMedals : [];
            S.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings || {});
            S.dailyChallenge = data.dailyChallenge || { lastCompletedDate: null, completedCount: 0 };
            S.joinGate = data.joinGate || { confirmedChannelId: null, confirmedWeekNumber: null };
            const r = data.rewards || {};
            S.rewards = {
                daily: Object.assign({ weekStartKey: null, claimedDaysThisWeek: [], lastGrantedDateKey: null }, r.daily),
                channels: r.channels || {}
            };
            doneCache.clear();

            this.ready = true;
            if (migrated || upgrade) S.settings.economyVersion = ECONOMY_VERSION;
            if (upgrade) this.save();
        },

        async load() {
            let raw = null;
            let cloudFailed = false;
            if (this.hasCloud()) {
                try {
                    const res = await fetchWithTimeout(this.cloudUrl(), {}, 7000);
                    if (res.ok) raw = await res.text();
                    else if (res.status !== 404) cloudFailed = true;
                } catch (e) {
                    cloudFailed = true;
                }
            }
            if (!raw) raw = store.get(this.key());

            if (raw) {
                try {
                    this.apply(JSON.parse(raw), raw);
                } catch (e) {
                    // corrupt record: keep saving locked so we don't overwrite it
                    console.error('saved data is unreadable, writes disabled', e);
                    this.ready = false;
                }
            } else if (cloudFailed) {
                this.ready = false;
                toast('⚠️', 'مشکل در اتصال به سرور؛ پیشرفت شما بارگذاری نشد');
            } else {
                this.ready = true; // genuinely new player
                S.settings.economyVersion = ECONOMY_VERSION;
            }
        }
    };

    /* ---------------------------------------------------------------- emoji */

    const EMOJI_BASE = (CFG.emoji && CFG.emoji.base) || 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.0.1/img/apple/64/';
    const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter
        ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : null;
    const FALLBACK_SPLIT = /(\p{Regional_Indicator}{2}|[0-9#*]️?⃣|\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*|\s+|.)/gu;
    const segCache = new Map();
    const badSrc = new Set();
    const warmed = new Set();

    function graphemes(text) {
        let out = segCache.get(text);
        if (out) return out;
        out = [];
        if (segmenter) {
            for (const part of segmenter.segment(text)) out.push(part.segment);
        } else {
            out = text.match(FALLBACK_SPLIT) || [];
        }
        segCache.set(text, out);
        return out;
    }

    function emojiUrls(seg) {
        const hex = [];
        for (const ch of seg) hex.push(ch.codePointAt(0).toString(16).padStart(4, '0'));
        // most files drop FE0F; keycaps and a few others keep it
        const lean = EMOJI_BASE + hex.filter(h => h !== 'fe0f').join('-') + '.png';
        const full = EMOJI_BASE + hex.join('-') + '.png';
        return badSrc.has(lean) ? [full, ''] : [lean, lean === full ? '' : full];
    }

    function emojiHTML(text) {
        let html = '';
        for (const seg of graphemes(text)) {
            if (!seg.trim()) continue;
            const urls = emojiUrls(seg);
            html += `<img class="emj" src="${urls[0]}" data-fb="${urls[1]}" alt="${esc(seg)}" draggable="false" decoding="async">`;
        }
        return html;
    }

    const paintEmoji = (el, text) => { el.innerHTML = emojiHTML(text); };

    function warmEmojis(text) {
        for (const seg of graphemes(text)) {
            if (!seg.trim()) continue;
            const src = emojiUrls(seg)[0];
            if (warmed.has(src)) continue;
            warmed.add(src);
            const img = new Image();
            img.onerror = () => badSrc.add(src);
            img.src = src;
        }
    }

    const EMOJI_RETRIES = 3;

    function toNative(img) {
        const span = document.createElement('span');
        span.className = 'emj-native';
        span.textContent = img.alt;
        img.replaceWith(span);
    }

    function retryEmoji(img) {
        const n = (+img.dataset.try || 0) + 1;
        if (n > EMOJI_RETRIES) { toNative(img); return; }
        img.dataset.try = n;
        const base = img.dataset.orig || img.getAttribute('src').split('?')[0];
        img.dataset.orig = base;
        setTimeout(() => {
            if (img.isConnected) img.src = `${base}?r=${n}`;
        }, 700 * n);
    }

    // One capture listener handles every broken emoji: try the alternate file name
    // first (some files keep FE0F), then retry the CDN a few times, then use the
    // system emoji so nothing stays blank.
    document.addEventListener('error', e => {
        const img = e.target;
        if (!img || img.tagName !== 'IMG' || !img.classList.contains('emj')) return;
        const failed = img.getAttribute('src');
        const fb = img.dataset.fb;
        if (fb && fb !== failed) {
            img.dataset.orig = failed.split('?')[0];
            img.dataset.fb = '';
            img.src = fb;
            return;
        }
        retryEmoji(img);
    }, true);

    // Requests that hang (no error, no load) get re-fired; images still missing
    // after that fall back to the system emoji.
    let watchToken = 0;
    function watchEmojis(root) {
        const token = ++watchToken;
        const pending = () => Array.from(root.querySelectorAll('img.emj')).filter(i => !i.complete || !i.naturalWidth);
        setTimeout(() => {
            if (token !== watchToken) return;
            pending().forEach(img => {
                const base = (img.dataset.orig || img.getAttribute('src')).split('?')[0];
                img.dataset.orig = base;
                img.src = `${base}?r=slow`;
            });
        }, 5000);
        setTimeout(() => {
            if (token === watchToken) pending().forEach(toNative);
        }, 12000);
    }

    /* ---------------------------------------------------------------- sound */

    const Sound = (() => {
        let ctx = null;
        let out = null;
        function audio() {
            if (!ctx) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return null;
                ctx = new AC();
                out = ctx.createGain();
                out.connect(ctx.destination);
            }
            if (ctx.state === 'suspended') ctx.resume();
            return ctx;
        }
        function tone(freq, type, dur, vol, delay) {
            if (!S.settings.sound) return;
            const c = audio();
            if (!c) return;
            const t = c.currentTime + (delay || 0);
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, t);
            gain.gain.setValueAtTime(vol || 0.05, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
            osc.connect(gain);
            gain.connect(out);
            osc.start(t);
            osc.stop(t + dur + 0.02);
        }
        return {
            tap: () => tone(600, 'sine', 0.08, 0.02),
            pop: () => tone(400, 'triangle', 0.1, 0.03),
            error: () => tone(150, 'sawtooth', 0.28, 0.045),
            success: () => { tone(523, 'sine', 0.12); tone(659, 'sine', 0.12, 0.05, 0.1); tone(784, 'sine', 0.22, 0.05, 0.2); },
            medal: () => { tone(500, 'sine', 0.1); tone(800, 'sine', 0.3, 0.05, 0.1); },
            coin: () => { tone(988, 'square', 0.06, 0.02); tone(1319, 'square', 0.14, 0.02, 0.06); }
        };
    })();

    function haptic(kind) {
        try {
            const h = webApp() && webApp().HapticFeedback;
            if (h) {
                if (kind === 'error' || kind === 'success') h.notificationOccurred(kind);
                else h.impactOccurred(kind || 'light');
                return;
            }
        } catch (e) { /* not supported */ }
        if (kind === 'error' && navigator.vibrate) navigator.vibrate(40);
    }

    /* ------------------------------------------------------------ ui basics */

    function toast(icon, text, ms) {
        const box = $('toasts');
        while (box.children.length >= 3) box.firstElementChild.remove();
        const el = document.createElement('div');
        el.className = 'toast';
        const i = document.createElement('span');
        i.className = 'toast__ico';
        i.textContent = icon;
        const t = document.createElement('span');
        t.textContent = text;
        el.append(i, t);
        box.appendChild(el);
        setTimeout(() => {
            el.classList.add('is-out');
            setTimeout(() => el.remove(), 320);
        }, ms || 3200);
    }

    const modalStack = [];
    function openModal(id) {
        const m = $(id);
        if (!m || m.classList.contains('is-open')) return;
        m.classList.add('is-open');
        modalStack.push(id);
        syncBackButton();
    }
    function closeModal(id) {
        const m = $(id);
        if (!m) return;
        m.classList.remove('is-open');
        const i = modalStack.lastIndexOf(id);
        if (i > -1) modalStack.splice(i, 1);
        if (id === 'modal-join') pendingJoin = null;
        syncBackButton();
    }
    const topModal = () => modalStack[modalStack.length - 1];

    let shownCoins = null;
    function syncCoins() {
        const text = faNum(S.globalScore);
        $$('[data-coins]').forEach(el => { el.textContent = text; });
        if (shownCoins !== null && S.globalScore > shownCoins) {
            const chip = document.querySelector('.screen.is-active .chip--coin');
            if (chip) {
                chip.classList.remove('bump');
                void chip.offsetWidth;
                chip.classList.add('bump');
            }
        }
        shownCoins = S.globalScore;
        const stars = faNum(totalStars());
        $$('[data-stars]').forEach(el => { el.textContent = stars; });
    }

    function openLink(url) {
        const wa = webApp();
        try {
            if (wa && typeof wa.openEitaaLink === 'function') return wa.openEitaaLink(url);
            if (wa && typeof wa.openLink === 'function') return wa.openLink(url);
        } catch (e) { /* fall through */ }
        window.open(url, '_blank', 'noopener');
    }

    function fx(build, life) {
        const layer = document.createElement('div');
        layer.className = 'fx';
        build(layer);
        document.body.appendChild(layer);
        setTimeout(() => layer.remove(), life);
    }

    function celebrate() {
        if (LITE) return;
        fx(layer => {
            const set = ['🎉', '⭐', '✨', '🪙', '🎊', '💫'];
            const n = 18;
            for (let i = 0; i < n; i++) {
                const p = document.createElement('span');
                p.className = 'confetti';
                p.textContent = set[i % set.length];
                const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
                const d = 110 + Math.random() * 140;
                p.style.cssText = `--tx:${Math.cos(a) * d}px;--ty:${Math.sin(a) * d + 60}px;--rot:${(Math.random() - 0.5) * 540}deg;animation-delay:${Math.random() * 0.1}s`;
                layer.appendChild(p);
            }
        }, 1500);
    }

    function flashWrong() {
        if (LITE) return;
        fx(layer => { layer.innerHTML = '<div class="flash"></div>'; }, 600);
    }

    function coinBurst(anchor) {
        if (!anchor || LITE) return;
        const r = anchor.getBoundingClientRect();
        fx(layer => {
            for (let i = 0; i < 9; i++) {
                const c = document.createElement('span');
                c.className = 'coin';
                c.textContent = '🪙';
                const a = (Math.PI * 2 * i) / 9 + Math.random() * 0.5;
                const d = 70 + Math.random() * 60;
                c.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 30}px;--rot:${Math.random() * 240 - 120}deg`;
                layer.appendChild(c);
            }
        }, 1000);
    }

    /* ---------------------------------------------------------- navigation */

    let current = 'home';
    let suggestReturn = 'home';

    function show(name) {
        const el = $('screen-' + name);
        if (!el) return;
        if (name !== current) {
            const prev = $('screen-' + current);
            if (prev) prev.classList.remove('is-active');
            el.classList.add('is-active');
            current = name;
            document.body.dataset.screen = name;
        }
        el.scrollTop = 0;
        const tab = el.dataset.tab;
        $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.tab === tab));
        if (name === 'home') Promo.start(); else Promo.stop();
        if (name === 'game') Ads.load();
        syncBackButton();
    }

    function syncBackButton() {
        const bb = webApp() && webApp().BackButton;
        if (!bb) return;
        try {
            if (current === 'home' && !modalStack.length) bb.hide(); else bb.show();
        } catch (e) { /* older SDK */ }
    }

    function goBack() {
        const m = topModal();
        if (m) {
            closeModal(m);
            if (m === 'modal-win') afterWin();
            return;
        }
        Sound.tap();
        if (current === 'game') {
            if (session.mode === 'level' && session.cat) openLevels(session.cat);
            else openHome();
        } else if (current === 'levels') {
            openCategories();
        } else if (current === 'suggest') {
            if (suggestReturn === 'categories') openCategories(); else openHome();
        } else {
            openHome();
        }
    }

    function openHome() { renderHome(); show('home'); }
    function openCategories() { renderCategories(); syncCoins(); show('categories'); }
    function openRewards() { renderMedals(); syncCoins(); show('rewards'); }
    function openProfile() { renderProfile(); syncCoins(); show('profile'); }

    function openTab(tab) {
        if ($('screen-' + current).dataset.tab === tab && current !== 'levels') {
            $('screen-' + current).scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        if (tab === 'home') openHome();
        else if (tab === 'levels') openCategories();
        else if (tab === 'rewards') openRewards();
        else if (tab === 'profile') openProfile();
    }

    /* ---------------------------------------------------------------- theme */

    function applyTheme() {
        const dark = !!S.settings.darkMode;
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
        store.set('razak_theme', dark ? 'dark' : 'light');
        const color = dark ? '#1b1154' : '#3b1f9c';
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = color;
        try {
            const wa = webApp();
            if (wa && wa.setHeaderColor) wa.setHeaderColor(color);
        } catch (e) { /* ignore */ }
    }

    /* --------------------------------------------------------------- avatar */

    const SHOULDERS = '<path d="M14 94 24 64h52l10 30z"/><circle cx="50" cy="36" r="19"/>';
    const HAIR = '<path d="M28 26Q50 2 72 26v8Q50 14 28 34z" opacity=".8"/>';
    const AVATAR_SVG = {
        neutral: `<svg viewBox="0 0 100 100" aria-hidden="true">${SHOULDERS}</svg>`,
        boy: `<svg viewBox="0 0 100 100" aria-hidden="true">${SHOULDERS}${HAIR}</svg>`,
        girl: `<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="19" y="28" width="13" height="42" rx="6.5" opacity=".8"/><rect x="68" y="28" width="13" height="42" rx="6.5" opacity=".8"/>${SHOULDERS}${HAIR}</svg>`
    };
    const AVATAR_CACHE = 'razak_avatar_cache_';
    const brokenAvatars = new Set();

    function readAvatarCache() {
        try {
            const c = JSON.parse(store.get(AVATAR_CACHE + S.user.id) || 'null');
            return c && typeof c.data === 'string' && c.data.indexOf('data:image/') === 0 ? c : null;
        } catch (e) { return null; }
    }

    // Keep a 128px copy of the Eitaa photo so it shows instantly next time.
    async function cacheAvatar(url) {
        try {
            const cached = readAvatarCache();
            if (cached && cached.src === url) return;
            const blob = await (await fetch(url, { mode: 'cors', credentials: 'omit' })).blob();
            const bmp = await createImageBitmap(blob);
            const size = 128;
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const side = Math.min(bmp.width, bmp.height);
            canvas.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
            const data = canvas.toDataURL('image/jpeg', 0.82);
            if (data.length < 60000) store.set(AVATAR_CACHE + S.user.id, JSON.stringify({ src: url, data, t: Date.now() }));
        } catch (e) { /* CORS or decode error: the live photo still works */ }
    }

    function avatarSrc() {
        if (S.settings.avatarId) return `Profile/${S.settings.avatarId}.jpg`;
        const url = S.user.photo_url;
        const cached = readAvatarCache();
        if (cached && (!url || cached.src === url)) return cached.data;
        return url || null;
    }

    function paintAvatar(el) {
        const g = S.settings.gender;
        el.classList.toggle('is-boy', g === 'boy');
        el.classList.toggle('is-girl', g === 'girl');
        const src = avatarSrc();
        if (!src || brokenAvatars.has(src)) {
            const key = 'icon:' + (g || '');
            if (el.dataset.src !== key) {
                el.innerHTML = AVATAR_SVG[g] || AVATAR_SVG.neutral;
                el.dataset.src = key;
                el.classList.remove('has-photo');
            }
            return;
        }
        if (el.dataset.src === src) return;
        const img = new Image();
        img.alt = '';
        img.decoding = 'async';
        img.onerror = () => {
            brokenAvatars.add(src);
            el.dataset.src = '';
            paintAvatar(el);
        };
        img.src = src;
        el.textContent = '';
        el.appendChild(img);
        el.dataset.src = src;
        el.classList.add('has-photo');
        if (!S.settings.avatarId && src === S.user.photo_url) idle(() => cacheAvatar(src));
    }

    const displayName = () => S.settings.displayName || S.user.first_name || 'کاربر مهمان';

    function cleanName(raw) {
        if (typeof raw !== 'string') return null;
        const s = raw.replace(/[\u0000-\u001F\u007F]/g, '').trim().replace(/\s+/g, ' ');
        if (!s) return null;
        return Array.from(s).slice(0, 20).join('');
    }

    function renderUser() {
        $('user-name').textContent = displayName();
        paintAvatar($('user-avatar'));
    }

    // Before any network work: show name/avatar from this device's last save.
    function earlyPaintUser() {
        try {
            const local = JSON.parse(store.get(Storage.key()) || 'null');
            const s = local && local.settings;
            if (s && typeof s === 'object') {
                S.settings.avatarId = s.avatarId || null;
                S.settings.gender = s.gender || null;
                S.settings.displayName = s.displayName || null;
                S.settings.darkMode = !!s.darkMode;
            }
        } catch (e) { /* ignore */ }
        renderUser();
    }

    function renderAvatarPicker() {
        const cur = S.settings.avatarId;
        const photos = CFG.avatarPhotos || { Boy: [], Girl: [] };
        const g = S.settings.gender;
        let html = `<div class="avatar-none"><button type="button" class="avatar-opt avatar-opt--none ${g === 'girl' ? 'is-girl' : g === 'boy' ? 'is-boy' : ''} ${!cur ? 'is-on' : ''}" data-avatar="">${AVATAR_SVG[g] || AVATAR_SVG.neutral}</button></div>`;
        [['Boy', 'پسرها'], ['Girl', 'دخترها']].forEach(([key, label]) => {
            html += `<p class="avatar-section">${label}</p><div class="avatar-grid">`;
            (photos[key] || []).forEach(n => {
                const id = `profile_${key}${n}`;
                html += `<button type="button" class="avatar-opt ${cur === id ? 'is-on' : ''}" data-avatar="${id}" data-gender="${key.toLowerCase()}"><img src="Profile/${id}.jpg" alt="" loading="lazy" decoding="async" width="64" height="64"></button>`;
            });
            html += '</div>';
        });
        const grid = $('avatar-grid');
        grid.innerHTML = html;
        grid.querySelectorAll('img').forEach(img => {
            img.onerror = () => { img.parentElement.hidden = true; };
        });
    }

    function pickAvatar(id, gender) {
        Sound.tap();
        S.settings.avatarId = id || null;
        if (gender) S.settings.gender = gender;
        Storage.save();
        closeModal('modal-avatar');
        renderProfile();
        renderUser();
    }

    /* ----------------------------------------------------------------- home */

    function renderHome() {
        renderUser();
        syncCoins();
        renderContinue();
        renderDailyCard();
        updateGiftDot();
    }

    let continueTarget = null;
    function renderContinue() {
        let done = 0;
        let total = 0;
        let next = null;
        let nextIdx = 0;
        DB.categories.forEach(cat => {
            const t = cat.levels.length;
            const d = doneCount(cat);
            total += t;
            done += d;
            if (!next && t > 0 && d < t) {
                next = cat;
                nextIdx = firstUnsolved(cat);
            }
        });
        const pct = total ? Math.round((done / total) * 100) : 0;
        $('continue-percent').textContent = fa(pct) + '٪';
        $('continue-ring').style.setProperty('--p', pct);
        continueTarget = next;
        if (next) {
            $('continue-label').textContent = done > 0 ? 'ادامه بازی' : 'شروع بازی';
            $('continue-sub').textContent = `${next.name} · مرحله ${fa(nextIdx + 1)}`;
        } else {
            $('continue-label').textContent = 'مرحله‌ها';
            $('continue-sub').textContent = total ? 'همه‌ی مرحله‌ها رو حل کردی 🎉' : 'به‌زودی مرحله‌های جدید میاد';
        }
    }

    function renderDailyCard() {
        const doneToday = S.dailyChallenge.lastCompletedDate === todayKey();
        $('btn-daily').classList.toggle('is-done', doneToday);
        $('daily-badge').textContent = doneToday ? '✅ انجام‌شد' : '🔥 جدید';
        $('daily-sub').textContent = doneToday
            ? 'امروز حلش کردی! نیمه‌شب یه چالش تازه میاد 🌙'
            : 'یه معمای ایموجی مخصوص امروز، هر روز عوض می‌شه';
    }

    /* --------------------------------------------------------------- promos */

    const PROMO_ICONS = {
        tech: '<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="18" y="55" width="14" height="27" rx="4" fill="#fff"/><rect x="43" y="38" width="14" height="44" rx="4" fill="#fff"/><rect x="68" y="20" width="14" height="62" rx="4" fill="#fff" opacity=".9"/></svg>',
        poetry: '<svg viewBox="0 0 100 100" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M50 28v48"/><path d="M50 32c-13-8-26-7-35-2v42c9-5 22-6 35 2"/><path d="M50 32c13-8 26-7 35-2v42c-9-5-22-6-35 2"/></svg>',
        meme: '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="34" fill="#fff"/><circle cx="38" cy="45" r="5.5" fill="#3a2a55"/><circle cx="62" cy="45" r="5.5" fill="#3a2a55"/><path d="M32 58c6 14 30 14 36 0" stroke="#3a2a55" stroke-width="6" stroke-linecap="round" fill="none"/></svg>',
        ad: '<svg viewBox="0 0 100 100" fill="none" stroke="#fff" stroke-width="7" aria-hidden="true"><circle cx="50" cy="50" r="32"/><circle cx="50" cy="50" r="18"/><circle cx="50" cy="50" r="5" fill="#fff" stroke="none"/></svg>'
    };

    const Promo = {
        timer: 0,
        resume: 0,
        index: 0,
        count: 0,
        track: null,

        build() {
            const track = $('promo-track');
            const dots = $('promo-dots');
            const items = (CFG.promos || []).filter(p => p.active !== false);
            this.track = track;
            this.count = items.length;
            track.innerHTML = items.map((p, i) => {
                const ad = p.type === 'ad';
                return `<a class="promo promo--${ad ? 'ad' : esc(p.theme || 'default')}" href="${esc(p.link)}" target="_blank" rel="noopener" data-i="${i}">
                    ${ad ? `<span class="promo__badge">${esc(p.badge || 'Ads')}</span>` : ''}
                    <span class="promo__icon" data-icon="${esc(p.icon || 'tech')}">${p.photo ? `<img src="${esc(p.photo)}" alt="" decoding="async" loading="${i ? 'lazy' : 'eager'}">` : (PROMO_ICONS[p.icon] || PROMO_ICONS.tech)}</span>
                    <span class="promo__info"><b>${esc(p.name)}</b><small>${esc(p.desc)}</small></span>
                    ${ad ? `<span class="promo__cta">${esc(p.cta || 'مشاهده')}</span>` : '<span class="promo__arrow">‹</span>'}
                </a>`;
            }).join('');
            track.querySelectorAll('.promo__icon img').forEach(img => {
                img.onerror = () => { const box = img.parentElement; box.innerHTML = PROMO_ICONS[box.dataset.icon] || PROMO_ICONS.tech; };
            });
            dots.innerHTML = this.count > 1 ? items.map((_, i) => `<i class="${i ? '' : 'is-on'}"></i>`).join('') : '';

            track.addEventListener('click', e => {
                const a = e.target.closest('.promo');
                if (!a) return;
                Sound.tap();
                const wa = webApp();
                if (wa && (wa.openEitaaLink || wa.openLink)) {
                    e.preventDefault();
                    openLink(items[+a.dataset.i].link);
                }
            });

            let ticking = false;
            track.addEventListener('scroll', () => {
                if (ticking) return;
                ticking = true;
                requestAnimationFrame(() => {
                    ticking = false;
                    const first = track.firstElementChild;
                    if (!first) return;
                    const w = first.offsetWidth + 12;
                    this.index = Math.min(this.count - 1, Math.round(Math.abs(track.scrollLeft) / w));
                    dots.querySelectorAll('i').forEach((d, i) => d.classList.toggle('is-on', i === this.index));
                });
            }, { passive: true });

            const hold = () => {
                this.stop();
                clearTimeout(this.resume);
                this.resume = setTimeout(() => { if (current === 'home') this.start(); }, 6000);
            };
            track.addEventListener('touchstart', hold, { passive: true });
            track.addEventListener('pointerdown', hold, { passive: true });
        },

        next() {
            if (!this.track || this.count < 2) return;
            this.index = (this.index + 1) % this.count;
            const card = this.track.children[this.index];
            if (!card) return;
            // scrollBy with a physical delta behaves the same in every RTL scroll model
            const delta = card.getBoundingClientRect().right - this.track.getBoundingClientRect().right;
            this.track.scrollBy({ left: delta, behavior: 'smooth' });
        },

        start() {
            if (this.timer || this.count < 2 || document.hidden) return;
            this.timer = setInterval(() => this.next(), CFG.promoInterval || 5000);
        },

        stop() {
            clearInterval(this.timer);
            this.timer = 0;
        }
    };

    /* ----------------------------------------------------------- categories */

    function renderCategories() {
        const box = $('cat-list');
        box.innerHTML = DB.categories.map(cat => {
            const total = cat.levels.length;
            const done = doneCount(cat);
            const pct = total ? Math.round((done / total) * 100) : 0;
            const ideas = cat.id === 'ideas';
            const locked = !total && !ideas;
            const complete = total > 0 && done === total;
            const stars = categoryStars(cat);
            let side;
            let sub;
            if (ideas) {
                side = '<span class="cat__go">‹</span>';
                sub = 'ایده یا انتقادت رو برامون بفرست';
            } else if (locked) {
                side = '<span class="cat__soon">به‌زودی</span>';
                sub = 'به‌زودی...';
            } else {
                side = complete ? '<span class="cat__check">✓</span>' : `<span class="cat__pct">${fa(pct)}٪</span>`;
                sub = `${fa(done)} از ${fa(total)} مرحله${stars ? ` · ⭐ ${fa(stars)}` : ''}`;
            }
            return `<button type="button" class="cat ${locked ? 'is-locked' : ''} ${complete ? 'is-done' : ''}" data-cat="${esc(cat.id)}">
                <span class="cat__icon"><i class="ei">${emojiHTML(cat.icon || '❓')}</i></span>
                <span class="cat__info"><b>${esc(cat.name)}</b><small>${sub}</small>${ideas || locked ? '' : `<span class="bar"><i style="width:${pct}%"></i></span>`}</span>
                <span class="cat__side">${side}</span>
            </button>`;
        }).join('');
    }

    function onCategoryClick(e) {
        const btn = e.target.closest('.cat');
        if (!btn) return;
        const cat = DB.categories.find(c => c.id === btn.dataset.cat);
        if (!cat) return;
        if (cat.id === 'ideas') { Sound.tap(); openSuggest('categories'); return; }
        if (!cat.levels.length) { Sound.error(); toast('⏳', 'این دسته به‌زودی باز می‌شه'); return; }
        Sound.tap();
        requireJoin(() => openLevels(cat));
    }

    /* --------------------------------------------------------------- medals */

    const MEDALS = [
        { id: 'first_blood', name: 'اولین قدم', icon: '👣', desc: 'اولین مرحله را حل کن', goal: () => 1, value: () => totalSolved() },
        { id: 'proverbs_novice', name: 'ضرب‌المثل آموز', icon: '📜', desc: '۵۰ ضرب‌المثل را حل کن', goal: () => 50, value: () => doneSet('proverbs').size },
        { id: 'movies_novice', name: 'فیلم‌باز', icon: '🎬', desc: '۵۰ فیلم و سریال را حل کن', goal: () => 50, value: () => doneSet('movies').size },
        { id: 'countries_novice', name: 'جهانگرد', icon: '🌍', desc: '۵۰ کشور را حل کن', goal: () => 50, value: () => doneSet('countries').size },
        { id: 'idioms_novice', name: 'اصطلاح‌دان', icon: '💬', desc: '۵۰ اصطلاح را حل کن', goal: () => 50, value: () => doneSet('idioms').size },
        // totalEarned, not the balance: spending on hints shouldn't block this one
        { id: 'rich', name: 'ثروتمند', icon: '💎', desc: '۵۰٬۰۰۰ سکه کسب کن', goal: () => 50000, value: () => S.totalEarned },
        { id: 'daily_fan', name: 'اهل چالش روزانه', icon: '🔥', desc: '۱۰ چالش روزانه را حل کن', goal: () => 10, value: () => S.dailyChallenge.completedCount || 0 },
        { id: 'all_categories', name: 'استاد بازی', icon: '👑', desc: 'همه دسته‌ها را صد‌درصد کامل کن', goal: () => totalLevels(), value: () => totalSolved() }
    ];
    const medalEarned = m => { const g = m.goal(); return g > 0 && m.value() >= g; };

    function checkMedals() {
        MEDALS.forEach(m => {
            if (S.unlockedMedals.indexOf(m.id) === -1 && medalEarned(m)) {
                S.unlockedMedals.push(m.id);
                toast(m.icon, `مدال جدید: ${m.name}`);
                Sound.medal();
            }
        });
    }

    function renderMedals() {
        $('medal-list').innerHTML = MEDALS.map(m => {
            const on = S.unlockedMedals.indexOf(m.id) > -1;
            const goal = m.goal();
            const val = Math.min(m.value(), goal);
            const pct = on ? 100 : goal ? Math.round((val / goal) * 100) : 0;
            return `<div class="card medal ${on ? 'is-on' : ''}">
                <span class="medal__icon"><i class="ei">${emojiHTML(m.icon)}</i></span>
                <span class="medal__body"><b>${m.name}</b><small>${m.desc}</small>${on ? '' : `<span class="bar"><i style="width:${pct}%"></i></span>`}</span>
                <span class="medal__state">${on ? '<span class="medal__check">✓</span>باز شد' : `🔒<span>${faNum(val)}/${faNum(goal)}</span>`}</span>
            </div>`;
        }).join('');
        const got = S.unlockedMedals.filter(id => MEDALS.some(m => m.id === id)).length;
        $('medals-count').textContent = `${fa(got)}/${fa(MEDALS.length)}`;
        $('medals-ring').style.setProperty('--p', Math.round((got / MEDALS.length) * 100));
    }

    /* -------------------------------------------------------------- profile */

    const RANKS = [[200, '👑 افسانه‌ی ایموجی'], [120, '🎓 استاد ایموجی'], [50, '🧠 باهوش'], [10, '🔍 کنجکاو'], [0, '🌱 تازه‌وارد']];

    function renderProfile() {
        $('profile-name').textContent = displayName();
        paintAvatar($('profile-avatar'));
        $$('.gender').forEach(el => el.classList.toggle('is-on', el.dataset.gender === S.settings.gender));

        const solved = totalSolved();
        const total = totalLevels();
        $('stat-coins').textContent = faNum(S.globalScore);
        $('stat-earned').textContent = faNum(S.totalEarned);
        $('stat-stars').textContent = faNum(totalStars());
        $('stat-solved').textContent = faNum(solved);
        $('stat-daily').textContent = faNum(S.dailyChallenge.completedCount || 0);
        const medals = S.unlockedMedals.filter(id => MEDALS.some(m => m.id === id)).length;
        $('stat-medals').textContent = `${fa(medals)}/${fa(MEDALS.length)}`;
        $('profile-rank').textContent = RANKS.find(r => solved >= r[0])[1];

        const pct = total ? Math.min(100, (solved / total) * 100) : 0;
        $('profile-bar').style.width = pct + '%';
        $('profile-progress-txt').textContent = `${faNum(solved)} از ${faNum(total)} مرحله (${fa(Math.round(pct))}٪)`;

        $('profile-cats').innerHTML = DB.categories.filter(c => c.levels.length).map(c => {
            const d = doneCount(c);
            return `<div class="cat-progress__row"><i class="ei">${emojiHTML(c.icon)}</i><span>${esc(c.name)}</span><span class="bar"><i style="width:${(d / c.levels.length) * 100}%"></i></span><small>${fa(d)}/${fa(c.levels.length)}</small></div>`;
        }).join('');

        $('profile-medals').innerHTML = MEDALS.map(m =>
            `<span class="medal-chip ${S.unlockedMedals.indexOf(m.id) > -1 ? 'is-on' : ''}" title="${m.name}"><i class="ei">${emojiHTML(m.icon)}</i></span>`
        ).join('');
    }

    /* ------------------------------------------------------- daily challenge */

    // A fixed shuffle of every level, one step per day: nothing repeats until the
    // whole bank has been used. Seed and epoch must never change.
    const DAILY_SEED = 20240101;
    const DAILY_EPOCH = Date.UTC(2024, 0, 1);
    const DAY_MS = 86400000;
    let dailyPerm = null;

    function seeded(seed) {
        let s = seed % 2147483647;
        if (s <= 0) s += 2147483646;
        return () => {
            s = (s * 16807) % 2147483647;
            return (s - 1) / 2147483646;
        };
    }

    function dailyLevel() {
        const all = [];
        DB.categories.forEach(cat => cat.levels.forEach(lvl => all.push({ level: lvl, cat })));
        if (!all.length) return null;
        if (!dailyPerm || dailyPerm.length !== all.length) {
            dailyPerm = all.map((_, i) => i);
            const r = seeded(DAILY_SEED);
            for (let i = dailyPerm.length - 1; i > 0; i--) {
                const j = Math.floor(r() * (i + 1));
                const t = dailyPerm[i]; dailyPerm[i] = dailyPerm[j]; dailyPerm[j] = t;
            }
        }
        const day = Math.floor((Date.now() - DAILY_EPOCH) / DAY_MS);
        const pos = ((day % all.length) + all.length) % all.length;
        return all[dailyPerm[pos]];
    }

    function startDaily() {
        if (S.dailyChallenge.lastCompletedDate === todayKey()) {
            toast('🌙', 'چالش امروز رو حل کردی! بعد از نیمه‌شب یه چالش جدید میاد.');
            return;
        }
        const pick = dailyLevel();
        if (!pick) return;
        session.mode = 'daily';
        session.cat = pick.cat;
        session.idx = 0;
        session.level = pick.level;
        show('game');
        renderLevel();
    }

    /* ------------------------------------------------------------ join gate */

    const WEEK_MS = 7 * DAY_MS;
    let pendingJoin = null;

    function rotation(now) {
        const g = CFG.joinGate || {};
        const list = (g.channels || []).filter(c => c && c.enabled);
        if (!list.length) return null;
        const per = Math.max(1, g.weeksPerChannel || 1);
        const start = new Date(g.startDate || '2025-01-06T00:00:00+03:30').getTime();
        const week = Math.max(0, Math.floor(((now || Date.now()) - start) / WEEK_MS));
        const index = Math.floor((week % (per * list.length)) / per);
        return { channel: list[index], week };
    }
    window.debugRotation = date => rotation(date ? new Date(date).getTime() : undefined);

    function requireJoin(action) {
        const info = rotation();
        if (!info || (S.joinGate.confirmedChannelId === info.channel.id && S.joinGate.confirmedWeekNumber === info.week)) {
            action();
            return;
        }
        pendingJoin = action;
        const blocks = $$('.join-block');
        let found = false;
        blocks.forEach(b => {
            const match = b.dataset.channelId === info.channel.id;
            b.hidden = !match;
            if (match) found = true;
        });
        if (!found) blocks.forEach(b => { b.hidden = b.dataset.channelId !== 'default'; });
        $('join-channel-name').textContent = `${info.channel.icon || '📢'} ${info.channel.name}`;
        $('btn-join-open').onclick = () => { Sound.tap(); openLink(`https://eitaa.com/${info.channel.username}`); };
        openModal('modal-join');
    }

    function confirmJoin() {
        Sound.tap();
        // There is no membership API for static mini-apps, so this is self-reported per week.
        const info = rotation();
        if (info) {
            S.joinGate.confirmedChannelId = info.channel.id;
            S.joinGate.confirmedWeekNumber = info.week;
            Storage.save();
        }
        const action = pendingJoin;
        closeModal('modal-join');
        if (action) action();
    }

    /* --------------------------------------------------------------- levels */

    function openLevels(cat) {
        session.mode = 'level';
        session.cat = cat;
        $('levels-title').textContent = cat.name;
        renderLevelGrid();
        syncCoins();
        show('levels');
    }

    function renderLevelGrid() {
        const cat = session.cat;
        const done = doneCount(cat);
        const pct = cat.levels.length ? Math.round((done / cat.levels.length) * 100) : 0;
        $('levels-summary').innerHTML = `<span>${fa(done)} از ${fa(cat.levels.length)} مرحله · ⭐ ${fa(categoryStars(cat))}</span><span class="bar"><i style="width:${pct}%"></i></span>`;
        const cur = firstUnsolved(cat);
        let html = '';
        for (let i = 0; i < cat.levels.length; i++) {
            const open = isUnlocked(cat, i);
            const solved = isDone(cat.id, i);
            const stars = levelStars(cat.id, i);
            const cls = !open ? 'is-locked' : solved ? 'is-done' : i === cur ? 'is-current' : '';
            html += `<div class="lvl ${cls}"><button type="button" class="lvl__tile" data-i="${i}" aria-label="مرحله ${fa(i + 1)}${open ? '' : ' (قفل)'}">${open ? fa(i + 1) : '🔒'}</button><span class="stars"><i class="${stars > 0 ? 'on' : ''}">★</i><i class="${stars > 1 ? 'on' : ''}">★</i><i class="${stars > 2 ? 'on' : ''}">★</i></span></div>`;
        }
        $('level-grid').innerHTML = html;
        if (cur > 4) {
            requestAnimationFrame(() => {
                const tile = $('level-grid').children[cur];
                if (tile) $('screen-levels').scrollTop = Math.max(0, tile.offsetTop - 160);
            });
        }
    }

    function onLevelClick(e) {
        const btn = e.target.closest('.lvl__tile');
        if (!btn) return;
        const i = +btn.dataset.i;
        if (!isUnlocked(session.cat, i)) {
            Sound.error();
            toast('🔒', 'اول مرحله‌ی قبلی رو حل کن تا این یکی باز بشه');
            return;
        }
        Sound.tap();
        startLevel(session.cat, i);
    }

    function startLevel(cat, i) {
        if (!isUnlocked(cat, i)) { openLevels(cat); return; }
        session.mode = 'level';
        session.cat = cat;
        session.idx = i;
        session.level = cat.levels[i];
        show('game');
        renderLevel();
    }

    function startCategory(cat) {
        const i = firstUnsolved(cat);
        if (i === -1) openLevels(cat); else startLevel(cat, i);
    }

    /* ----------------------------------------------------------------- game */

    const session = {
        mode: 'level',  // 'level' | 'daily'
        cat: null,
        idx: 0,
        level: null,
        wordMode: false,
        slots: [],      // { char, fill, key, locked }
        keys: [],       // { char, used }
        slotEls: [],
        keyEls: [],
        solved: false
    };

    const DIFF = { easy: 'آسان', medium: 'متوسط', hard: 'سخت' };
    function difficulty(level, wordMode) {
        if (DIFF[level.difficulty]) return level.difficulty;
        if (wordMode) {
            const words = level.answer.trim().split(/\s+/).length;
            return words <= 3 ? 'easy' : words <= 6 ? 'medium' : 'hard';
        }
        const len = level.answer.replace(/\s/g, '').length;
        return len <= 6 ? 'easy' : len <= 12 ? 'medium' : 'hard';
    }

    const isReplay = () => session.mode === 'level' && isDone(session.cat.id, session.idx);
    const hintCost = () => (isReplay() ? 0 : ECON.hintCost);

    function updateHintButton() {
        const cost = hintCost();
        $('hint-cost').textContent = cost ? `راهنما · ${faNum(cost)}` : 'راهنما · رایگان';
        $('btn-hint').classList.toggle('is-poor', S.globalScore < cost);
    }

    function renderLevel() {
        const daily = session.mode === 'daily';
        const cat = session.cat;
        if (!daily && !isUnlocked(cat, session.idx)) { openLevels(cat); return; }

        const level = session.level;
        const answer = level.answer.replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim();
        const words = answer.split(/\s+/);
        const wordMode = (CFG.wordModeCategories || ['proverbs']).indexOf(cat.id) > -1;
        session.wordMode = wordMode;
        session.solved = false;

        $('game-title').textContent = daily ? '🔥 چالش روزانه' : cat.name;
        $('game-level').textContent = daily ? `${cat.icon || ''} ${cat.name}`.trim() : `مرحله ${fa(session.idx + 1)}`;
        const diff = difficulty(level, wordMode);
        const diffEl = $('game-diff');
        diffEl.textContent = DIFF[diff];
        diffEl.className = `diff diff--${diff}`;

        const notice = $('game-notice');
        const colloquial = (CFG.colloquialCategories || {})[cat.id];
        notice.hidden = !colloquial;
        if (colloquial) notice.textContent = `💡 برخی از ${colloquial} به زبان محاوره و عامیانه نوشته شده‌اند.`;

        // stage
        const stage = $('stage');
        const count = graphemes(level.emoji).filter(s => s.trim()).length;
        stage.style.setProperty('--e', (count <= 3 ? 66 : count <= 5 ? 58 : count <= 8 ? 50 : 44) + 'px');
        paintEmoji(stage, level.emoji);
        watchEmojis(stage);

        // slots
        const slots = [];
        let slotHtml = '';
        if (wordMode) {
            words.forEach(w => {
                slotHtml += `<button type="button" class="slot slot--word" data-s="${slots.length}"></button>`;
                slots.push({ char: w, fill: '', key: -1, locked: false });
            });
        } else {
            let longest = 1;
            words.forEach(w => {
                const chars = Array.from(w).filter(ch => ch !== '‌');
                longest = Math.max(longest, chars.length);
                slotHtml += '<span class="word">';
                chars.forEach(ch => {
                    slotHtml += `<button type="button" class="slot" data-s="${slots.length}"></button>`;
                    slots.push({ char: ch, fill: '', key: -1, locked: false });
                });
                slotHtml += '</span>';
            });
            const room = Math.min(window.innerWidth, 560) - 28;
            const size = Math.max(28, Math.min(44, Math.floor((room - (longest - 1) * 5) / longest)));
            $('slots').style.setProperty('--slot', size + 'px');
        }
        const slotsEl = $('slots');
        slotsEl.className = 'slots';
        slotsEl.innerHTML = slotHtml;

        // keyboard
        const needed = slots.map(s => s.char);
        let pool = needed.slice();
        if (wordMode) {
            const decoys = shuffle((DB.wordBank || []).filter(w => needed.indexOf(w) === -1));
            pool = pool.concat(decoys.slice(0, Math.max(4, Math.min(8, needed.length + 3))));
        } else {
            // fill to full rows of 8, leaving one cell for the delete key
            const target = Math.max(23, Math.ceil((needed.length + 7) / 8) * 8 - 1);
            while (pool.length < target) pool.push(LETTERS[rand(LETTERS.length)]);
        }
        shuffle(pool);
        const keys = pool.map(ch => ({ char: ch, used: false }));
        const delIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" transform="matrix(-1 0 0 1 24 0)"/><path d="m10 9 5 6m0-6-5 6"/></svg>';
        const kb = $('keyboard');
        kb.innerHTML = keys.map((k, i) => `<button type="button" class="key ${wordMode ? 'key--word' : ''}" data-k="${i}">${esc(k.char)}</button>`).join('')
            + `<button type="button" class="key key--del ${wordMode ? 'key--word' : ''}" data-del aria-label="پاک کردن">${delIcon}</button>`;

        session.slots = slots;
        session.keys = keys;
        session.slotEls = Array.from(slotsEl.querySelectorAll('.slot'));
        session.keyEls = Array.from(kb.querySelectorAll('[data-k]'));

        updateHintButton();
        syncCoins();
        $('stage').closest('.game__scroll').scrollTop = 0;

        // warm up the next puzzle while this one is being solved
        if (!daily) {
            const next = cat.levels[session.idx + 1];
            if (next) idle(() => warmEmojis(next.emoji));
        }
    }

    function paintSlot(i) {
        const s = session.slots[i];
        const el = session.slotEls[i];
        el.textContent = s.fill;
        el.classList.toggle('is-filled', !!s.fill && !s.locked);
        el.classList.toggle('is-locked', s.locked);
    }
    const paintKey = i => session.keyEls[i].classList.toggle('is-used', session.keys[i].used);

    function clearWrong() {
        const el = $('slots');
        if (el.classList.contains('is-wrong')) el.classList.remove('is-wrong');
    }

    function onKey(i) {
        if (session.solved) return;
        const key = session.keys[i];
        if (!key || key.used) return;
        const si = session.slots.findIndex(s => !s.fill);
        if (si === -1) return;
        Sound.tap();
        clearWrong();
        const slot = session.slots[si];
        slot.fill = key.char;
        slot.key = i;
        key.used = true;
        paintSlot(si);
        paintKey(i);
        if (session.slots.every(s => s.fill)) checkAnswer();
    }

    function releaseSlot(si) {
        const slot = session.slots[si];
        if (!slot || !slot.fill || slot.locked) return false;
        const k = slot.key;
        slot.fill = '';
        slot.key = -1;
        if (session.keys[k]) {
            session.keys[k].used = false;
            paintKey(k);
        }
        paintSlot(si);
        return true;
    }

    function onSlot(si) {
        if (session.solved) return;
        if (releaseSlot(si)) { Sound.pop(); clearWrong(); }
    }

    function onDelete() {
        if (session.solved) return;
        for (let i = session.slots.length - 1; i >= 0; i--) {
            if (releaseSlot(i)) { Sound.pop(); clearWrong(); return; }
        }
    }

    function useHint() {
        if (session.solved) return;
        const cost = hintCost();
        if (S.globalScore < cost) {
            Sound.error();
            toast('🪙', 'سکه‌ی کافی نداری! از بخش جایزه سکه‌ی رایگان بگیر.');
            return;
        }
        const open = session.slots.map((s, i) => i).filter(i => !session.slots[i].locked && session.slots[i].fill !== session.slots[i].char);
        if (!open.length) return;
        const ti = open[rand(open.length)];
        const target = session.slots[ti];
        releaseSlot(ti);

        let ki = session.keys.findIndex(k => !k.used && k.char === target.char);
        if (ki === -1) {
            // the right key is sitting in a wrong slot: take it back
            const wi = session.slots.findIndex(s => !s.locked && s.fill === target.char);
            if (wi > -1) {
                ki = session.slots[wi].key;
                releaseSlot(wi);
            }
        }
        if (ki === -1) return;

        S.globalScore -= cost;
        if (session.mode === 'level' && cost) ensureStat(session.cat.id, session.idx).hints++;
        target.fill = target.char;
        target.key = ki;
        target.locked = true;
        session.keys[ki].used = true;
        paintSlot(ti);
        paintKey(ki);
        clearWrong();
        Sound.pop();
        haptic('light');
        syncCoins();
        updateHintButton();
        Storage.save();
        if (session.slots.every(s => s.fill)) checkAnswer();
    }

    function checkAnswer() {
        if (!session.slots.every(s => s.fill)) return;
        const slotsEl = $('slots');
        if (!session.slots.every(s => s.fill === s.char)) {
            Sound.error();
            haptic('error');
            flashWrong();
            slotsEl.classList.remove('is-wrong');
            void slotsEl.offsetWidth;
            slotsEl.classList.add('is-wrong');
            return;
        }

        session.solved = true;
        slotsEl.classList.add('is-right');
        Sound.success();
        haptic('success');

        let coins = 0;
        let stars = 0;
        if (session.mode === 'daily') {
            const today = todayKey();
            if (S.dailyChallenge.lastCompletedDate !== today) {
                coins = ECON.dailyChallengeReward;
                addCoins(coins);
                S.dailyChallenge.completedCount = (S.dailyChallenge.completedCount || 0) + 1;
            }
            S.dailyChallenge.lastCompletedDate = today;
        } else {
            const { cat, idx } = session;
            if (!isDone(cat.id, idx) && isUnlocked(cat, idx)) {
                coins = ECON.categoryReward[cat.id] != null ? ECON.categoryReward[cat.id] : ECON.levelReward;
                addCoins(coins);
                markDone(cat.id, idx);
                const st = ensureStat(cat.id, idx);
                st.stars = starsFor(st.hints || 0);
            }
            stars = levelStars(cat.id, idx);
        }
        checkMedals();
        Storage.save();
        syncCoins();

        $('win-answer').textContent = `«${session.level.answer.trim().replace(/\s+/g, ' ')}»`;
        $('win-coins').textContent = coins > 0 ? '+' + faNum(coins) : (session.mode === 'daily' ? '۰' : '۰ (قبلاً گرفتی)');
        const daily = session.mode === 'daily';
        $('win-stars-wrap').hidden = daily;
        $('stars-help').hidden = true;
        $('btn-stars-info').setAttribute('aria-expanded', 'false');
        if (!daily) {
            $('win-stars').innerHTML = [1, 2, 3].map(n => `<i class="${n <= stars ? 'on' : ''}">★</i>`).join('');
            const hints = levelHints(session.cat.id, session.idx);
            $('stars-help').innerHTML = '<div>⭐⭐⭐ بدون راهنما</div><div>⭐⭐ ۱ تا ۳ راهنما</div><div>⭐ بیشتر از ۳ راهنما</div>'
                + `<b>${hints ? `این مرحله ${fa(hints)} بار راهنما گرفتی و ${fa(stars)} ستاره بردی.` : 'بدون هیچ راهنمایی حلش کردی؛ ۳ ستاره مال تو!'}</b>`;
        }
        $('btn-next').textContent = daily ? 'برگشت به خانه 🏠' : 'مرحله‌ی بعد 🚀';

        celebrate();
        setTimeout(() => openModal('modal-win'), LITE ? 150 : 450);
    }

    function afterWin() {
        if (session.mode === 'daily') {
            openHome();
            return;
        }
        const cat = session.cat;
        const next = session.idx + 1;
        if (next >= cat.levels.length) {
            openLevels(cat);
            return;
        }
        session.idx = next;
        session.level = cat.levels[next];
        renderLevel();
    }

    /* ---------------------------------------------------------------- gifts */

    const WEEK_DAYS = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];

    function weekStart(d) {
        const sinceSaturday = (d.getDay() + 1) % 7;
        return new Date(d.getFullYear(), d.getMonth(), d.getDate() - sinceSaturday);
    }

    // The stored week only moves forward, so winding the clock back can't reopen a claimed day.
    function syncGiftWeek() {
        const now = new Date();
        const today = dateKey(now);
        const ws = dateKey(weekStart(now));
        const daily = S.rewards.daily;
        if (!daily.weekStartKey || ws > daily.weekStartKey) {
            daily.weekStartKey = ws;
            daily.claimedDaysThisWeek = [];
            Storage.save();
        }
        return { today, ws, sameWeek: ws === daily.weekStartKey };
    }

    function canClaimGift() {
        if (!Storage.ready) return false;
        const { today, sameWeek } = syncGiftWeek();
        const daily = S.rewards.daily;
        if (!sameWeek) return false;
        if (daily.claimedDaysThisWeek.indexOf(today) > -1) return false;
        if (daily.lastGrantedDateKey && today <= daily.lastGrantedDateKey) return false;
        return true;
    }

    function claimGift() {
        if (!canClaimGift()) { toast('⏳', 'سکه‌ی امروز رو گرفتی؛ فردا دوباره بیا.'); return; }
        const { today } = syncGiftWeek();
        const g = ECON.dailyGift;
        const amount = g.min + rand(g.max - g.min + 1);
        addCoins(amount);
        S.rewards.daily.claimedDaysThisWeek.push(today);
        S.rewards.daily.lastGrantedDateKey = today;
        checkMedals();
        Storage.save();
        Sound.coin();
        haptic('success');
        syncCoins();
        renderGifts();
        updateGiftDot();
        const card = $('gift-card');
        card.classList.remove('pop');
        void card.offsetWidth;
        card.classList.add('pop');
        coinBurst($('btn-claim-gift'));
        toast('🎁', `${faNum(amount)} سکه گرفتی! مبارکه 🎊`);
    }

    function renderGifts() {
        const { today, ws } = syncGiftWeek();
        const claimed = S.rewards.daily.claimedDaysThisWeek;
        const [y, m, d] = ws.split('-').map(Number);
        let html = '';
        for (let i = 0; i < 7; i++) {
            const key = dateKey(new Date(y, m - 1, d + i));
            const got = claimed.indexOf(key) > -1;
            html += `<span class="day ${got ? 'is-claimed' : ''} ${key === today ? 'is-today' : ''}"><i>${got ? '✓' : fa(i + 1)}</i>${WEEK_DAYS[i]}</span>`;
        }
        $('gift-week').innerHTML = html;
        const can = canClaimGift();
        const btn = $('btn-claim-gift');
        btn.disabled = !can;
        btn.textContent = can ? '🎁 دریافت سکه‌ی امروز' : '✅ امروز رو گرفتی، فردا دوباره بیا';
        renderRewardChannels();
    }

    function openGifts() {
        Sound.tap();
        closeModal('modal-settings');
        closeModal('modal-reminder');
        renderGifts();
        openModal('modal-gifts');
    }

    function updateGiftDot() {
        const on = canClaimGift();
        $('btn-settings').classList.toggle('has-dot', on);
        $('btn-free-coins').classList.toggle('has-dot', on);
        const tab = document.querySelector('.tab[data-tab="rewards"]');
        if (tab) tab.classList.toggle('has-dot', on);
    }

    function maybeRemind() {
        updateGiftDot();
        if (!canClaimGift() || modalStack.length) return;
        const today = todayKey();
        if (store.get('razak_daily_reminder_shown') === today) return;
        store.set('razak_daily_reminder_shown', today);
        openModal('modal-reminder');
    }

    // ---- coins for joining channels (self-reported: tap join, come back, claim)
    const returnedFrom = new Set();
    let pendingReward = null;

    const rewardKey = card => (card.slotVersion ? `${card.id}:${card.slotVersion}` : card.id);
    function rewardCards() {
        const cards = (CFG.rewardChannels || []).filter(c => c.active !== false);
        const slot = CFG.rewardRotatingSlot;
        if (slot && slot.active !== false) cards.push(slot);
        return cards;
    }

    function renderRewardChannels() {
        $('reward-list').innerHTML = rewardCards().map((card, i) => {
            const key = rewardKey(card);
            const got = !!S.rewards.channels[key];
            const back = returnedFrom.has(key);
            const btn = got
                ? '<button type="button" class="btn btn--sm is-claimed" disabled>✅ گرفتی</button>'
                : back
                    ? `<button type="button" class="btn btn--sm btn--green" data-claim="${i}">دریافت</button>`
                    : `<button type="button" class="btn btn--sm btn--violet" data-join="${i}">عضویت</button>`;
            return `<div class="card reward"><span class="reward__info"><b>${esc(card.name)}</b><small>🪙 ${faNum(card.reward)} سکه</small></span>${btn}</div>`;
        }).join('');
    }

    function onRewardListClick(e) {
        const join = e.target.closest('[data-join]');
        const claim = e.target.closest('[data-claim]');
        const cards = rewardCards();
        if (join) {
            const card = cards[+join.dataset.join];
            Sound.tap();
            pendingReward = rewardKey(card);
            $('reward-info-text').textContent = `برای گرفتن سکه، عضو کانال «${card.name}» شو و پست‌ها رو با حوصله ببین، بعد برگرد همین‌جا.`;
            $('btn-reward-enter').onclick = () => { Sound.tap(); openLink(`https://eitaa.com/${card.username}`); };
            openModal('modal-reward-info');
        } else if (claim) {
            const card = cards[+claim.dataset.claim];
            const key = rewardKey(card);
            if (S.rewards.channels[key]) return;
            addCoins(card.reward);
            S.rewards.channels[key] = true;
            returnedFrom.delete(key);
            checkMedals();
            Storage.save();
            Sound.coin();
            syncCoins();
            renderRewardChannels();
            coinBurst(claim);
            toast('🎊', `${faNum(card.reward)} سکه بابت عضویت در «${card.name}» گرفتی!`);
        }
    }

    /* ------------------------------------------------------------- suggest */

    let sending = false;

    function openSuggest(from) {
        suggestReturn = from || 'home';
        if (DB.suggestions && DB.suggestions.intro) $('suggest-intro').textContent = DB.suggestions.intro;
        resetSuggestErrors();
        $('sg-result').hidden = true;
        show('suggest');
    }

    function resetSuggestErrors() {
        $$('[data-err]').forEach(el => { el.textContent = ''; });
        $$('#suggest-form .input').forEach(el => el.classList.remove('is-invalid'));
    }

    function readSuggest() {
        return {
            name: $('sg-name').value.replace(/\s+/g, ' ').trim(),
            idea: $('sg-idea').value.replace(/[ \t]+\n/g, '\n').trim(),
            emojis: $('sg-emojis').value.trim()
        };
    }

    function validateSuggest(f) {
        const err = {};
        if (f.name.length > 30) err['sg-name'] = 'نام حداکثر ۳۰ کاراکتر باشد.';
        if (!f.idea) err['sg-idea'] = 'لطفاً ایده یا انتقادت رو بنویس.';
        else if (f.idea.length < 10) err['sg-idea'] = 'متن خیلی کوتاهه؛ حداقل ۱۰ کاراکتر بنویس.';
        else if (f.idea.length > 1000) err['sg-idea'] = 'متن حداکثر ۱۰۰۰ کاراکتر باشد.';
        if (f.emojis) {
            if (f.emojis.length > 60) err['sg-emojis'] = 'ایموجی‌ها حداکثر ۶۰ کاراکتر باشند.';
            else if (!/\p{Extended_Pictographic}/u.test(f.emojis)) err['sg-emojis'] = 'اینجا فقط ایموجی بنویس (مثلاً 🎬🍿).';
        }
        return err;
    }

    const suggestText = f => `نام شما(اختیاری): ${f.name}\nایده و یا انتقاد شما: ${f.idea}\nایموجی های پیشنهادی: ${f.emojis}`;

    function suggestResult(kind, text, fallback) {
        const box = $('sg-result');
        box.className = `form__result is-${kind}`;
        box.hidden = false;
        $('sg-result-text').textContent = text;
        $('sg-result-actions').hidden = !fallback;
    }

    async function submitSuggest(e) {
        e.preventDefault();
        if (sending) return;
        Sound.tap();
        resetSuggestErrors();
        $('sg-result').hidden = true;
        const f = readSuggest();
        const err = validateSuggest(f);
        const bad = Object.keys(err);
        if (bad.length) {
            bad.forEach(id => {
                $(id).classList.add('is-invalid');
                document.querySelector(`[data-err="${id}"]`).textContent = err[id];
            });
            $(bad[0]).focus();
            return;
        }
        const last = parseInt(store.get('razak_last_suggestion_at') || '0', 10);
        if (last && Date.now() - last < 60000) {
            suggestResult('warn', 'چند لحظه پیش یه پیشنهاد فرستادی؛ یه دقیقه صبر کن و دوباره امتحان کن.', false);
            return;
        }
        if (!SUGGEST_BUCKET) {
            Sound.error();
            suggestResult('err', 'ارسال مستقیم از داخل بازی هنوز فعال نشده. متنت آماده‌ست؛ کپی کن و توی پیوی بفرست.', true);
            return;
        }

        const btn = $('btn-suggest-send');
        sending = true;
        btn.disabled = true;
        btn.textContent = 'در حال ارسال...';
        let ok = false;
        try {
            const key = `sug_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const body = JSON.stringify({ name: f.name, idea: f.idea, emojis: f.emojis, date: new Date().toISOString(), appVersion: VERSION });
            const res = await fetchWithTimeout(`https://kvdb.io/${SUGGEST_BUCKET}/${key}`, { method: 'PUT', body }, 10000);
            ok = res.ok;
        } catch (err2) { ok = false; }
        sending = false;
        btn.disabled = false;
        btn.textContent = 'ارسال پیشنهاد';

        if (ok) {
            store.set('razak_last_suggestion_at', String(Date.now()));
            Sound.success();
            suggestResult('ok', 'ممنون! پیشنهادت با موفقیت ارسال شد 💙', false);
            $('suggest-form').reset();
            $('sg-count').textContent = '۰';
        } else {
            Sound.error();
            suggestResult('err', 'ارسال انجام نشد (مشکل اتصال یا سرور). دوباره امتحان کن یا متن رو کپی کن و توی پیوی بفرست.', true);
        }
    }

    async function copyText(text) {
        Sound.tap();
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
            } else {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.cssText = 'position:fixed;opacity:0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
            }
            toast('📋', 'متن کپی شد!');
        } catch (e) {
            toast('⚠️', 'کپی نشد، لطفاً متن را دستی کپی کنید.');
        }
    }

    /* ------------------------------------------------------------ changelog */

    function renderChangelog(onlyNew) {
        const log = CFG.changelog || [];
        let entries = log;
        const seen = store.get('lastSeenVersion');
        if (onlyNew && seen) {
            const i = log.findIndex(e => e.version === seen);
            entries = i === -1 ? log.slice(0, 1) : log.slice(0, i);
        }
        if (!entries.length) entries = log.slice(0, 1);
        $('changelog-body').innerHTML = entries.map(e =>
            `<div class="release"><h3>نسخه‌ی ${fa(e.version)}</h3><ul>${(e.added || []).map(t => `<li>✨ ${esc(t)}</li>`).join('')}</ul></div>`
        ).join('');
    }

    function announceUpdate() {
        const seen = store.get('lastSeenVersion');
        store.set('lastSeenVersion', VERSION);
        if (seen && seen !== VERSION) {
            renderChangelog(true);
            openModal('modal-changelog');
        }
    }

    /* ------------------------------------------------------------------ ads */

    const Ads = {
        loaded: false,
        load() {
            const a = CFG.adly;
            if (this.loaded || !a || !a.enabled) return;
            this.loaded = true;
            const s = document.createElement('script');
            s.src = a.script;
            s.async = true;
            s.onload = () => {
                try {
                    if (window.AdlyWidget) {
                        window.AdlyWidget.init({ apiKey: a.apiKey, containerId: 'adly-container', barnamk: a.barnamk, appRef: a.appRef });
                    }
                } catch (e) { /* ad network issue: ignore */ }
            };
            document.head.appendChild(s);
        }
    };

    /* ------------------------------------------------------------- floaters */

    function buildFloaters() {
        const wrap = $('floaters');
        if (!wrap || wrap.childElementCount) return;
        const list = [
            ['🎬', 6, 14, 44, 0.5, 9, 0], ['🌍', 82, 10, 50, 0.5, 11, 1.2],
            ['🍿', 88, 40, 38, 0.42, 8, 0.6], ['🎭', 3, 44, 42, 0.45, 10, 2],
            ['💡', 78, 64, 40, 0.45, 9.5, 1.8], ['🧩', 10, 70, 46, 0.45, 12, 0.3],
            ['🚀', 86, 86, 44, 0.5, 10, 2.4], ['🪐', 24, 90, 42, 0.4, 13, 1.5]
        ];
        wrap.innerHTML = list.map(([e, x, y, s, o, d, delay], i) =>
            `<i class="floater" style="--x:${x}%;--y:${y}%;--s:${s}px;--o:${o};--d:${d}s;--delay:-${delay}s;--dx:${i % 2 ? -14 : 14}px;--r0:${i % 2 ? 8 : -8}deg;--r1:${i % 2 ? -10 : 10}deg">${emojiHTML(e)}</i>`
        ).join('');
    }

    function paintStaticEmojis() {
        $$('.ei[data-emoji]').forEach(el => paintEmoji(el, el.dataset.emoji));
    }

    /* --------------------------------------------------------------- events */

    function bind() {
        const on = (id, type, fn) => { const el = $(id); if (el) el.addEventListener(type, fn); };
        const guard = fn => function () { if (appReady) fn.apply(this, arguments); };

        // navigation
        $('tabbar').addEventListener('click', e => {
            const t = e.target.closest('.tab');
            if (!t || !appReady) return;
            Sound.tap();
            openTab(t.dataset.tab);
        });
        $$('[data-back]').forEach(b => b.addEventListener('click', goBack));
        on('user-chip', 'click', guard(() => { Sound.tap(); openProfile(); }));

        // home
        on('btn-continue', 'click', guard(() => {
            Sound.tap();
            if (continueTarget) {
                const cat = continueTarget;
                requireJoin(() => startCategory(cat));
            } else {
                openCategories();
            }
        }));
        on('btn-daily', 'click', guard(() => { Sound.tap(); requireJoin(startDaily); }));
        on('btn-mode-levels', 'click', guard(() => { Sound.tap(); openCategories(); }));
        on('btn-mode-board', 'click', () => { Sound.tap(); toast('🏆', 'جدول برترین‌ها به‌زودی میاد'); });
        on('btn-settings', 'click', () => { Sound.tap(); openModal('modal-settings'); });

        // lists
        on('cat-list', 'click', guard(onCategoryClick));
        on('level-grid', 'click', onLevelClick);

        // game
        $('keyboard').addEventListener('click', e => {
            const k = e.target.closest('.key');
            if (!k) return;
            if (k.hasAttribute('data-del')) onDelete(); else onKey(+k.dataset.k);
        });
        $('slots').addEventListener('click', e => {
            const s = e.target.closest('.slot');
            if (s) onSlot(+s.dataset.s);
        });
        on('btn-hint', 'click', useHint);
        on('btn-next', 'click', () => { Sound.tap(); closeModal('modal-win'); afterWin(); });
        on('btn-stars-info', 'click', () => {
            Sound.tap();
            const box = $('stars-help');
            box.hidden = !box.hidden;
            $('btn-stars-info').setAttribute('aria-expanded', String(!box.hidden));
        });

        // join gate
        on('btn-join-confirm', 'click', confirmJoin);

        // settings
        on('btn-open-gifts', 'click', openGifts);
        on('btn-free-coins', 'click', guard(openGifts));
        on('btn-reminder-go', 'click', openGifts);
        on('btn-claim-gift', 'click', claimGift);
        on('reward-list', 'click', onRewardListClick);
        on('btn-open-feedback', 'click', () => { Sound.tap(); openLink(FEEDBACK_URL); });
        on('btn-open-changelog', 'click', () => {
            Sound.tap();
            closeModal('modal-settings');
            renderChangelog(false);
            openModal('modal-changelog');
        });
        on('toggle-sound', 'change', e => { S.settings.sound = e.target.checked; Storage.save(); Sound.tap(); });
        on('toggle-theme', 'change', e => { S.settings.darkMode = e.target.checked; applyTheme(); Storage.save(); });

        // profile
        $('gender-picker').addEventListener('click', e => {
            const g = e.target.closest('.gender');
            if (!g) return;
            Sound.tap();
            S.settings.gender = g.dataset.gender;
            Storage.save();
            renderProfile();
            renderUser();
        });
        const openPicker = () => { Sound.tap(); renderAvatarPicker(); openModal('modal-avatar'); };
        on('btn-avatar-picker', 'click', openPicker);
        on('profile-avatar', 'click', openPicker);
        on('avatar-grid', 'click', e => {
            const opt = e.target.closest('.avatar-opt');
            if (opt) pickAvatar(opt.dataset.avatar, opt.dataset.gender);
        });
        on('btn-edit-name', 'click', () => {
            Sound.tap();
            const input = $('name-input');
            input.value = displayName();
            openModal('modal-name');
            setTimeout(() => input.focus(), 60);
        });
        on('name-form', 'submit', e => {
            e.preventDefault();
            const name = cleanName($('name-input').value);
            if (!name) { toast('⚠️', 'نام نمی‌تواند خالی باشد.'); return; }
            Sound.tap();
            S.settings.displayName = name;
            Storage.save();
            closeModal('modal-name');
            renderProfile();
            renderUser();
            toast('✅', 'نام شما ذخیره شد.');
        });

        // suggestions
        on('suggest-form', 'submit', submitSuggest);
        on('sg-idea', 'input', e => { $('sg-count').textContent = fa(e.target.value.length); });
        on('suggest-form', 'input', e => {
            if (!e.target.id) return;
            e.target.classList.remove('is-invalid');
            const err = document.querySelector(`[data-err="${e.target.id}"]`);
            if (err) err.textContent = '';
        });
        on('btn-sg-copy', 'click', () => copyText(suggestText(readSuggest())));
        on('btn-sg-pv', 'click', () => {
            Sound.tap();
            openLink((DB.suggestions && DB.suggestions.contactUrl) || FEEDBACK_URL);
        });

        // modals: [data-close] buttons and backdrop taps on dismissible ones
        document.addEventListener('click', e => {
            const closer = e.target.closest('[data-close]');
            if (closer) {
                const m = closer.closest('.modal');
                if (m) { Sound.tap(); closeModal(m.id); }
                return;
            }
            if (e.target.classList && e.target.classList.contains('modal') && e.target.hasAttribute('data-dismiss')) {
                closeModal(e.target.id);
            }
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                Storage.flush(true);
                Promo.stop();
                return;
            }
            if (pendingReward) {
                returnedFrom.add(pendingReward);
                pendingReward = null;
                closeModal('modal-reward-info');
                renderRewardChannels();
            }
            if (current === 'home') Promo.start();
            if (appReady) setTimeout(maybeRemind, 600);
        });
        window.addEventListener('pagehide', () => Storage.flush(true));

        const wa = webApp();
        try { if (wa && wa.BackButton) wa.BackButton.onClick(goBack); } catch (e) { /* ignore */ }
    }

    /* ----------------------------------------------------------------- boot */

    function initEitaa() {
        const wa = webApp();
        if (!wa) return;
        try { wa.ready(); } catch (e) { /* ignore */ }
        try { wa.expand(); } catch (e) { /* ignore */ }
        const u = wa.initDataUnsafe && wa.initDataUnsafe.user;
        if (u && typeof u === 'object') {
            const id = u.id != null ? u.id : u.user_id != null ? u.user_id : u.userId != null ? u.userId : u.chat_id;
            // without a usable id stay a guest instead of saving under "undefined"
            if (id != null && id !== '') S.user = Object.assign({}, S.user, u, { id: String(id) });
        }
    }

    async function loadData() {
        try {
            const res = await fetch(`data.json?v=${VERSION}`);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            data.categories = (data.categories || []).map(c => Object.assign({}, c, { levels: Array.isArray(c.levels) ? c.levels.filter(l => l && l.emoji && l.answer) : [] }));
            return data;
        } catch (e) {
            console.error('data.json failed to load', e);
            return { categories: [{ id: 'proverbs', name: 'ضرب‌المثل‌ها', icon: '🎭', levels: [{ emoji: '👂🏻🚪👂🏻🥅', answer: 'یه گوشش دره یه گوشش دروازه' }] }], wordBank: [] };
        }
    }

    async function boot() {
        if (store.get('razak_theme') === 'dark') document.documentElement.dataset.theme = 'dark';
        const dataReady = loadData();

        initEitaa();
        paintStaticEmojis();
        buildFloaters();
        earlyPaintUser();
        bind();
        $('version-label').textContent = fa(VERSION);
        Promo.build();
        show('home');

        DB = await dataReady;
        await Storage.load();

        $('toggle-sound').checked = !!S.settings.sound;
        $('toggle-theme').checked = !!S.settings.darkMode;
        applyTheme();
        appReady = true;
        renderHome();
        announceUpdate();
        setTimeout(maybeRemind, 1500);

        // warm the first few puzzles of every category
        idle(() => DB.categories.forEach(cat => cat.levels.slice(0, 2).forEach(l => warmEmojis(l.emoji))));
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
