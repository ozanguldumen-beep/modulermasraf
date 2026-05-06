# Modüler Masraf Sistemi

Kurumsal harcama yönetimi MVP.

## Özellikler

- Personel masraf girişi
- Fiş/fatura upload
- Private storage: `/private_uploads/receipts`
- Google Vision OCR endpoint altyapısı
- OpenAI ile JSON parse altyapısı
- Rol bazlı temel yetki
- Departman yöneticisi → Muhasebe → Finans onay akışı
- Audit log
- 2 yıl retention cron altyapısı
- Railway uyumlu

## Kurulum

```bash
npm install
cp .env.example .env
npm run init-db
npm start
```

Tarayıcı:

```text
http://localhost:3000
```

İlk admin kullanıcı `.env` içindeki `ADMIN_EMAIL` ve `ADMIN_PASSWORD` ile oluşturulur.

## Railway

Railway Variables içine `.env.example` içindeki değişkenleri ekleyin.

## Güvenlik

Fişler public klasörde tutulmaz. Dosya görüntüleme sadece şu rota üzerinden yapılır:

```text
/receipt/:id/view
```

Backend kullanıcının yetkisini kontrol eder.
