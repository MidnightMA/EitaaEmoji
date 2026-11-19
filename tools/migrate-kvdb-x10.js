#!/usr/bin/env node
// =====================================================
// RAZAK — مهاجرت یک‌باره‌ی اقتصاد سکه (×۱۰) روی دیتابیس KVDB
// =====================================================
// کاری که می‌کند: برای هر رکورد کاربر که هنوز پرچم economyVersion >= 2 ندارد،
// globalScore و totalEarned را دقیقاً ×۱۰ می‌کند و پرچم را ثبت می‌کند. بقیه‌ی
// فیلدها (progress، levelStats، مدال‌ها، تنظیمات و ...) عیناً دست‌نخورده می‌مانند.
//
// ایمنی:
//   • پیش‌فرض dry-run است؛ فقط گزارش می‌دهد و چیزی نمی‌نویسد. برای اجرای واقعی --apply
//   • قبل از هر نوشتن، کل دیتابیس در یک فایل JSON پشتیبان گرفته می‌شود
//   • اجرای دوباره امن است (رکوردهای دارای پرچم رد می‌شوند)
//   • بعد از هر نوشتن، رکورد دوباره خوانده و ×۱۰ بودن آن تأیید می‌شود
//   • کلیدهای غیرکاربری (پیشنهادها sug_*، پشتیبان‌ها *_backup_*) رد می‌شوند
//   • خود بازی هم برای رکوردهای بدون پرچم، همین مهاجرت را هنگام ورود کاربر انجام
//     می‌دهد؛ پرچم مشترک است پس هیچ‌وقت دو بار ضرب نمی‌شود.
//
// استفاده:
//   node migrate-kvdb-x10.js <BUCKET_ID>                    # گزارش (dry-run)
//   node migrate-kvdb-x10.js <BUCKET_ID> --apply            # اجرای واقعی
//   اگر باکت secret key دارد:  KVDB_SECRET=... node migrate-kvdb-x10.js <BUCKET_ID> --apply
//   (برای تست روی سرور محلی: KVDB_BASE=http://localhost:8080 )
const fs = require('fs');
const ECONOMY_VERSION = 2, MULT = 10;
const [bucket, ...flags] = process.argv.slice(2);
const APPLY = flags.includes('--apply');
const BASE = (process.env.KVDB_BASE || 'https://kvdb.io').replace(/\/$/, '');
if (!bucket) { console.error('استفاده: node migrate-kvdb-x10.js <BUCKET_ID> [--apply]'); process.exit(1); }
const headers = process.env.KVDB_SECRET
    ? { Authorization: 'Basic ' + Buffer.from(process.env.KVDB_SECRET + ':').toString('base64') } : {};

const isFlagged = d => Math.max(Number(d.economyVersion) || 0, Number(d.settings && d.settings.economyVersion) || 0) >= ECONOMY_VERSION;

async function listAll() {
    const res = await fetch(`${BASE}/${bucket}/?values=true&format=json`, { headers });
    if (!res.ok) throw new Error('خواندن لیست ناموفق: HTTP ' + res.status);
    const body = await res.json();
    // پاسخ می‌تواند آرایه‌ای از [key, value] یا آبجکت باشد؛ هر دو پوشش داده شده
    return Array.isArray(body) ? body.map(x => Array.isArray(x) ? x : [x.key, x.value]) : Object.entries(body);
}

(async () => {
    const rows = await listAll();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = `kvdb-backup-${stamp}.json`;
    fs.writeFileSync(backupFile, JSON.stringify(rows, null, 2));
    console.log(`✔ پشتیبان ${rows.length} رکورد ذخیره شد: ${backupFile}`);

    const stats = { total: rows.length, toMigrate: 0, migrated: 0, alreadyDone: 0, skipped: 0, failed: 0 };
    for (const [key, raw] of rows) {
        if (/^sug_/.test(key) || /_backup_/.test(key)) { stats.skipped++; continue; }
        let data;
        try { data = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { stats.skipped++; continue; }
        if (!data || typeof data !== 'object' || typeof data.globalScore !== 'number') { stats.skipped++; continue; }
        if (isFlagged(data)) { stats.alreadyDone++; continue; }

        const gs = data.globalScore;
        const te = typeof data.totalEarned === 'number' ? data.totalEarned : gs;
        const next = { ...data, globalScore: gs * MULT, totalEarned: te * MULT, economyVersion: ECONOMY_VERSION,
            settings: { ...(data.settings || {}), economyVersion: ECONOMY_VERSION } };
        if (![gs, te].every(Number.isFinite) || gs < 0 || te < 0 || !Number.isSafeInteger(next.globalScore) || !Number.isSafeInteger(next.totalEarned)) {
            console.error(`✘ ${key}: مقدار نامعتبر، رد شد`); stats.failed++; continue;
        }
        stats.toMigrate++;
        if (!APPLY) { console.log(`… ${key}: ${gs} → ${next.globalScore} | ${te} → ${next.totalEarned}`); continue; }
        try {
            const put = await fetch(`${BASE}/${bucket}/${key}`, { method: 'PUT', body: JSON.stringify(next), headers });
            if (!put.ok) throw new Error('PUT ' + put.status);
            const back = JSON.parse(await (await fetch(`${BASE}/${bucket}/${key}`, { headers })).text());
            if (back.globalScore !== gs * MULT || back.totalEarned !== te * MULT || !isFlagged(back)) throw new Error('تأیید پس از نوشتن ناموفق');
            stats.migrated++;
            console.log(`✔ ${key}: ${gs} → ${back.globalScore}`);
        } catch (e) { console.error(`✘ ${key}: ${e.message}`); stats.failed++; }
    }
    console.log('\nگزارش:', stats, APPLY ? '' : '\n(dry-run بود؛ برای اجرای واقعی --apply اضافه کن)');
    process.exit(stats.failed ? 2 : 0);
})().catch(e => { console.error('خطا:', e.message); process.exit(1); });
