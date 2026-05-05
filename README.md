# Modüler Masraf Standalone

Bitrix24 bağlantısı olmayan bağımsız masraf yönetim uygulaması.

## Roller

- Satışçı
- Yönetici / Onaycı
- Muhasebe
- Finans
- Admin

## Akış

Satışçı masraf girer -> Yönetici onaylar -> Muhasebe kontrol eder -> Finans ödeme yapar -> Ödendi.

## Railway Variables

SESSION_SECRET=uzun-gizli-bir-key
ADMIN_EMAIL=admin@modulermasraf.com
ADMIN_PASSWORD=guclu-sifre

## Çalıştırma

npm install
npm start
