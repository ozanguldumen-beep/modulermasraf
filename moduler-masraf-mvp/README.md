# Modüler Masraf MVP

Bu proje, Modüler Masraf Yönetimi için ilk çalışan web uygulamasıdır.

## Özellikler

- Login sistemi
- Admin kullanıcı otomatik oluşur
- Personel ekleme
- Masraf talebi açma
- Fiş/fatura görseli yükleme
- Onay akışı:
  - Onay Bekliyor
  - 1. Onaylandı
  - 2. Onaylandı
  - Muhasebe Kontrolünde
  - Ödeme Bekliyor
  - Ödendi
  - Reddedildi
  - Eksik Evrak
- Muhasebe ve yönetici paneli
- SQLite veritabanı ile hızlı başlangıç
- Railway / Render uyumlu

## Yerelde Çalıştırma

```bash
npm install
cp .env.example .env
npm start
```

Sonra tarayıcıdan aç:

```text
http://localhost:3000
```

Varsayılan giriş bilgileri `.env` dosyasındadır.

## GitHub'a Yükleme

```bash
git init
git add .
git commit -m "Initial Moduler Masraf MVP"
git branch -M main
git remote add origin https://github.com/KULLANICI_ADIN/moduler-masraf.git
git push -u origin main
```

## Railway Deploy

1. Railway hesabına gir.
2. New Project seç.
3. Deploy from GitHub repo seç.
4. Bu repoyu seç.
5. Environment Variables içine şunları ekle:
   - SESSION_SECRET
   - ADMIN_EMAIL
   - ADMIN_PASSWORD
6. Deploy et.

## Önemli Not

Bu MVP dosyaları sunucuda `/uploads` klasöründe saklar. Railway'de kalıcı dosya saklama için sonraki adımda S3 / Cloudflare R2 eklemek gerekir.
