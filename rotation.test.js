'use strict';
/**
 * تست‌های چرخش هفتگیِ کانال اجباری (Razak Mandatory Channel Rotation).
 *
 * اجرا:
 *   node --test tests/
 *
 * هیچ پکیج/فریم‌ورک تستی نصب نمی‌شود — از ماژول‌های داخلی خودِ Node.js
 * استفاده شده (node:test و node:assert، از Node 18 به بعد موجودند)، دقیقاً
 * چون پروژه یک سایت کاملاً استاتیک است و نباید هیچ وابستگی اضافه‌ای بگیرد.
 *
 * تاریخ («now») در همه‌ی تست‌ها به‌صورت صریح ساخته و به توابع پاس داده
 * می‌شود (نه Date واقعی سیستم) — دقیقاً همان چیزی که «تاریخ قابل mock» در
 * درخواست خواسته شده بود. توابع rotation از قبل همین الگو را دارند
 * (getCurrentRotationInfo(now = new Date())).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./load-app');

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

// می‌سازد: یک Date که دقیقاً وسط هفته‌ی شماره weekIndex (0-based) است. با
// ساختن تاریخ از روی خودِ startDate (نه با حدس زدن تاریخ واقعی تقویمی)،
// تست‌ها کاملاً مستقل از این هستند که «امروز» در دنیای واقعی چه روزی است.
function dateForWeek(app, weekIndex) {
    const startMs = new Date(app.ROTATION_CONFIG.startDate).getTime();
    return new Date(startMs + weekIndex * MS_PER_WEEK + MS_PER_WEEK / 2);
}

test('هفته ۱، ۲، ۳، ۴ → به ترتیب همان چهار کانال پیکربندی‌شده', () => {
    const app = loadApp();
    // نکته فنی: چون app.ROTATION_CONFIG.channels داخل یک vm sandbox جداست،
    // با Array.from آن را به یک آرایه‌ی معمولیِ همین realm تبدیل می‌کنیم تا
    // deepEqual بتواند درست مقایسه کند (وگرنه دو آرایه از دو realm متفاوت،
    // حتی با مقادیر یکسان، از نظر مرجع/constructor برابر شناخته نمی‌شوند).
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
    // و هفته ۹، ۱۳، ... (چند دور کامل بعدتر) هم باید همان باشد
    const week9 = app.getCurrentRotationInfo(dateForWeek(app, 8));
    assert.equal(week9.channel.id, week1.channel.id);
});

test('گذر از سال/ماه هیچ اختلالی در چرخش ایجاد نمی‌کند (محاسبه فقط بر مبنای فاصله زمانی مطلق است، نه تقویم)', () => {
    const app = loadApp();
    // ~14 ماه بعد از شروع (قطعاً از مرز چند ماه و حداقل یک سال رد می‌شود)
    const farFuture = dateForWeek(app, 60);
    // ~4 سال بعد از شروع
    const veryFarFuture = dateForWeek(app, 210);

    for (const now of [farFuture, veryFarFuture]) {
        const info = app.getCurrentRotationInfo(now);
        assert.ok(info, 'باید یک کانال معتبر برگرداند');
        // نتیجه باید دقیقاً با محاسبه‌ی مستقل هم‌خوان باشد؛ یعنی الگوریتم
        // هیچ رفتار خاص/باگ نزدیک مرز سال یا ماه ندارد.
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
    // هفته ششم باید دوباره برگردد به اولین کانال
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
    // کاربر دقیقاً همان چیزی را تأیید کرده که هفته‌ی قبل لازم بود
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

// نکته درباره‌ی «خطای API عضویت»: این پروژه یک سایت کاملاً استاتیک است و
// هیچ بک‌اندی برای احراز واقعیِ عضویت کاربر در کانال ندارد (نه Bot Token
// داریم، نه سروری که آن را مخفی نگه دارد) — این محدودیت هم در کامنت‌های
// بالای ROTATION_CONFIG در app.js و هم در پاسخ نهایی توضیح داده شده. به
// همین دلیل، «تست خطای API عضویت» روی این معماری معنا ندارد؛ نزدیک‌ترین
// معادل واقعی همان تست «fail-open امن» بالاست: اگر تشخیص کانال فعال به هر
// دلیلی ممکن نباشد (info=null)، کاربر قفل نمی‌شود، نه اینکه دروغ «عضو
// نیستی» به او گفته شود.
