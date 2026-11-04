# awPDF yol haritası

Kullanıcının istekleri ve öneriler tarihiyle buraya yazılır; kullanıcı açıkça istemeden uygulanmaz.
Kesinleşmiş kararlar `CLAUDE.md` dosyasındadır.

## İlk sürüm (2026-11-02)

Hazır olanlar: PDF açma (dosya seçici, sürükle-bırak, "Birlikte aç"), son dosyalar, kalınan sayfadan
devam, parolalı PDF, sekmeler (masaüstü ve web), içindekiler, sunum modu, ekran klavyesi (tahta), Android
geri düğmesi, sayfa düğmeleri, sayfaya gitme, PDF içi ve dış bağlantılar,
yakınlaştırma (iki parmak, ctrl+tekerlek), genişliğe/yüksekliğe/sayfaya sığdırma, tek ve iki sayfa görünümü,
görünümü döndürme, tam ekran, koyu tema, sayfa önizleme paneli, metin seçme, Türkçe uyumlu metin arama,
yazdırma, paylaşma (Android), 200 MB uyarısı.

**Yayın (2026-11-02, kullanıcı):** web sürümü `madematik.com/awPDF/` adresine yüklendi. 0.0.2 ile Linux,
Windows ve imzalı Android paketleri GitHub Releases'te yayımlandı (imza doğrulandı).

## Google Play yayını (2026-11-03, kullanıcı isteği)

Android uygulamaları Google Play'de yayımlanacak; sıra awPDF, drAW, drAW2D, drAW3D. Önce yalnız awPDF;
ötekilere awPDF yayına girince geçilir. Süreç adım adım yürür, kullanıcı bir adımı bitirince sonrakine
geçilir. Kullanıcının henüz geliştirici hesabı yok.

1. Google Play geliştirici hesabı (kişisel hesap, 25 $, kimlik doğrulaması)
   **Bitti (2026-11-03):** hesap onaylandı (ilk adres belgesi okunamadığı için reddedildi, ikincisi kabul edildi).
2. Play'e uygun paket: imzalı AAB (`bundleRelease`) ve iş akışına eklenmesi; Play App Signing kararı.
   **Bitti (2026-11-03):** iş akışı `play-Android` artifact'ı olarak imzalı AAB üretir (dört depoda);
   anahtar `madematik-release.jks` olarak yeniden adlandırıldı. Karar: bu anahtar Play'de hem uygulama
   imza anahtarı (PEPK ile verilir) hem yükleme anahtarı olur.
3. Gizlilik politikası sayfası (madematik.com'da) ve mağaza metinleri, görseller.
   **Bitti (2026-11-03):** `public/gizlilik.html` canlıda (madematik.com/awPDF/gizlilik.html),
   `docs/play/magaza.md`, `docs/play/` görselleri (`scripts/play/` ile üretilir). Herkese açık destek
   adresi destek@madematik.com. Uygulama telefonda denendi, bulunan hatalar düzeltildi.
4. Play Console'da uygulama: mağaza kaydı, uygulama içeriği beyanları (veri güvenliği, içerik derecesi,
   hedef kitle, reklam yok)
5. Dahili test: ilk AAB'yi yükleyip kendi telefonunda denemek
   Play uygulama oluşturulurken kendi anahtarını atamıştı; ilk AAB'den önce "Anahtarı değiştir" → PEPK ile
   bizim anahtar yüklendi (2026-11-03), Play'deki SHA-256 `84:F7:8D:F0:…` doğrulandı.
   İlk dahili test sürümü (0.0.3, sürüm kodu 3) 2026-11-03'te yayımlandı. Play'in "kod gösterme dosyası yok"
   uyarısı yok sayıldı: `minifyEnabled false`, yüklenecek eşleme dosyası yok.
   **Bitti (2026-11-03):** kullanıcının telefonuna Play'den kuruldu (yükleyen `com.android.vending`, imza
   SHA-256 `84f78df0…`, izin yok), PDF açılıyor.
