# Modüler Masraf v5

Bu sürümde:

- Şirket Rolü alanı ayrı hale getirildi ve admin tarafından değiştirilebilir.
- Satış Yöneticisi / Satış Sorumlusu ayrımı eklendi.
- Onay akışı güncellendi: Satış Sorumlusu -> Satış Yöneticisi -> Satış Müdürü -> Muhasebe Müdürü -> Finans Müdürü -> Muhasebe Ödeme Listesi.
- Celal Eşli: Finans Müdürü / Şirket Ortağı, tam görünürlük. Sil/Pasife Al butonu yok.
- Ozan Güldümen: Satış Müdürü / Şirket Ortağı, tam görünürlük.
- Yetkilisi listesindeki seçenekler genişletildi: Ozan, Ferhat, Seren, Celal ve gelecekte eklenecek Satış Yöneticileri görünebilir.
- Sil butonu yerine güvenli Pasife Al bağlantısı eklendi. Geçmiş masraflar bozulmaz.

Varsayılan şifre: 123456


## v6 Silme Fix

- Destek Mail seed datasından tamamen kaldırıldı.
- Mevcut data/db.json içinde destek@akuvoxinterkom.com varsa uygulama açılırken temizlenir.
- Ozan Güldümen ve Celal Eşli kritik kullanıcı olarak korunur; Sil butonu görünmez.
- Diğer kullanıcılar için Sil çalışır:
  - Masraf geçmişi yoksa fiziksel siler.
  - Masraf geçmişi varsa geçmiş bozulmasın diye pasife alır.


## v7 Müdür Listesi + OCR

- Bağlı olduğu müdür listesi artık sadece Ozan/Ferhat değil:
  Satış Müdürü, Teknik Müdür, Muhasebe Müdürü, Finans ve Admin rollerindeki aktif kullanıcılar gelir.
- Masraf eklerken fiş/fatura fotoğrafı seçildiğinde tarayıcı içinde OCR çalışır.
- OCR tutarı ve tarihi otomatik doldurmaya çalışır.
- OCR ücretsizdir, dış API maliyeti yoktur.


## v8 Profesyonel OCR

Bu sürümde tarayıcı içi OCR kaldırıldı. Fiş görseli sunucuya gider, sunucu Google Vision veya Azure Vision ile okur.

### Google Vision Kurulumu

Railway Variables içine ekle:

```text
OCR_PROVIDER=google
GOOGLE_VISION_API_KEY=BURAYA_GOOGLE_API_KEY
```

Google Cloud Vision API görsel verisini Base64 içerik olarak alabilir ve OCR yapabilir.

### Azure Vision Kurulumu

Railway Variables içine ekle:

```text
OCR_PROVIDER=azure
AZURE_VISION_ENDPOINT=https://xxx.cognitiveservices.azure.com
AZURE_VISION_KEY=BURAYA_AZURE_KEY
```

Azure Image Analysis API `features=read` ile OCR sonucu döndürür.

### Not

- API key eklenmezse OCR hata verir ama masrafı elle girmeye devam edebilirsin.
- Tutar ve tarih otomatik doldurulur; kullanıcı göndermeden önce kontrol etmelidir.


## v9 OCR Fix

- OCR JavaScript bağlantısı sağlamlaştırıldı.
- Masraf ekleme ekranında OCR durum kutusu görünür.
- Fotoğraf seçilince direkt `/api/ocr` çağrılır.
- `/api/ocr-status` ile Railway OCR variable kontrolü eklenmiştir.


## v10 OCR Button

- Otomatik change event yerine sağlam bir "Fişi Oku" butonu eklendi.
- Fiş seçildikten sonra kullanıcı butona basar.
- Buton `/api/ocr` endpointine dosyayı upload eder.
- Sonuç gelirse tutar ve tarih otomatik doldurulur.
