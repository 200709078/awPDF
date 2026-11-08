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
   GitHub sürümü, web (madematik.com/awPDF/) ve Projelerim sayfası güncel; AAB kapalı teste yüklendi, telefonda
   denendi.
   0.0.5 (sürüm kodu 5) 2026-11-06: sayfa aralığıyla yazdırma, form doldurma, Sayfaları Düzenle, görsel ↔ PDF;
   testçinin bildirdiği menü-bağlantı hatası düzeltildi; Android'de görsele çevirme ve yazdırma hızlandı.
   AAB kapalı teste yüklendi (2026-11-06), Google incelemesinde. Üretim başvurusunda "geri bildirimle neyi
   değiştirdiniz" için: menü-bağlantı düzeltmesi, belgeyi kapatma, arama renkleri, görsel ↔ PDF, sayfa işlemleri.
   Kısa açıklama 2026-11-06'da "… koyu tema. Tamamen reklamsız." oldu (kullanıcı isteği; "Sade ve hızlı" → "Sade,
   hızlı", 80 karakter sınırı için). Mağaza metni sürümden bağımsız: Play Console → Kullanıcı sayısını artırın → Play Store'daki varlığı →
   Mağaza girişleri → Varsayılan girişi düzenle; sonra İleri ve incelemeye gönder.
   Satıcı statüsü (AB Dijital Hizmetler Yasası) 2026-11-07'de "tacir değil" olarak beyan edildi. Reklam, ücretli
   sürüm ya da uygulama içi satın alma gelmeden önce Hesabı yönetme'den "tacir" olarak güncellenmeli; o zaman
   adres, telefon ve e-posta Play'de herkese açık olur.
   0.0.6 (sürüm kodu 6) 2026-11-08: işaretleme, imza, PDF küçültme, parola, PDF → Word, Türkçe OCR (ve Word → PDF,
   menü ✕, giriş ekranında yalnız logo). AAB kapalı teste yüklendi, kullanıcı incelemeye gönderdi; aynı gün 14:57'de
   test kullanıcılarına sunuldu. Tam açıklamaya "PDF araçları" bölümü eklendi ve incelemeye gönderildi (yapay zekâ
   beyanında "öğeleri etiketleme" seçildi). Web sürümü güncel. GitHub sürümü: etiketin CI'ında OCR testi düştü
   (Vite `public/ocr`'ı sunmadı, bkz. CLAUDE.md); düzeltildi, main'den "Run workflow" ile 0.0.6 sürümü çıkarıldı (apk, deb, AppImage, exe).
   Yeni araçlar telefonda ve tahtada henüz denenmedi; testçi geri bildirimi beklenir.
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

**Word → PDF yapıldı (2026-11-07, kullanıcı isteği; sürüm bekliyor).** Araç çubuğunda ve ilk ekranda "Word'den PDF";
pencereye bırakılan Word belgesi de dönüştürülür; Sayfaları Düzenle'deki "Dosya Ekle" Word belgesi de alır. Sonuç
"Word'den PDF" başlığıyla düzenleyicide açılır, orada sıralanıp kaydedilir.
- **Masaüstünde LibreOffice kuruluysa (Pardus, tahtalar) PDF'i o yazar:** düzen Word'deki gibi, yazı gerçek metin
  (seçilir, aranır), eski .doc da olur. Kullanıcının denemesi (2026-11-07): iki sütunlu, metin kutulu sınav kâğıdı
  Word'deki gibi 2 sayfa, CV.doc ve kompozisyon doğru; süre 1-16 sn. LibreOffice açıkken de çalışır (ayrı profil).
- **Telefonda, web'de ve LibreOffice olmayan bilgisayarda** belge docx-preview ile çizilir, her sayfa 150 DPI görsel
  olarak PDF'e girer. Yazı seçilemez, aranamaz. Yazı tipleri cihazınkiler (Calibri, Verdana yoksa benzeri);
  satır aralığı Word'e göre ayarlandı (LibreOffice'le aynı sayfada %1 fark). Biraz uzayan sayfa küçültülür,
  sayfa sonu işareti olmayan uzun belge sütun sütun, satır bölünmeden sayfalanır. Symbol ve Wingdings işaretleri
  (≤ ≥ ≠ ± × ÷ π α, ☑ ✓, madde işaretleri) sıradan karakterlere çevrilir. Eski .doc açılmaz (uyarı çıkar).
  **Bilinen sınır:** yüzen metin kutuları (sınav başlığındaki kutu, dikey yazılar) Word'deki yerinde durmaz;
  kullanıcının sınav kâğıdı telefonda 3 sayfa oldu (Word'de 2), sorular doğru sırada ve okunur.
- **Telefonda denendi (2026-11-07, "awPDF Deneme"):** dosya seçicide yalnız .docx seçilebiliyor (.doc soluk),
  sınav kâğıdı 4 sn'den kısa, kompozisyon 1 sn; kaydet ekranı PDF'i yazdı.
- İleride: telefonda metnin seçilebilmesi için sayfaların altına görünmez metin; metin kutularını yerine koymak.

## Sonraki araçlar (önerilen sıra)

1. İşaretleme, not ve kalem — **yapıldı (2026-11-08)**, aşağıda
2. Form doldurma — **yapıldı (2026-11-06)**
3. Sayfa işlemleri: birleştirme, bölme, silme, sıralama, kalıcı döndürme — **yapıldı (2026-11-06)**
4. Görsel ↔ PDF dönüştürme — **yapıldı (2026-11-06)**; küçültme ayrı iş olarak kaldı
5. Taranmış PDF'ler için Türkçe OCR — **yapıldı (2026-11-08)**, aşağıda
6. İmza ve parola koyma — ikisi de **yapıldı (2026-11-08)**, aşağıda

**Kolaydan zora sıra (2026-11-06, kullanıcıya önerildi):** 1. sayfa aralığıyla yazdırma, 2. form doldurma (ilk
kez kaydetme gelir), 3. sayfa işlemleri, 4. görsel ↔ PDF, 5. Word → PDF, 6. işaretleme/not/kalem, 7. imza,
8. PDF küçültme, 9. parola koyma, 10. PDF → Word, 11. Türkçe OCR (dil verisi uygulamaya girer, APK büyür). Hepsi
cihazda çalışır, internet ve yeni izin gerektirmez. Kapalı test sırasında her sürüm tek bir araç getirir ve okuma
akışına dokunmaz. Kullanıcı ilk üçünü istedi (2026-11-06). 6-11 hepsi **2026-11-08'de yapıldı** (aşağıdaki karar).

**Karar (2026-11-08, kullanıcı):** sürüm yükseltmeden önce kalan bütün araçlar eklenir (işaretleme/not/kalem,
imza, küçültme, parola, PDF → Word, OCR). Word → PDF, menü ✕ ve giriş ekranı commit'lenip gönderildi; 0.0.6 araçlar
bitince çıkar. Bu süreçte her biten adım commit + push edilir (kullanıcı izni). **Durum (2026-11-08):** araçların
hepsi yapıldı ve gönderildi; 0.0.6 için sürüm, canlıya alma, AAB ve mağaza metinleri kaldı.

## İşaretleme, not ve kalem (2026-11-08, kullanıcı kararı: bütün araçlar)

**Yapıldı (2026-11-08), sürüm bekliyor.** Araç çubuğunda "İşaretle" (kalem simgesi); altında bir çubuk açılır:
**Kalem** (serbest çizim), **Fosforlu** (metni seçerek ya da sürükleyerek vurgulama), **Metin** (sayfaya dokununca metin
kutusu). Kalem ve metin için siyah, mavi, kırmızı, yeşil; fosforlu için sarı, yeşil, mavi, pembe. Kalem kalınlığı
ince/orta/kalın, yazı küçük/orta/büyük. Geri Al ve Yinele çizgi çizgi çalışır, Seçileni Sil seçilen işareti siler,
**Bitti** (ya da Esc, Android'de geri) okumaya döner. Seçilen bir işaretin rengi ve boyutu da sonradan değişir; işaret
sürüklenerek taşınır.
- pdf.js'in kendi düzenleme katmanı kullanıldı (Firefox'un PDF görüntüleyicisindeki); işaretler PDF'e standart not
  (annotation) olarak yazılır, başka PDF okuyucularda da görünür. Kaydetme yine "Farklı Kaydet": ad "… (işaretli).pdf".
- Yazdırma, görsel olarak kaydetme ve Sayfaları Düzenle işaretleri taşır. Sekme değiştirip dönünce işaretler yerinde
  durur. Kaydedilmemiş işaret varken kapatırken sorulur.
- Kalem veya fosforlu açıkken tek sayfa görünümünde parmakla yana çekmek sayfa çevirmez, çizer; iki parmakla
  yakınlaştırma çalışır.
- Telefonda çubuk iki satır, yalnız simgeler.
- **Denenecek:** tahtada gerçek kalem ve parmakla çizim (ETAP), telefonda parmakla çizim.
- İleride (istenirse): silgi (şimdilik seçip silme), şekiller (ok, dikdörtgen), yapışkan not (yorum).

## İmza (2026-11-08, kullanıcı kararı: bütün araçlar)

**Yapıldı (2026-11-08), sürüm bekliyor.** "İşaretle" çubuğunda "İmza" (araç çubuğu dizüstü ekranında dolu olduğu
için ayrı düğmesi yok; saklanmış imza yoksa doğrudan yeni imza penceresi açılır). Yeni imza
penceresinde üç yol: **Çiz** (parmak, tahta kalemi, fare), **Yaz** (ad el yazısına benzer bir yazı tipiyle; cihazda
yoksa eğik yazı), **Görsel** (beyaz kâğıttaki imzanın fotoğrafı; imza çizgilere çevrilir, zemin alınmaz). İmza
sayfaya resim olarak değil çizgi olarak konur: keskin kalır, dosyayı büyütmez. Konan imza taşınır, köşesinden
boyutlandırılır, silinir.
- "Bu cihazda sakla" (varsayılan açık): imza yalnız bu cihazda (tarayıcının yerel deposu) durur, en çok 5;
  çubukta küçük resmiyle görünür. Düğmeye dokununca sayfanın ortasına, imza kipinde sayfada bir yere dokununca
  oraya konur. Saklanan imzalar "Yeni İmza" penceresinden silinir.
- PDF'e pdf.js'in imza biçimiyle yazılır (çizgi görünümlü damga notu); bu bir **elektronik imza değildir**
  (sertifikalı, e-İmza gibi doğrulanan imza ayrı ve büyük bir iş).
- **Denenecek:** tahtada ve telefonda parmakla imza.

## Türkçe yazı tanıma (OCR) (2026-11-08, kullanıcı kararı: bütün araçlar)

**Yapıldı (2026-11-08), sürüm bekliyor.** "Metni Tanı (OCR)" (dizüstünde ☰ menüsünde): taranmış (yalnız resim olan)
sayfaların yazısı Türkçe tanınır, sayfanın üstüne görünmez bir metin katmanı konur. Kopya "… (metinli).pdf" olarak
kaydedilir ve açılır: içinde arama yapılır, yazı seçilip kopyalanır. Zaten yazısı olan sayfalara dokunulmaz.
- Her şey cihazda: tesseract.js ve Türkçe model uygulamanın içinde, internet gerekmez, sayfa hiçbir yere gitmez
  (gizlilik metni ve Play beyanı değişmez). Test: "Işık", "gölge", "çalışması", "Öğrenciler", "şimdi", "Ağaçların"
  doğru tanınıyor; A4 sayfa bilgisayarda ~5-10 sn.
- **Uygulama yaklaşık 6 MB büyüdü** (tanıma çekirdeği 4 MB, Türkçe model 2 MB); web sitesinde bu dosyalar yalnız OCR
  kullanılınca indirilir. Çok eski WebView'larda (Chrome 91'den önce, 2021) "desteklemiyor" denir.
