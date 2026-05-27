# Modüler Masraf v18.12 OCR Parser Tool

Bu sürüm çalışan v18 tabanını korur. PostgreSQL/Prisma yoktur.

## OCR akışı

1. Google Vision görseli okur.
2. Ham OCR metni çıkar.
3. OPENAI_API_KEY varsa OpenAI, metni JSON alanlarına yerleştirir.
4. OpenAI yoksa eski regex parser yedek olarak çalışır.

## Railway Variables

```text
OCR_PROVIDER=google
GOOGLE_VISION_API_KEY=...
OPENAI_API_KEY=...     # opsiyonel ama önerilir
OPENAI_MODEL=gpt-4o-mini
SESSION_SECRET=moduler_masraf_v18_secret
```

## Varsayılan giriş

```text
ozan@modulerotomasyon.com
123456
```

## Notlar

- Tüm tutarlar TL/TRY kabul edilir.
- Belge No emin değilse boş bırakılır.
- Fiş No ayrı alana yazılır.
- Yiyecek/Cafe vb. metinlerden Masraf Türü otomatik Yemek önerilir.
