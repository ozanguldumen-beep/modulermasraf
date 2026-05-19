# Modüler Masraf Sistemi v19.1

## Railway kurulum

1. Railway PostgreSQL ekle.
2. Variables içinde şu değerler olmalı:

```text
DATABASE_URL=Railway PostgreSQL URL
SESSION_SECRET=uzun-bir-secret
OCR_PROVIDER=google
GOOGLE_VISION_API_KEY=...
UPLOAD_DIR=uploads
```

3. Start command otomatik:

```bash
npm start
```

`npm start` sırasıyla şunları yapar:

- Prisma generate
- Prisma db push
- Seed kullanıcı/kurallar
- Server başlatma

## Test kullanıcıları

Şifre hepsi için: `123456`

- ozan@modulerotomasyon.com
- celal@modulerotomasyon.com
- seren@modulerotomasyon.com
- ferhat@modulerotomasyon.com
- personel@modulerotomasyon.com

## Kontrol adresleri

- `/healthz` → ok dönmeli
- `/api/version` → 19.1.0 dönmeli

## Modüller

- Mobil masraf girişi
- Google Vision OCR
- Fiş sağlık kontrolü
- Risk kuralları
- Dinamik onay akışı
- Yönetici paneli
- Finans ödeme listesi
- Excel export
- Yorum ve log sistemi


## v19.2
- Google Vision sonrası OpenAI JSON parser eklendi.
- /api/ocr-status artık openai durumunu gösterir.
- Tarih, tutar, KDV, matrah ve belge/fiş no alanları AI ile düzeltilir.