- **Denenecek:** telefonda gerçek taranmış belgeyle (süre, bellek); tahtada.
- İleride (istenirse): PDF → Word'de taranmış sayfanın yazısını da tanımak.

## PDF → Word (2026-11-08, kullanıcı kararı: bütün araçlar)

**Yapıldı (2026-11-08), sürüm bekliyor.** "Word'e Dönüştür" (dizüstünde ☰ menüsünde): belge cihazda Word'e
(.docx) çevrilir, "Farklı Kaydet" ile "<ad>.docx". 2026-11-04'te kararlaştırılan 1. adım (otomatik dönüştürücü):
- Yazı düzenlenebilir metin olur: satırlar paragraflara birleşir (satır sonunda tireyle bölünmüş kelime birleşir),
  kalın, eğik, altı çizili, punto, yazı tipi (LiberationSerif → Times New Roman gibi), üs ve alt simge, ortalama /
  sağa / iki yana yaslama, ilk satır girintisi. İki sütunlu sayfa Word'de iki sütun olur; üstteki başlık ve alttaki
  yazılar boydan boya kalır.
- Fotoğraf, şekil, tablo, formül (MathType, MathMagic, Symbol yazı tipleri) ve eğik yazılar sayfadan kesilip resim
  olarak aynı yere konur (144 DPI). Sayfa numaraları alınmaz (Word kendi numaralar). Her sayfa Word'de ayrı sayfa,
  boyutu ve kenar boşlukları PDF'teki gibi.
