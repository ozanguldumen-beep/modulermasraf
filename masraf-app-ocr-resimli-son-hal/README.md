# Modüler Masraf App - OCR + Fiş Görseli

## Kurulum

1. ZIP dosyasını klasöre çıkar.
2. `config.js` dosyasını aç.
3. Çalışan Bitrix24 webhook adresini yaz:

```js
const WEBHOOK = "https://modulerotomasyon.bitrix24.com.tr/rest/12/xxxxxxxxxxxx/";
```

4. `index.html` dosyasına çift tıkla.
5. Fiş fotoğrafını seç.
6. Tutarı kontrol et.
7. Bitrix24’e gönder.

## Ne yapar?

- CRM > Anlaşmalar içine masraf kaydı açar.
- OCR ile tutarı okumaya çalışır.
- Fiş görselini JPEG olarak küçültür.
- Fiş görselini ilgili anlaşmanın timeline yorumuna ekler.

## Not

Görsel ekleme için webhook izinlerinde CRM izni olmalı.
