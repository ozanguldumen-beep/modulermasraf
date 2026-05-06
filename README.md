# Modüler Masraf v13 OCR Fix

Bu paket, önceki başarılı v12 dosyaları baz alınarak hazırlanmıştır.

## Değişiklikler

- Admin panel yapısı sade tutuldu, eski akış korundu.
- OCR butonu korunmuştur: `Fişi Oku / Tutarı Otomatik Doldur`.
- `/public/ocr.js?v=13` cache kırma ile çağrılır.
- Google Vision API key yoksa sistem bunu ekranda açıkça bildirir.
- Fişler public uploads altında tutulmaz.
- Fişler `private_uploads/receipts/YYYY/MM` altında tutulur.
- Fiş görüntüleme sadece yetki kontrolünden sonra `/receipt/:id/view` ile yapılır.
- OCR sonucu şu alanları doldurmaya çalışır:
  - Firma Ünvanı
  - Belge Numarası
  - Vergi Matrahı
  - KDV Tutarı
  - Toplam Tutar
  - Masraf Tarihi
- OpenAI API key verilirse OCR metni AI ile parse edilir.
- OpenAI API key yoksa regex fallback ile en az tutar/tarih okunmaya çalışır.

## Railway Variables

```env
SESSION_SECRET=...
DEFAULT_USER_PASSWORD=123456
ADMIN_EMAIL=ozan@modulerotomasyon.com
ADMIN_PASSWORD=123456
OCR_PROVIDER=google
GOOGLE_VISION_API_KEY=...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.3
```

## Not

Google Vision OCR gerçek okuma yapabilmek için `GOOGLE_VISION_API_KEY` ister. Bu key olmadan gerçek Google OCR çalışmaz; sistem elle girişe izin verir.
