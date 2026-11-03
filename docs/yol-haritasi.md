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
7. Üretim erişimi başvurusu ve yayın

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
