// =====================================================
// RAZAK WEEKLY MANDATORY CHANNELS — ROTATION INDEX
// EDIT ROTATION ORDER / START DATE / CHANNEL DATA HERE
// =====================================================
// این فایل «ترتیب چرخش» و «تاریخ شروع» را مشخص می‌کند، و اطلاعات ساختاری
// هر سه کانال (آوای‌خیال، تک‌نور، رسامیم) را مستقیماً همینجا نگه می‌دارد.
//
// فیلدهایی که برای هر کانال می‌توانی عوض کنی: name, username, icon, enabled.
// id را عوض نکن (پیشرفت ذخیره‌شده‌ی کاربر با همین id شناخته می‌شود).
//
// ⚠️ توضیحات کامل/متن معرفی هر کانال (همان چیزی که روی صفحه‌ی «قبل از
// شروع...» نشان داده می‌شود) اینجا نیست — مستقیماً داخل index.html نوشته
// شده (سه بلوک join-gate-channel-block با data-channel-id، داخل
// modal-join-gate) تا بدون باز کردن هیچ فایل JS ای قابل ویرایش باشد.
//
// --- برای اضافه/حذف/جابه‌جا کردن یک کانال در چرخش ---
//   افزودن یک کانال کاملاً جدید: یک آبجکت دیگر شبیه پایین به آرایه‌ی order
//            اضافه کن، و یک <div class="join-gate-channel-block hidden"
//            data-channel-id="..."> متناظرش را هم در index.html (داخل
//            modal-join-gate) بنویس.
//   حذف:      خط مربوطه را از آرایه‌ی order زیر پاک کن (یا ساده‌تر: enabled:false).
//   جابه‌جایی ترتیب: فقط ترتیب همین آرایه را عوض کن.
// هیچ‌کدام از این تغییرات نیازی به دست‌زدن به app.js یا الگوریتم چرخش ندارد.
window.MANDATORY_CHANNELS_ROTATION = {
    // مبدأ چرخش: هفته‌ی صفر از همین لحظه شروع می‌شود. تغییر این تاریخ، کل
    // چرخش را جابه‌جا می‌کند؛ بعد از اولین دیپلوی دیگر دستش نزن.
    startDate: '2025-01-06T00:00:00+03:30',
    weeksPerChannel: 1, // هر کانال چند هفته پشت‌سرهم فعال بماند
    order: [
        { id: 'avay_khiyal', type: 'channel', name: 'آوای‌خیال', icon: '🕊️', username: 'avay_khiyal', enabled: true },
        { id: 'tech_nour', type: 'channel', name: 'تِک‌نور', icon: '📢', username: 'Tech_nour', enabled: true },
        { id: 'rasa_meme', type: 'channel', name: 'رسامیم', icon: '😂', username: 'Rasa_Meme', enabled: true }
    ]
};
