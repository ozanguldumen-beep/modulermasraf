# Modüler Masraf Enterprise v19

PostgreSQL + Prisma, çalışanlar, izinler, kural merkezi, OCR, onay, finans, Excel, API kullanımı ve audit log içeren modüler başlangıç paketi.

## Railway
1. PostgreSQL ekleyin ve `DATABASE_URL` referansını bağlayın.
2. `SESSION_SECRET`, `GOOGLE_VISION_API_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-4o-mini` ekleyin.
3. Railway Volume ekleyip `/data` yoluna bağlayın.
4. `UPLOAD_DIR=/data/uploads` ekleyin.
5. ZIP içeriğini GitHub köküne yükleyin.

## İlk giriş
- ozan@modulerotomasyon.com
- 123456

## Not
Kural oluşturma/değiştirme yalnızca Ozan Güldümen ve Celal Eşli içindir.
`/health` sağlık kontrolüdür.


## v19.0.2 Migration Safe Fix
Mevcut PostgreSQL verileri korunur. `User`, `Expense`, `Rule` ve `SystemSetting` tablolarına eklenen `updatedAt` alanlarında `@default(now())` bulunduğu için eski satırlar silinmeden şema güncellenebilir. `--force-reset` kullanmayın.
