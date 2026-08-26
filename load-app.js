'use strict';
/**
 * این فایل app.js را داخل یک «سندباکس» جدا و مستقل بارگذاری می‌کند (بدون
 * DOM واقعی مرورگر)، چون منطق چرخش هفتگی (ROTATION_CONFIG,
 * getCurrentRotationInfo, isJoinConfirmedForCurrentWeek, ...) هیچ وابستگی‌ای
 * به document/window واقعی ندارد — فقط ریاضیِ تاریخ است.
 *
 * هر صدا زدن loadApp() یک سندباکس کاملاً تازه می‌سازد؛ این دقیقاً معادل یک
 * «ری‌استارت کامل» است (چیزی از یک اجرا به اجرای بعدی منتقل نمی‌شود مگر
 * خودِ فایل app.js، دقیقاً همان چیزی که در دنیای واقعی هم بعد از ری‌استارت
 * سرور/دیپلوی مجدد اتفاق می‌افتد).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadApp() {
    const code = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    const sandbox = {};
    sandbox.window = sandbox; // بیشتر کد به‌عنوان window به خودش رفرنس می‌دهد
    sandbox.window.addEventListener = () => {}; // فقط ثبت callback؛ در تست هیچ‌وقت واقعاً اجرا نمی‌شود
    sandbox.console = console;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: 'app.js' });
    return sandbox;
}

module.exports = { loadApp };
