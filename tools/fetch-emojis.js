#!/usr/bin/env node
// =====================================================
// ساخت پوشه‌ی emoji/ برای هاست‌کردن تصاویر ایموجی روی سایت خودت
// =====================================================
// چرا؟ بازی الان تصاویر ایموجی را از cdn.jsdelivr.net می‌گیرد که ممکن است در ایران
// کند یا فیلتر باشد. این اسکریپت فقط ایموجی‌هایی را که در data.json استفاده شده‌اند
// (حدود ۴۰۰ فایل کوچک) از بسته‌ی npm دانلود و در پوشه‌ی emoji/ کپی می‌کند.
//
// استفاده (فقط یک‌بار و روی کامپیوتر خودت؛ Node.js لازم است، خود بازی لازم ندارد):
//   node tools/fetch-emojis.js google     # Noto Emoji، لایسنس Apache-2.0 (پیشنهادی)
//   node tools/fetch-emojis.js apple      # ظاهر آیفون؛ ⚠️ تصاویر اپل دارای حق‌کپی‌اند
//   (اختیاری) --tgz=/path/pack.tgz        # اگر بسته را قبلاً دانلود کرده‌ای
// بعد در config.js مقدار emoji.base را 'emoji/' بگذار.
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');

const pack = (process.argv[2] || 'google').replace(/^--.*/, 'google');
if (!['apple', 'google'].includes(pack)) { console.error('بسته باید apple یا google باشد'); process.exit(1); }
const VERSION = '15.0.1';
const tgzArg = process.argv.find(a => a.startsWith('--tgz='));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'emoji');

const data = JSON.parse(fs.readFileSync(path.join(root, 'data.json'), 'utf8'));
const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
const names = new Set();
for (const cat of data.categories) for (const lv of cat.levels) {
    for (const { segment } of seg.segment(lv.emoji)) {
        if (!segment.trim()) continue;
        const hex = [...segment].map(c => c.codePointAt(0).toString(16).padStart(4, '0'));
        names.add(hex.filter(h => h !== 'fe0f').join('-') + '.png');
        names.add(hex.join('-') + '.png');
    }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'emoji-'));
let tgz;
if (tgzArg) tgz = tgzArg.split('=')[1];
else {
    console.log(`دانلود emoji-datasource-${pack}@${VERSION} (حجم زیاد است، صبر کن)...`);
    const name = execFileSync('npm', ['pack', `emoji-datasource-${pack}@${VERSION}`, '--pack-destination', tmp], { encoding: 'utf8' }).trim().split('\n').pop();
    tgz = path.join(tmp, name);
}
execFileSync('tar', ['-xzf', tgz, '-C', tmp, `package/img/${pack}/64`], { stdio: 'inherit' });
const srcDir = path.join(tmp, 'package', 'img', pack, '64');

fs.mkdirSync(outDir, { recursive: true });
let copied = 0;
for (const n of names) {
    const src = path.join(srcDir, n);
    if (fs.existsSync(src)) { fs.copyFileSync(src, path.join(outDir, n)); copied++; }
}
// هر ایموجی باید حداقل یکی از دو نامش پیدا شده باشد
const missing = [];
for (const cat of data.categories) for (const lv of cat.levels) for (const { segment } of seg.segment(lv.emoji)) {
    if (!segment.trim()) continue;
    const hex = [...segment].map(c => c.codePointAt(0).toString(16).padStart(4, '0'));
    const a = hex.filter(h => h !== 'fe0f').join('-') + '.png', b = hex.join('-') + '.png';
    if (!fs.existsSync(path.join(outDir, a)) && !fs.existsSync(path.join(outDir, b))) missing.push(segment);
}
console.log(`✔ ${copied} فایل در ${outDir} کپی شد.`);
if (missing.length) console.warn('⚠️ این ایموجی‌ها در بسته نبودند (به متن سیستمی برمی‌گردند):', [...new Set(missing)].join(' '));
fs.rmSync(tmp, { recursive: true, force: true });