6. Kapalı test: en az 12 test kullanıcısı, kesintisiz 14 gün (2023-11-13'ten sonra açılan kişisel
   hesaplarda her yeni uygulama için şart)
   Kapalı test – Alpha açıldı (2026-11-03): ülke Türkiye, "awPDF" listesinde 13 testçi, sürüm 3 (0.0.3)
   Google incelemesine gönderildi. Katılma bağlantısı testçilere inceleme bitince gönderilecek.
   2026-11-04: inceleme bitti (bekleyen değişiklik yok), bağlantı 16 testçiye gönderildi. 14 gün her testçinin
   katıldığı andan sayılır; en erken 2026-11-18 civarı dolar. Test sırasında yeni sürüm yüklenebilir, süre
   sıfırlanmaz; üretim başvurusunda "geri bildirimle neyi değiştirdiniz" sorusu için değişiklikler not edilir.
   Geri bildirimler testçilerden kullanıcıya doğrudan geliyor; Google'ın görmesi gerekmez, başvuruda özetlenir.
   Testçi geri bildirimleri (2026-11-04): belgeyi kapatıp ilk ekrana dönmek (Android geri düğmesi,
   "Belgeyi Kapat" düğmesi); arama vurgusunun renkleri; Word → PDF ve PDF → Word dönüştürme.
   0.0.4 (sürüm kodu 4) 2026-11-04'te yayımlandı: ilk iki geri bildirim ve sistem çubuğu rengi düzeltmesi.
   GitHub sürümü, web (madematik.com/awPDF/) ve Projelerim sayfası güncel; AAB kapalı teste yüklenecek.
7. Üretim erişimi başvurusu ve yayın

## Belgeyi kapatıp ilk ekrana dönmek (2026-11-04, kullanıcı isteği)

**Yapıldı (2026-11-04, 0.0.4 için):** ikisi de; testler `android.spec.ts` ve `reading.spec.ts`'te.

**Kaynak: kapalı test kullanıcılarının geri bildirimi** (kullanıcıya doğrudan söylediler).

Şu an masaüstünde ve web'de belge sekmedeki küçük ✕ ya da Ctrl+W ile kapanıyor, son belge kapanınca ilk
ekran ("PDF Aç" ve son dosyalar) geliyor. Android'de (tek belge, sekme yok) kapatmanın yolu yok: geri
düğmesi açık olanları kapatıp en sonda uygulamayı arka plana alıyor, belge açık kalıyor. Sırayla:

