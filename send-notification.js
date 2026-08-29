/**
 * ⚠️ این فایل «فعال» نیست — یعنی هیچ‌جای بازی رازک (که یک سایت کاملاً
 * استاتیک است: index.html + app.js + style.css + data.json، بدون هیچ
 * سروری) به این فایل وصل نشده و نمی‌تواند وصل شود، چون این فایل به یک
 * محیط اجرای Node.js با دسترسی امن به متغیرهای محیطی نیاز دارد که در
 * GitHub Pages وجود ندارد.
 *
 * این فایل یک TEMPLATE آماده‌ی استفاده است برای وقتی که یک بک‌اند واقعی
 * (مثلاً یک Vercel/Netlify/Cloudflare Function رایگان، یا هر سرور Node.js
 * دیگر) به پروژه اضافه کنی. تا آن موقع، فقط همینجا آماده می‌ماند.
 *
 * مبتنی بر مستندات رسمی ایتا برای ارسال پیام:
 *   https://developer.eitaa.com/docs/Develop/SendMassage
 *
 * ---------------------------------------------------------------------
 * خلاصه‌ی API رسمی (طبق همان مستندات):
 *
 *   POST https://eitaayar.ir/api/app/sendMessage
 *   Content-Type: application/json
 *   Body:
 *   {
 *     "token":   "<توکن برنامه‌ات>",   // هرگز در فرانت‌اند/کد کلاینت قرار نگیرد
 *     "chat_id": 279058397,           // آیدی عددی کاربر در ایتا
 *     "text":    "متن پیام..."         // markdown ساده (bold **متن**, italic __متن__,
 *                                      // کد `code`, لینک [متن](url)) پشتیبانی می‌شود
 *   }
 *
 *   پاسخ موفق دقیقاً همین است؛ هر پاسخ دیگری یعنی ارسال ناموفق بوده:
 *   { "ok": true, "result": "success" }
 *
 * ---------------------------------------------------------------------
 * محدودیت مهم (طبق همان مستندات ایتا): پیام فقط به کاربری قابل ارسال است
 * که از قبل به برنامه‌ات «اجازه‌ی ارسال» داده باشد — این اجازه با یکی از
 * این دو راه به‌دست می‌آید:
 *   ۱. کاربر روی دکمه‌ی «شروع» (Start) برنامه/بات کلیک کرده باشد، یا
 *   ۲. کاربر برنامه را از طریق یک لینک مستقیم داخل یک پیام باز کرده باشد.
 * یعنی صرفاً «کاربر یک‌بار مینی‌اپ رازک را باز کرده» به‌تنهایی کافی نیست —
 * دقیقاً همان چیزی که در درخواست هم به آن اشاره شده بود.
 *
 * شناسه‌ی کاربر (chat_id) از همان جایی می‌آید که رازک همین الان هم ازش
 * استفاده می‌کند: GameState.user.id در app.js، که مستقیماً از
 * window.Eitaa.WebApp.initDataUnsafe.user.id (SDK رسمی ایتا) خوانده
 * می‌شود. یعنی نیازی به یک سیستم شناسایی کاربر جداگانه نیست — دقیقاً طبق
 * درخواست «اگر پروژه از قبل Eitaa ID/chat ID کاربر را ذخیره می‌کند، از
 * همان استفاده کن».
 */

// چون Node.js نسخه‌های ۱۸ به بعد fetch داخلی دارند، هیچ پکیج npm جدیدی لازم
// نیست (نه axios، نه node-fetch). اگر محیط اجرایت Node قدیمی‌تر بود، یک
// polyfill سبک fetch را خودت اضافه کن.

const EITAA_SEND_MESSAGE_URL = 'https://eitaayar.ir/api/app/sendMessage';

/**
 * پیام متنی به یک کاربر ایتا می‌فرستد.
 * @param {number|string} userId  آیدی عددی کاربر در ایتا (همان GameState.user.id سمت کلاینت)
 * @param {string} message        متن پیام (markdown ساده‌ی ایتا پشتیبانی می‌شود)
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function sendMessageToUser(userId, message) {
    // توکن هرگز نباید هارد-کد شود یا لاگ شود — همیشه از متغیر محیطی خوانده
    // می‌شود (روی Vercel/Netlify/Cloudflare: بخش Environment Variables تنظیمات
    // پروژه؛ هیچ‌وقت داخل کد یا Git کامیت نشود).
    const token = process.env.EITAA_APP_TOKEN;
    if (!token) {
        // عمداً مقدار توکن (حتی undefined/خالی بودنش) در پیام خطا لاگ نمی‌شود
        console.error('[sendMessageToUser] EITAA_APP_TOKEN تنظیم نشده است.');
        return { ok: false, error: 'server_misconfigured' };
    }
    if (!userId) {
        return { ok: false, error: 'missing_user_id' };
    }
    if (!message || typeof message !== 'string') {
        return { ok: false, error: 'missing_message' };
    }

    try {
        const response = await fetch(EITAA_SEND_MESSAGE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, chat_id: userId, text: message })
        });

        // خودِ fetch فقط روی خطای شبکه throw می‌کند؛ خطای منطقی ایتا (کاربر
        // اجازه نداده، توکن غلط، و...) در بدنه‌ی پاسخ می‌آید، نه در status.
        let data;
        try {
            data = await response.json();
        } catch (parseErr) {
            console.error('[sendMessageToUser] پاسخ غیرمنتظره از سرور ایتا (JSON نامعتبر).');
            return { ok: false, error: 'invalid_response' };
        }

        if (data && data.ok === true) {
            return { ok: true };
        }

        // طبق مستندات: هر پاسخی غیر از {ok:true, result:"success"} یعنی شکست.
        // خودِ متن دقیق پاسخ (که ممکن است اطلاعات داخلی داشته باشد) را لاگ
        // نمی‌کنیم؛ فقط وضعیت را برمی‌گردانیم. رایج‌ترین دلایل شکست: کاربر
        // هنوز اجازه‌ی ارسال نداده (Start نزده)، یا chat_id اشتباه است.
        console.error('[sendMessageToUser] ارسال پیام ناموفق بود (پاسخ ok:false).');
        return { ok: false, error: 'send_failed' };
    } catch (networkErr) {
        console.error('[sendMessageToUser] خطای شبکه هنگام تماس با API ایتا:', networkErr.message);
        return { ok: false, error: 'network_error' };
    }
}

module.exports = { sendMessageToUser };

/**
 * --------------------------------------------------------------------
 * نمونه‌ی استفاده (بعد از اینکه این فایل را روی یک بک‌اند واقعی دیپلوی
 * کردی — مثلاً به‌عنوان یک Vercel Serverless Function در
 * api/notify.js):
 *
 *   const { sendMessageToUser } = require('./send-notification');
 *
 *   module.exports = async function handler(req, res) {
 *       // این endpoint را خودت پشت یک بررسی مجوز/ادمین بگذار؛ هرکسی نباید
 *       // بتواند از این endpoint برای اسپم به کاربرها استفاده کند.
 *       const { userId, message } = req.body;
 *       const result = await sendMessageToUser(userId, message);
 *       res.status(result.ok ? 200 : 400).json(result);
 *   };
 * --------------------------------------------------------------------
 */
