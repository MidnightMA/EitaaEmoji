'use strict';
/**
 * تست‌های چرخش هفتگیِ کانال اجباری (Razak Mandatory Channel Rotation).
 *
 * اجرا:
 *   npm test
 *   (یا مستقیم: node --test)
 *
 * هیچ پکیج/فریم‌ورک تستی نصب نمی‌شود — از ماژول‌های داخلی خودِ Node.js
 * استفاده شده (node:test و node:assert، از Node 18 به بعد موجودند)، چون
 * پروژه یک سایت کاملاً استاتیک است و نباید هیچ وابستگی اضافه‌ای بگیرد.
 *
 * تاریخ («now») در همه‌ی تست‌ها به‌صورت صریح ساخته و پاس داده می‌شود (نه
 * Date واقعی سیستم) — دقیقاً «تاریخ قابل mock» که در درخواست خواسته شده بود.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, loadAppWithConfig } = require('./load-app');

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

// می‌سازد: یک Date که دقیقاً وسط هفته‌ی شماره weekIndex (0-based) است، از
// روی خودِ startDate ساخته می‌شود (نه با حدس زدن تاریخ واقعی تقویمی) — یعنی
// تست‌ها کاملاً مستقل از «امروز» در دنیای واقعی هستند.
function dateForWeek(app, weekIndex) {
    const startMs = new Date(app.ROTATION_CONFIG.startDate).getTime();
    return new Date(startMs + weekIndex * MS_PER_WEEK + MS_PER_WEEK / 2);
}

test('هفته ۱، ۲، ۳، ۴ → به ترتیب همان چهار کانال پیکربندی‌شده', () => {
    const app = loadApp();
    // نکته فنی: Array.from چون آرایه‌ی اصلی داخل vm sandbox جداست؛ برای
    // deepEqual درست، اول به یک آرایه‌ی معمولیِ همین realm تبدیلش می‌کنیم.
    const ids = Array.from(app.ROTATION_CONFIG.channels).map(c => c.id);
    assert.deepEqual(ids, ['avay_khiyal', 'tech_nour', 'rasa_meme', 'partner']);

    for (let week = 0; week < 4; week++) {
        const info = app.getCurrentRotationInfo(dateForWeek(app, week));
        assert.equal(info.channel.id, ids[week], `هفته ${week} باید ${ids[week]} باشد`);
        assert.equal(info.weekNumber, week);
    }
});

test('هفته ۵ باید دوباره به همان کانال هفته‌ی ۱ برگردد (چرخه کامل)', () => {
    const app = loadApp();
    const week1 = app.getCurrentRotationInfo(dateForWeek(app, 0));
    const week5 = app.getCurrentRotationInfo(dateForWeek(app, 4));
    assert.equal(week5.channel.id, week1.channel.id);
    const week9 = app.getCurrentRotationInfo(dateForWeek(app, 8));
    assert.equal(week9.channel.id, week1.channel.id);
});

test('گذر از سال/ماه هیچ اختلالی در چرخش ایجاد نمی‌کند (محاسبه فقط بر مبنای فاصله زمانی مطلق است، نه تقویم)', () => {
    const app = loadApp();
    const farFuture = dateForWeek(app, 60);     // ~۱۴ ماه بعد
    const veryFarFuture = dateForWeek(app, 210); // ~۴ سال بعد

    for (const now of [farFuture, veryFarFuture]) {
        const info = app.getCurrentRotationInfo(now);
        assert.ok(info, 'باید یک کانال معتبر برگرداند');
        const expectedWeek = Math.floor((now.getTime() - new Date(app.ROTATION_CONFIG.startDate).getTime()) / MS_PER_WEEK);
        assert.equal(info.weekNumber, expectedWeek);
    }
});

test('ری‌استارت سرور/برنامه: دو بارگذاریِ کاملاً مستقل، برای یک «now» یکسان، دقیقاً همان نتیجه را می‌دهند', () => {
    const appInstanceA = loadApp(); // شبیه‌سازی اجرای اول (قبل از ری‌استارت)
    const appInstanceB = loadApp(); // شبیه‌سازی اجرای دوم (بعد از ری‌استارت) — سندباکس کاملاً تازه
    const now = dateForWeek(appInstanceA, 17);

    const infoA = appInstanceA.getCurrentRotationInfo(now);
    const infoB = appInstanceB.getCurrentRotationInfo(now);
    assert.equal(infoA.channel.id, infoB.channel.id);
    assert.equal(infoA.weekNumber, infoB.weekNumber);
});

test('غیرفعال کردن یک کانال: چرخش خودکار آن را رد می‌کند، بدون تغییر الگوریتم', () => {
    const app = loadApp();
    app.ROTATION_CONFIG.channels.find(c => c.id === 'tech_nour').enabled = false;

    const seenIds = new Set();
    for (let week = 0; week < 6; week++) {
        seenIds.add(app.getCurrentRotationInfo(dateForWeek(app, week)).channel.id);
    }
    assert.ok(!seenIds.has('tech_nour'), 'کانال غیرفعال هرگز نباید انتخاب شود');
    assert.deepEqual([...seenIds].sort(), ['avay_khiyal', 'partner', 'rasa_meme'].sort());
});

test('افزودن یک کانال پنجم: بدون هیچ تغییری در الگوریتم، چرخه خودش ۵تایی می‌شود', () => {
    const app = loadApp();
    app.ROTATION_CONFIG.channels.push(
        { id: 'fifth', type: 'channel', name: 'کانال پنجم', icon: '🆕', username: 'fifth_channel', enabled: true }
    );
    const ids = [];
    for (let week = 0; week < 5; week++) {
        ids.push(app.getCurrentRotationInfo(dateForWeek(app, week)).channel.id);
    }
    assert.deepEqual(ids, ['avay_khiyal', 'tech_nour', 'rasa_meme', 'partner', 'fifth']);
    assert.equal(app.getCurrentRotationInfo(dateForWeek(app, 5)).channel.id, 'avay_khiyal');
});

test('حذف یک کانال: چرخه خودش کوتاه‌تر می‌شود، بدون هیچ تغییری در الگوریتم', () => {
    const app = loadApp();
    app.ROTATION_CONFIG.channels = app.ROTATION_CONFIG.channels.filter(c => c.id !== 'rasa_meme');
    const ids = [];
    for (let week = 0; week < 3; week++) {
        ids.push(app.getCurrentRotationInfo(dateForWeek(app, week)).channel.id);
    }
    assert.deepEqual(ids, ['avay_khiyal', 'tech_nour', 'partner']);
});

test('پیکربندی نامعتبر (همه کانال‌ها غیرفعال/آرایه خالی) → به‌جای کرش، به‌شکل امن null برمی‌گرداند', () => {
    const app = loadApp();
    app.ROTATION_CONFIG.channels.forEach(c => { c.enabled = false; });
    assert.equal(app.getCurrentRotationInfo(dateForWeek(app, 3)), null);
    assert.equal(app.getCurrentMandatoryChannel(dateForWeek(app, 3)), null);

    const app2 = loadApp();
    app2.ROTATION_CONFIG.channels = [];
    assert.equal(app2.getCurrentRotationInfo(dateForWeek(app2, 3)), null);
});

test('کاربری که عضو کانالِ همین هفته شده → تأییدشده محسوب می‌شود', () => {
    const app = loadApp();
    const info = app.getCurrentRotationInfo(dateForWeek(app, 2));
    const joinGate = { confirmedChannelId: info.channel.id, confirmedWeekNumber: info.weekNumber };
    assert.equal(app.isJoinConfirmedForCurrentWeek(joinGate, info), true);
});

test('کاربری که فقط عضو کانالِ هفته‌ی قبل بوده → برای هفته‌ی جدید کافی نیست', () => {
    const app = loadApp();
    const prevWeekInfo = app.getCurrentRotationInfo(dateForWeek(app, 2));
    const currentWeekInfo = app.getCurrentRotationInfo(dateForWeek(app, 3));
    const joinGate = { confirmedChannelId: prevWeekInfo.channel.id, confirmedWeekNumber: prevWeekInfo.weekNumber };
    assert.equal(app.isJoinConfirmedForCurrentWeek(joinGate, currentWeekInfo), false);
});

test('کاربری که اصلاً عضو نشده → تأیید نشده محسوب می‌شود', () => {
    const app = loadApp();
    const info = app.getCurrentRotationInfo(dateForWeek(app, 1));
    const joinGate = { confirmedChannelId: null, confirmedWeekNumber: null };
    assert.equal(app.isJoinConfirmedForCurrentWeek(joinGate, info), false);
});

test('وقتی هیچ کانال فعالی نیست (info=null)، هیچ‌کس بلاک نمی‌شود (fail-open امن، نه یک قفل ابدی)', () => {
    const app = loadApp();
    const joinGate = { confirmedChannelId: null, confirmedWeekNumber: null };
    assert.equal(app.isJoinConfirmedForCurrentWeek(joinGate, null), true);
});

// --- تست‌های سیم‌کشی واقعی فایل‌های config/mandatory-channels/*.js ---
// این بخش دقیقاً همان ترتیب لود اسکریپت‌ها در index.html را شبیه‌سازی
// می‌کند (نه fallback را)، تا مطمئن شویم فایل‌های جداگانه‌ی هر کانال واقعاً
// به‌درستی با هم ترکیب می‌شوند.
test('فایل‌های جدا config/mandatory-channels/*.js درست با هم ترکیب می‌شوند (نه fallback)', () => {
    const app = loadAppWithConfig();
    const ids = Array.from(app.ROTATION_CONFIG.channels).map(c => c.id);
    assert.deepEqual(ids, ['avay_khiyal', 'tech_nour', 'rasa_meme', 'partner']);
    assert.equal(app.ROTATION_CONFIG.startDate, '2025-01-06T00:00:00+03:30');
});

test('نتیجه‌ی چرخش با فایل‌های جدا، دقیقاً همان نتیجه‌ی fallback داخلی app.js است', () => {
    const appFallback = loadApp();
    const appReal = loadAppWithConfig();
    const now = dateForWeek(appFallback, 25);

    const infoFallback = appFallback.getCurrentRotationInfo(now);
    const infoReal = appReal.getCurrentRotationInfo(now);
    assert.equal(infoFallback.channel.id, infoReal.channel.id);
    assert.equal(infoFallback.weekNumber, infoReal.weekNumber);
});

test('غیرفعال کردن یک کانال مستقیماً در فایل خودش (enabled: false) از چرخش حذفش می‌کند', () => {
    const app = loadAppWithConfig();
    app.ROTATION_CONFIG.channels.find(c => c.id === 'partner').enabled = false;
    const seenIds = new Set();
    for (let week = 0; week < 3; week++) {
        seenIds.add(app.getCurrentRotationInfo(dateForWeek(app, week)).channel.id);
    }
    assert.ok(!seenIds.has('partner'));
});

// نکته درباره‌ی «خطای API عضویت»: این پروژه یک سایت کاملاً استاتیک است و
// هیچ بک‌اندی برای احراز واقعیِ عضویت کاربر در کانال ندارد (نه Bot Token
// داریم، نه سروری که آن را مخفی نگه دارد). به همین دلیل، «تست خطای API
// عضویت» روی این معماری معنا ندارد؛ نزدیک‌ترین معادل واقعی همان تست
// «fail-open امن» بالاست: اگر تشخیص کانال فعال به هر دلیلی ممکن نباشد
// (info=null)، کاربر قفل نمی‌شود، نه اینکه دروغ «عضو نیستی» به او گفته شود.
