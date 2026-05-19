# Modüler Masraf Sistemi v19

Mobil uyumlu Node.js + Express + PostgreSQL + Prisma tabanlı masraf sistemi.

## İçerik

- Google Vision OCR
- HEIC/JPEG görsel hazırlama
- Fiş sağlık kontrolü
- Risk motoru
- Dinamik onay akışı
- Yönetici paneli
- Finans ödeme listesi
- Excel export
- Yorum sistemi
- Audit log
- Mobil alt menü

## Railway Variables

```text
DATABASE_URL=Railway PostgreSQL URL
SESSION_SECRET=uzun-gizli-key
OCR_PROVIDER=google
GOOGLE_VISION_API_KEY=Google Vision API Key
UPLOAD_DIR=uploads
```

## Kurulum

```bash
npm install
npx prisma db push
npm run db:seed
npm start
```

## Varsayılan Kullanıcılar

Şifre: `123456`

- ozan@modulerotomasyon.com / PARTNER
- celal@modulerotomasyon.com / PARTNER
- seren@modulerotomasyon.com / ACCOUNTING
- ferhat@modulerotomasyon.com / MANAGER
- personel@modulerotomasyon.com / PERSONEL

## Railway Deploy

1. ZIP içeriğini GitHub reposuna yükleyin.
2. Railway'de PostgreSQL ekleyin.
3. DATABASE_URL otomatik gelmezse Variables içine ekleyin.
4. `GOOGLE_VISION_API_KEY` ekleyin.
5. İlk deploy sonrası Railway console veya local terminalden:

```bash
npx prisma db push
npm run db:seed
```

## Notlar

Bu v19 paketinde tüm temel mimari tek seferde kuruldu. Risk kural limitleri DB'de tutulur. Yönetici panelinde aç/kapat vardır; limit düzenleme ekranı sonraki küçük geliştirme olarak genişletilebilir.