1. **Android geri düğmesi belgeyi kapatsın:** önce pencere, sunum, menü, arama, yan panel, tam ekran
   kapanır; sonra belge kapanır ve ilk ekran gelir; uygulama ancak ilk ekranda arka plana gider (Adobe
   Reader ve Google'ın görüntüleyicisi de böyle). Yanlışlıkla basmanın zararı küçük: belge Son Dosyalar'da
   kalır, kalınan sayfadan açılır. Kısıt: "Birlikte aç" ile gelen dosyaların çoğu listeden yeniden
   açılamaz (izin bitiyor), dosya yöneticisinden yeniden açılır.
2. **"Belgeyi Kapat" düğmesi, bütün platformlarda:** geri düğmesi görünmez bir yol, sekmedeki ✕ de tahtada
   parmakla zor. Araç çubuğunun sonunda durur, dar ekranda ☰ menüsüne düşer.

## Arama vurgusunun renkleri (2026-11-04, kullanıcı kararı)

**Yapıldı (2026-11-04, 0.0.4 için).**

**Kaynak: kapalı test kullanıcılarının geri bildirimi** (kullanıcıya doğrudan söylediler).

Şu an pdf.js'in varsayılanları: bulunanlar yarı saydam mor (kırmızı-pembe görünüyor), aktif olan yarı saydam
koyu yeşil. Karar: **bulunanlar sarı (fosforlu kalem gibi), aktif olan turuncu ve çevresinde ince koyu turuncu
çerçeve**; harfler okunur kalacak kadar saydam. Chrome ve Edge'in sayfa içi aramasıyla aynı renkler; mavi metin
seçimiyle karışmaz, kitapların mavi, kırmızı, pembe kutularında da seçilir, renk körlüğünde de ayırt edilir
(yeşil-kırmızı edilmez). Mavi düşünüldü, metin seçimiyle karıştığı için seçilmedi. Değişiklik `app.css`'te
pdf.js'in `--highlight-bg-color` ve `--highlight-selected-bg-color` değişkenleri (ve çerçeve).

## Word ↔ PDF dönüştürme (2026-11-04, kullanıcı isteği)

**Sıra (2026-11-04, kullanıcı kararı):** 0.0.5 Word → PDF, 0.0.6 PDF → Word; kapalı test sırasında, yetişmeyen
yayından sonraki ilk güncellemeye kalır.

**Kaynak: kapalı test kullanıcılarının geri bildirimi** (kullanıcıya doğrudan söylediler).

Her şey cihazda yapılır; internetteki dönüştürme servisleri kullanılmaz (PDF cihazdan çıkmaz kararı ve Play'deki
"veri gönderilmez" beyanı). Denemeler kullanıcının iki dosyasıyla, yalnız yerelde yapıldı; kod değişmedi.

**PDF → Word (karar: awPDF yolu, gerekirse sonra düzeltme ekranı):**

1. **Otomatik dönüştürücü:** metin düzenlenebilir metin olur (satır, paragraf, kalın, punto, üs ve alt simge);
   formüller, şekiller, fotoğraflar ve tablolar sayfadan kesilip resim olarak aynı yere konur. pdf.js'ten metin,
   konum ve yazı tipi; çizimlerin yeri işlem listesinden (kırpma sınırları dahil); Word dosyasını `docx`
   kütüphanesi (MIT) yazar. Sonuç "Farklı kaydet" ile yeni dosyadır, PDF'e dokunulmaz.
   Deneme (MATEMATİK_12, 6 sayfa, 7 sn): yaklaşım çalışıyor. Bu kitapta formül işaretleri MathMagic yazı
   tiplerinde (MM…) ve yanlış kodlanmış ("≥" → "2", "≠" → "!"), bu yüzden formülü resim yapmak şart; x, f(x),
   rakamlar düz yazı tipinde, formül sınırı tahminle bulunuyor. Sağlamlaştırılacaklar: bölünen formüller, üst
   üste kesirler, iki sütunlu sayfada sıra, kutu zeminleri ve yazı renkleri. Sade PDF'lerde sonuç daha iyi olur.
   LibreOffice'in PDF → Word çevirisi kullanılamaz: her satır ayrı metin kutusu (6 sayfada 2.800'den fazla),
   LibreOffice dosyayı açarken takılıyor.
2. **Düzeltme ekranı, gerekirse (FineReader benzeri):** dönüştürmeden önce sayfanın üstünde bölgeler renkli
   kutularla gösterilir; kullanıcı kutu siler, yeni kutu çizer, boyutunu değiştirir, sonra dönüştürür. İsteğe
   bağlı adım ("Doğrudan dönüştür" kalır). 1. adım gerçek kullanımda denendikten sonra karar verilir.
   Düzenlenebilir tablo ve taranmış sayfalar (OCR) bu planın dışında, ayrı adımlar.

