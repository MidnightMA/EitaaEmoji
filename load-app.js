'use strict';
/**
 * این فایل app.js را داخل یک «سندباکس» جدا و مستقل بارگذاری می‌کند (بدون
 * DOM واقعی مرورگر)، چون منطق چرخش هفتگی (getCurrentRotationInfo,
 * isJoinConfirmedForCurrentWeek, ...) هیچ وابستگی‌ای به document/window
 * واقعی ندارد — فقط ریاضیِ تاریخ است.
 *
 * دو حالت بارگذاری:
 *   loadApp()             فقط app.js — از fallback داخلی‌اش استفاده می‌کند
 *                         (همان ۴ کانال پیش‌فرض)، دقیقاً مثل وقتی که فایل‌های
 *                         config/mandatory-channels/*.js به هر دلیلی لود
 *                         نشده باشند.
 *   loadAppWithConfig()   دقیقاً همان ترتیبی که index.html در مرورگر واقعی
 *                         لود می‌کند: اول ۴ فایل کانال + index.js (پوشه‌ی
 *                         config/mandatory-channels/)، بعد app.js — یعنی
 *                         سیم‌کشی واقعی تولید را تست می‌کند، نه fallback را.
 *
 * هر صدا زدن این توابع یک سندباکس کاملاً تازه می‌سازد؛ این دقیقاً معادل یک
 * «ری‌استارت کامل» است.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function freshSandbox() {
    const sandbox = {};
    sandbox.window = sandbox; // بیشتر کد به‌عنوان window به خودش رفرنس می‌دهد
    sandbox.window.addEventListener = () => {}; // فقط ثبت callback؛ در تست هیچ‌وقت واقعاً اجرا نمی‌شود
    sandbox.console = console;
    vm.createContext(sandbox);
    return sandbox;
}

function runFile(sandbox, relativePath) {
    const code = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
    vm.runInContext(code, sandbox, { filename: relativePath });
}

function loadApp() {
    const sandbox = freshSandbox();
    runFile(sandbox, 'app.js');
    return sandbox;
}

function loadAppWithConfig() {
    const sandbox = freshSandbox();
    // دقیقاً همان ترتیبی که <script> تگ‌ها در index.html دارند
    runFile(sandbox, 'config/mandatory-channels/avaye-khiyal.js');
    runFile(sandbox, 'config/mandatory-channels/tak-noor.js');
    runFile(sandbox, 'config/mandatory-channels/rasamim.js');
    runFile(sandbox, 'config/mandatory-channels/partner.js');
    runFile(sandbox, 'config/mandatory-channels/index.js');
    runFile(sandbox, 'app.js');
    return sandbox;
}

module.exports = { loadApp, loadAppWithConfig };
