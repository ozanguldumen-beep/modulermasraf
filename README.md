# Modüler Masraf v17 - Fiş Alanları

Bu sürümde masraf ekleme ekranına şu alanlar eklendi:

- Firma Ünvanı
- Belge Tarihi
- Belge Numarası
- Fiş No
- Vergi Matrahı
- KDV Tutarı
- Toplam Tutar

OCR sonucu bu alanlara otomatik doldurulur.

Railway Variables:

```env
OCR_PROVIDER=google
GOOGLE_VISION_API_KEY=...
SESSION_SECRET=...
ADMIN_EMAIL=ozan@modulerotomasyon.com
ADMIN_PASSWORD=123456
```


## v18.1 Restore
- v18 yapısı korundu.
- v19 sadeleşmesi geri alınmadı; bu paket v18 tabanlıdır.
- OCR sırası çalışan v15/v16 mantığına çevrildi: önce TEXT_DETECTION, sonra DOCUMENT_TEXT_DETECTION.
