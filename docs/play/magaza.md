# awPDF — Google Play mağaza kaydı

Play Console'a girilecek metinler ve görseller. Görseller `npx playwright test -c scripts/play` ile
yeniden üretilir (uygulamanın görünüşü değişince). Sınırlar Play'in sınırlarıdır; `node scripts/play/sinirlar.mjs`
metinlerin sığdığını denetler.

## Ayrıntılar

- **Uygulama adı** (en çok 30 karakter):

<!-- ad -->
awPDF: PDF Okuyucu
<!-- /ad -->

- **Kısa açıklama** (en çok 80 karakter):

<!-- kisa -->
Sade, hızlı PDF okuyucu. Türkçe arama, sunum modu, koyu tema. Tamamen reklamsız.
<!-- /kisa -->

- **Tam açıklama** (en çok 4000 karakter):

<!-- tam -->
awPDF, telefonda, tablette ve sınıftaki akıllı tahtada rahatça kullanılmak için tasarlanmış sade ve hızlı bir PDF okuyucudur. Reklam yoktur, hesap istemez, hiçbir veri toplamaz.

• Büyük kitaplar bile hızlı açılır: dosyanın tamamı belleğe alınmaz, yalnızca ekrandaki sayfalar çizilir.
• Türkçe uyumlu arama: "ı", "i", "İ" ve "I" harfleri doğru eşleşir, bulunan yerler sayfada vurgulanır.
• Sayfa önizlemeleri ve içindekiler paneliyle istediğiniz bölüme tek dokunuşla gidin.
• İki parmakla yakınlaştırma; genişliğe, yüksekliğe ya da sayfaya sığdırma.
• Tek sayfa ya da yan yana iki sayfa görünümü, sayfayı döndürme.
• Sunum modu: sayfalar tam ekranda tek tek gösterilir, dokunarak ilerlersiniz. Derste ve toplantıda kullanışlıdır.
• Koyu tema: arayüz koyulaşır, PDF sayfaları kendi renklerinde kalır.
• Kaldığınız yerden devam: son açılan dosyalar ve en son okuduğunuz sayfa hatırlanır.
• Parolalı PDF'leri açabilir, yazdırabilir ve paylaşabilirsiniz.
• Başka uygulamalardan "Birlikte aç" ile gelen PDF'leri doğrudan açar.

PDF araçları
• Kalem, fosforlu kalem ve metin notu: sayfaya parmağınızla ya da tahta kalemiyle yazın, çizin, vurgulayın.
• İmza: parmakla çizin, adınızı yazın ya da kâğıttaki imzanızın fotoğrafını kullanın; sayfada istediğiniz yere koyun.
• Form doldurma ve "Farklı Kaydet": doldurduğunuz ya da işaretlediğiniz belge yeni bir dosya olur, aslı değişmez.
• Sayfaları düzenleme: silin, döndürün, taşıyın, başka PDF'lerle birleştirin.
• Word'den PDF ve PDF'ten Word: Word belgesini PDF yapın, PDF'i düzenlenebilir Word belgesine çevirin.
• Görsellerden PDF; sayfayı ya da bir bölümünü görsel olarak kaydetme ve paylaşma.
• PDF küçültme: fotoğraflı belgeler küçülür, yazılar yazı olarak kalır.
• Parola koyma, değiştirme ve kaldırma (AES-256).
• Türkçe yazı tanıma (OCR): taranmış belgede arama yapın, yazıyı seçip kopyalayın.
Bütün araçlar cihazınızda çalışır; belgeniz hiçbir yere gönderilmez.

Gizliliğiniz önce gelir
PDF'leriniz yalnızca cihazınızda okunur; hiçbir dosya internete ya da bir sunucuya gönderilmez. Uygulama hiçbir izin istemez, internet izni bile yoktur. PDF içindeki betikler çalıştırılmaz, internet bağlantılarına dokunduğunuzda adres size gösterilir ve onayınız istenir.

