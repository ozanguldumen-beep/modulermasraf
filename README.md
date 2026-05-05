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
