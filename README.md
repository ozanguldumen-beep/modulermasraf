
# Modüler Masraf v19 - Stable OCR + Yeni Fiş Alanları

Bu paket v15'te çalışan OCR mantığına geri döner ve yeni fiş alanlarını ekler.

## Eklenen alanlar
- Firma Ünvanı
- Belge Tarihi
- Belge Numarası
- Fiş No
- Vergi Matrahı
- KDV Tutarı
- Toplam Tutar

## Önemli
Railway Variables:
- OCR_PROVIDER=google
- GOOGLE_VISION_API_KEY=...
- SESSION_SECRET=...

## OCR Mantığı
Önce Google TEXT_DETECTION denenir.
Boş dönerse DOCUMENT_TEXT_DETECTION denenir.