- Kullanıcının dosyalarıyla denendi (yalnız yerelde, LibreOffice çıktısı PDF'ler): kompozisyon neredeyse aynı
  (başlık, 3 paragraf, sağa yaslı imza), sınav kâğıdı 2 sayfa ve 2 sütun (sorular resim olduğu için resim kaldı).
  Süre 2-6 sn.
- **Bilinmeyen:** MathMagic formüllü 410 sayfalık kitap (dosya artık bilgisayarda yok); düzenlenebilir tablo ve
  taranmış sayfalar (OCR) bu adımın dışında. 2. adım (düzeltme ekranı) gerçek kullanımdan sonra kararlaştırılır.
- Yazı rengi şimdilik alınmıyor (hepsi siyah); işaretleme notları yalnız resim olan yerlerde görünür.

## Parola koyma (2026-11-08, kullanıcı kararı: bütün araçlar)

**Yapıldı (2026-11-08), sürüm bekliyor.** "Parola Koy" (dizüstünde ☰ menüsünde): parola iki kez yazılır (en az 4
karakter, "Parolayı göster" seçeneği), kopya "… (parolalı).pdf" olarak kaydedilir; açık belge değişmez. Belge
parolalıysa pencere "Parolayı değiştir" olur: yeni parola ya da **parolasız kaydet** ("… (parolasız).pdf").
- Şifreleme AES-256 (PDF 2.0'ın en güçlü yöntemi; Adobe Reader, tarayıcılar, telefonlar açar). Türkçe harfli
  parola olur. Parola yalnız belgeyi açmayı korur; yazdırma/kopyalama yasağı konmaz (okuyucuların çoğu zaten
  saymaz).
- pdf.js ve bilgisayardaki poppler (`pdfinfo`) ile doğrulandı: parolasız açılmıyor, parolayla açılıyor.
- Parolalı belgeden yapılan kopyada (parola değiştirme/kaldırma, küçültme) pdf.js'in sayfa kopyalama yolu
  kullanılıyor; içindekiler korunuyor (test). Açılırken parola sormayan ama kısıtlı (şifreli) kitaplar da bu yoldan
  geçer.

## PDF küçültme (2026-11-08, kullanıcı kararı: bütün araçlar)

**Yapıldı (2026-11-08), sürüm bekliyor.** "PDF'i Küçült" (dizüstü ekranında ☰ menüsünde, tahtada satırda): Az (baskı
kalitesi), Orta (ekran, e-posta), Çok (en küçük). Belgedeki fotoğraf ve taranmış sayfa görselleri küçültülüp JPEG
olarak yeniden yazılır; yazılar, yazı tipleri, içindekiler ve formlar olduğu gibi kalır, yazı seçilir ve aranır.
Önce eski ve yeni boyut gösterilir, sonra "Farklı Kaydet" ("… (küçültülmüş).pdf"); açık belge değişmez.
İşaretler ve doldurulmuş alanlar küçük kopyaya girer.
- Kullanıcının dosyalarında denendi (yalnız yerelde): sınav kâğıdı 543 → 367 KB (%32, 1 sn), kompozisyon
  158 → 112 KB.
- Parolalı belgenin küçük kopyası **parolasız** olur (kullanılan kütüphane parola yazamaz); parola koyma aracı
  gelince küçük kopyaya yeniden parola konabilir.
- Dokunulmayan görseller: CMYK, 16 bit, maskeli, JBIG2/JPEG 2000 (taranmış siyah-beyaz belgeler çoğunlukla
  JBIG2/CCITT'tir, onlar zaten küçüktür). Büyük kitapla (70 MB) denenmedi: dosya artık bilgisayarda yok.

## Görsel ↔ PDF (2026-11-06, kullanıcı isteği)

**Yapıldı (2026-11-06), 0.0.5'te.** Telefonda denendi.

- **Görsellerden PDF** (araç çubuğu ve ilk ekrandaki düğme; pencereye görsel bırakmak da olur): sayfa boyutu
  sorulur (A4 kenar boşluklu, A4 kenarsız, görselin kendi boyutunda). Geniş görselde A4 yan döner. Oluşan PDF
  "Sayfaları Düzenle" ekranında açılır; orada sıralanır, döndürülür, silinir, sonra kaydedilir; kaydetmeden
  çıkmak sorulur. Telefonun yan kaydedip EXIF ile "dik" işaretlediği fotoğraf dik sayfa olur. Görseller
  JPEG olarak, en uzun kenarı 3508 piksel (A4, 300 DPI) olacak kadar küçültülerek girer. Okunamayan görsel
  (ör. HEIC) adıyla bildirilir.
- **Düzenleyicide "PDF / Görsel Ekle":** var olan bir PDF'e fotoğraf da eklenir.
- **Görsel Olarak Kaydet:** bu sayfa, tüm sayfalar ya da aralık; PNG ya da JPG; 150 ya da 300 DPI. Tek sayfa
  görsel dosyası, birden çok sayfa tek ZIP olur (telefonun kaydet ekranı tek dosya alır). Form alanlarının
  doldurulmuş hâli görsele çıkar.
- **Bölgeyi Görsel Al:** belgenin üstüne bir katman açılır, parmakla ya da fareyle dikdörtgen çizilir; o bölüm
  300 DPI görsel olur, önizlemeyle Kaydet, Kopyala (tarayıcı izin verirse) ve Android'de Paylaş (WhatsApp'a
  soru göndermek için) sunulur. Bölge almak Esc, Vazgeç ya da geri düğmesiyle biter; kaydırmak için önce
  kapatılır. Görünümün döndürmesi görsele de uygulanır.
- **Telefonda denendi (2026-11-06, Xiaomi, "awPDF Deneme" kopyası):** Android'in fotoğraf seçicisi açılıyor
  (izin istemiyor), çoklu seçim çalışıyor; A4 sayfalar doğru; kaydet ekranı PDF, PNG ve ZIP'i yazıyor;
  bölgeyi paylaşınca PNG olarak paylaşma ekranı açılıyor (WhatsApp listede; gönderilmedi); Kopyala
  "kopyalandı" diyor (başka uygulamaya yapıştırmak denenmedi). Bulunup düzeltilenler: fotoğraf seçicinin
  verdiği adlar numara olduğu için PDF "Görseller <tarih>.pdf" adını alıyor; bölge çevrilirken "Bölge
  hazırlanıyor…" yazıyor.
- **WebView'de `toBlob` yavaş (2026-11-06, telefonda ölçüldü):** `canvas.toBlob` PNG ve JPEG'i boş zamana
  bırakıyor, her sayfa ~4 sn bekliyordu (WebP 0,5 sn); `toDataURL` 0,1-0,2 sn. Artık her yerde `toDataURL`
  (`app/images.ts` `canvasBytes`): 5 sayfayı görsele çevirmek 17 sn'den 0,8 sn'ye indi. Android'de yazdırma
  hazırlığı da aynı yoldan geçtiği için o da hızlandı.

## Sayfa aralığıyla yazdırma, form doldurma, sayfa işlemleri (2026-11-06, kullanıcı isteği)

**Yapıldı (2026-11-06), 0.0.5'te.**

- **Yazdırma:** "Yazdır" önce sorar: tüm sayfalar, bu sayfa ya da "1-5, 8, 11-" gibi bir aralık (`core/page-range.ts`).
  Okunamayan aralıkta pencere açık kalır, nedenini söyler. Doldurulmuş form alanları kâğıda çıkar. 410
  sayfalık kitabın birkaç sayfası artık bütün kitabı hazırlamadan yazdırılır.
- **Form doldurma:** pdf.js alanları zaten çiziyordu; eklenen "Farklı Kaydet" (ctrl+s) doldurulmuş kopyayı
  yeni bir dosyaya yazar ("ad (doldurulmuş).pdf"). Kaydedilmemiş değişikliği olan sekmenin adında nokta çıkar;
  kapatırken (✕, Belgeyi Kapat, geri düğmesi, telefonda yeni belge açma) "Kaydet / Kaydetmeden kapat /
  Vazgeç" sorulur; pencereyi kapatırken tarayıcı ve Electron da sorar. Alana yazılan harfler kısayol olmaz;
  tahtada ekran klavyesi çok satırlı alanlarda da açılır, onay kutusunda açılmaz.
- **Sayfaları Düzenle:** tam ekran sayfa kartları. Dokununca seçilir; Sola/Sağa Döndür, Sola/Sağa Taşı, Sil,
  PDF Ekle (birleştirme), Seçilenleri Kaydet (bölme), Kaydet. Fareyle sürükleyip bırakma; parmakla bir an
  basılı tutup sürükleme. Kaydedilen yeni dosya açılır (masaüstünde yeni sekme, telefonda belgenin yerine).
  Değişiklik varken çıkmak (Kapat, Esc, geri düğmesi) sorulur.
- **Kaydetme:** her zaman yeni dosya, açık dosyanın üzerine yazılmaz. Web'de Chromium sorar, ötekilerde
  İndirilenler'e iner; Electron kendi kaydet penceresini açar, açık bir dosya seçilirse reddeder; Android
  sistemin "kaydet" ekranını açar (izin gerekmez).
- **Parola:** pdf.js'in kuralı: yalnız açık belgenin sayfaları kaydedilirse aynı parola kalır; başka PDF
  eklenince yeni dosya parolasız olur (düzenleyici bunu parolalı belgede yazar). Parolalı ek dosya parolası
  sorularak eklenir.
- **Telefonda denendi (2026-11-06):** kaydet ekranı, parmakla basılı tutup sürükleme, form doldurup geri
  düğmesinde "Kaydet" ile kaydetme (değerler dosyada doğru), sayfa aralığı. **Elle bakılacak:** Electron'un
  kaydet penceresi ve pencereyi kapatırken sorusu.

## Menü düğmesi açıkken ✕ olsun (2026-11-06, kullanıcı isteği)

**Yapıldı (2026-11-07), sürüm bekliyor.** Araç çubuğundaki ☰ düğmesi menü açıkken ✕'e dönüşsün; menü kapanınca (✕'e
dokunmak, dışarıya dokunmak, Esc, geri düğmesi, bir madde seçmek) yeniden ☰ olsun. Düğmenin adı da
"Menüyü aç" / "Menüyü kapat" olarak değişsin.

## Giriş ekranında yalnız logo (2026-11-08, kullanıcı isteği)

**Yapıldı (2026-11-08), sürüm bekliyor.** İlk ekranda logonun altındaki "awPDF" yazısı kaldırıldı; logoda ad
zaten yazıyor. Ekran okuyucular adı logonun alt metninden ("awPDF") okur.

## Denenmesi gerekenler

- **Menünün altındaki bağlantı (2026-11-04, testçi bildirdi; 2026-11-06 düzeltildi, 0.0.5'te):** içindekiler
  sayfası açıkken ☰ menüsündeki bir maddeye dokununca madde değil, altındaki PDF bağlantısı çalışıyordu (video:
  menüden Yakınlaştır seçilince sayfa 27-28'e atladı). Neden: pdf.js her bağlantıya ve form alanına artan bir
  z-index veriyor (o belgede 64'e kadar); belge alanı bunları içine almadığı için saydam bağlantılar menünün
  (z-index 20) üstüne çıkıyordu. Yalnız Yakınlaştır değil, menünün bütün maddeleri, dar ekranda belgenin üstüne
  açılan sayfa paneli ve sunumdan çıkış düğmesi de etkileniyordu; bağlantı sayısı çok olan sayfalarda olur.
  Düzeltme: `.document-area { isolation: isolate }`. Test: `toolbar.spec.ts` "belgedeki bağlantılar…" (düzeltme
  olmadan düşüyor). Telefonda testçinin PDF'iyle denendi: bağlantının üstündeki menü maddesi çalışıyor.

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
