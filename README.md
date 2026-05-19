# Modüler Masraf Sistemi v18.10 Rollback

Bu paket v19/PostgreSQL denemesi sonrası çalışan OCR hattına geri dönüş içindir.

## İçerik
- Node.js + Express
- Session login
- JSON tabanlı data/db.json
- Google Vision OCR
- HEIC/HEIF -> JPEG server dönüşümü
- Sharp ile görsel optimizasyonu
- Fiş No görünür
- Simetrik masraf formu
- Mobil öncelikli arayüz

## Railway Variables
```text
OCR_PROVIDER=google
GOOGLE_VISION_API_KEY=...
SESSION_SECRET=moduler_masraf_secret
```

## Giriş
```text
ozan@modulerotomasyon.com
123456
```

## Önemli
Bu sürümde PostgreSQL/Prisma yoktur. Amaç çalışan v18.10 OCR yapısına geri dönmektir.