Her yerde aynı uygulama
awPDF'in Linux (Pardus dahil) ve Windows sürümleri ile tarayıcıda çalışan web sürümü de vardır: madematik.com/awPDF

awPDF ücretsiz ve açık kaynaklıdır (MIT lisansı). Öneri ve sorunlar için: destek@madematik.com
<!-- /tam -->

## Kategori ve iletişim

- **Uygulama mı, oyun mu:** Uygulama
- **Kategori:** Verimlilik
- **Etiketler (2026-11-03):** Verimlilik, E-okuyucu, Kitaplar ve referans, Araçlar, Eğitim. Play'in
  listesinde "PDF" ya da "Belge görüntüleyici" yok; en yakınları bunlar.
- **E-posta (herkese açık):** destek@madematik.com
- **Web sitesi:** https://madematik.com
- **Telefon:** boş bırakılır (isteğe bağlı).
- **Gizlilik politikası:** https://madematik.com/awPDF/gizlilik.html (kaynağı `public/gizlilik.html`)

## Sürüm notları ("Bu sürümdeki yenilikler", en çok 500 karakter)

Play Console'da sürüm oluşturulurken `<tr-TR>` ile `</tr-TR>` arasına yazılır. En yenisi üstte.

### 0.0.7

<!-- not-0.0.7 -->
İlk ekranda PDF → Word, Word → PDF ve Görsel → PDF düğmeleri. Telefonda metin kutusunun açılmaması, fosforlu kalemin yazının üstünde boyamaması ve yazı tanımanın (OCR) takılması düzeltildi. PDF'ten Word'e çeviride broşür ve kapak sayfalarının düzeni korunur; yazı rengi de aktarılır.
<!-- /not-0.0.7 -->

### 0.0.6

<!-- not-0.0.6 -->
Yeni araçlar: kalem, fosforlu kalem ve metin notu; imza (çizerek, yazarak ya da fotoğraftan); Word'den PDF ve PDF'ten Word; PDF küçültme; parola koyma, değiştirme ve kaldırma; Türkçe yazı tanıma (OCR) ile taranmış belgede arama. Menü açıkken düğmesi ✕ olur. Hepsi cihazda çalışır, belge hiçbir yere gönderilmez.
<!-- /not-0.0.6 -->

### 0.0.5

<!-- not-0.0.5 -->
Sayfa aralığıyla yazdırma, form doldurma ve Farklı Kaydet, Sayfaları Düzenle (sil, döndür, taşı, birleştir), görsellerden PDF, sayfayı ya da bir bölgesini görsel olarak kaydetme ve paylaşma. Menüdeki dokunuşun arkadaki bağlantıya gitmesi düzeltildi.
<!-- /not-0.0.5 -->

### 0.0.4

<!-- not-0.0.4 -->
Belgeyi kapatıp ilk ekrana dönme (geri düğmesi ve Belgeyi Kapat düğmesi), sarı-turuncu arama vurgusu, açık temada durum çubuğu rengi düzeltmesi.
<!-- /not-0.0.4 -->

## Görseller (`docs/play/`)

| Play alanı | Dosya | Ölçü |
|---|---|---|
| Uygulama simgesi | `simge-512.png` | 512×512 |
| Öne çıkan görsel | `one-cikan-1024x500.png` | 1024×500 |
| Telefon ekran görüntüleri | `ekran/telefon-1…4-*.png` | 1080×2160 |
| 7 inç tablet ekran görüntüleri | `ekran/tablet7-1…4-*.png` | 1200×1920 |
| 10 inç tablet ekran görüntüleri | `ekran/tablet10-1…3-*.png` | 2560×1600 |

Ekran görüntülerindeki belge bizim yazdığımız bir çalışma kâğıdıdır (`scripts/play/ornek-belge.ts`);
başkasına ait içerik yoktur.