**Word → PDF:** kelime işlemci gerekmez; belge sayfa sayfa çizilip PDF olarak kaydedilir. Deneme (1 ÜNİTE 11
EKİM.docx, Word'de 90 sayfa): LibreOffice 7 sn'de 92 sayfa, Word'e çok yakın. docx-preview (Apache 2.0,
tarayıcıda çalışır, web ve Android'e de girer) 6 sn'de 95 sayfa; metin, tablolar, denklemler, resimler doğru;
grafik ve SmartArt boş, madde işaretleri yok, sayfa bölünmeleri farklı. Öneri: her yerde docx-preview (awPDF
Word dosyasını açıp gösterir, "PDF olarak kaydet" bir düğme olur); masaüstünde LibreOffice kuruluysa onu kullanmak.
Yazı tipleri için Carlito/Caladea gibi ölçüsü aynı serbest yazı tipleri uygulamaya konabilir.

## Sonraki araçlar (önerilen sıra)

1. İşaretleme, not ve kalem
2. Form doldurma
3. Sayfa işlemleri: birleştirme, bölme, silme, sıralama, kalıcı döndürme
4. Görsel ↔ PDF dönüştürme ve küçültme
5. Taranmış PDF'ler için Türkçe OCR
6. İmza ve parola koyma

## Denenmesi gerekenler

- **Arama vurgusu (2026-11-03, düzeltildi):** vurgu sözcüğün sağına ve altına kayıyordu, telefonda çok
  belirgindi. Asıl neden bizim stilimizdi: `* { box-sizing: border-box }` pdf.js'in sayfasına da uyuyor,
  çizim kenarlığın içine sığmak için küçülüyor, metin katmanı tam boyda kalıyordu (telefonda %5). Artık
  pdf.js'in sayfası `content-box`; test: "işaretin oturduğu metin katmanı…". Kalan küçük fark pdf.js'in:
  satırı tarayıcının yedek yazı tipiyle ölçüp genişliğe uyduruyor, satır ortasında vurgu biraz kayabilir.
- **Sistem çubuklarının rengi (2026-11-04, düzeltildi, 0.0.4):** derleme açık temanın rengini `#ffffff` yerine
  `#fff` yazıyor, Android `Color.parseColor` bunu okumuyordu; 0.0.3'te koyu temadan açık temaya dönünce çubuklar
  koyu kalmış olmalı (telefonda bakılmalı). Renk artık altı haneli gönderiliyor; derlenmiş sürümün testi
  (`TEST_PREVIEW=1`) bunu yakaladı.
- **Telefon testi (2026-11-03, Android 13, Xiaomi):** izinsiz açılış, "Birlikte aç", sistemin dosya
  seçicisi, dış bağlantı (onaydan sonra tarayıcı) ve iç bağlantı, Türkçe arama, geri düğmesi, sayfa paneli,
  parolalı PDF, 410 sayfalık kitap (2 sn'de açılıyor, kaldığı sayfa hatırlanıyor), yazdırma, paylaşma,
  sunum, koyu tema denendi, çalışıyor. Düzeltilenler: sunumda dik ekranda sayfa üste yapışıyordu (artık
  dikeyde ortada); koyu temada durum ve gezinme çubukları beyaz kalıyordu (artık araç çubuğunun rengini
  alıyor, telefon çevrilince de).
- **İzlenecek (2026-11-03):** kitap ilk açılışta bir kez kendiliğinden 2. sayfaya geçti, sayfa turuncu
  odak çerçevesiyle göründü; üç denemede tekrarlanmadı.
- **Sunumda kamera deliği (2026-11-03):** tam ekranda Android içeriği kamera deliğinin şeridine taşırmıyor;
  sayfa web görünümünde ortada, ekranın tamamına göre durum çubuğu yüksekliğinin yarısı kadar aşağıda.
  İstenirse `layoutInDisplayCutoutMode` ile yalnız sunumda şerit de kullanılabilir.

- **Android:** büyük dosyayı dosya seçiciden okumak yavaş olabilir; gerekirse yerel okuma eklenir
  (`PdfFile.read`). Yazdırma, paylaşma, tam ekran ve "Birlikte aç" kullanıcının telefonunda denendi, sorun görülmedi
  (2026-11-02). Geri düğmesi denenmeli.
- **200 MB eşiği:** tahta ve düşük güçlü tablet testlerinden sonra gözden geçirilir; gerekirse
  platforma göre ayrılır.
- **Son dosyalar:** Android'de "Birlikte aç" ile gelen dosyaların çoğu listeden yeniden açılamaz (izin o
  ziyaretle bitiyor), dosya yeniden seçilir; kendi seçicisinden açılanlar açılır. Cihazda denenmeli.
- **Birlikte aç (masaüstü):** Linux ve Windows'ta dosya yöneticisinden denenmeli; Windows varsayılan
  uygulamayı değiştirmez, kullanıcı "Birlikte aç" listesinden seçer.
- **Tahta:** sunum modu ve ekran klavyesi (ETA Klavye, Onboard) gerçek tahtada denenmeli; burada klavye
  servisi sahte komutlarla sınandı.
- **Uzun kitap yazdırma:** 410 sayfalık 70 MB'lık kitabın tamamı (2026-11-02, Electron) yaklaşık 1 dakikada
  hazırlanıyor, bellek 1,9 GB'a çıkıyor. Öneri: sayfa aralığı seçerek yazdırma.
- **Masaüstü yazdırma:** sistem yazdırma penceresi otomatik testle denenemiyor; elle bakılmalı.
- **Eski tabletler:** en eski WebView'da açılış ve bellek kullanımı.
