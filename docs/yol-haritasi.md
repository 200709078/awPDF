# awPDF yol haritası

Kullanıcının istekleri ve öneriler tarihiyle buraya yazılır; kullanıcı açıkça istemeden uygulanmaz.
Kesinleşmiş kararlar `CLAUDE.md` dosyasındadır.

## İlk sürüm (2026-11-02)

Hazır olanlar: PDF açma (dosya seçici), sayfa düğmeleri, sayfaya gitme, PDF içi ve dış bağlantılar,
yakınlaştırma (iki parmak, ctrl+tekerlek), genişliğe/yüksekliğe/sayfaya sığdırma, tek ve iki sayfa görünümü,
görünümü döndürme, tam ekran, koyu tema, sayfa önizleme paneli, metin seçme, Türkçe uyumlu metin arama,
yazdırma, paylaşma (Android), 200 MB uyarısı.

**Yayın (2026-11-02, kullanıcı):** web sürümü `madematik.com/awPDF/` adresine yüklendi. Sürüm paketi henüz
yayımlanmadı; Linux, Windows ve imzalı Android paketleri GitHub Actions'ta derleniyor (imza doğrulandı).

Kalanlar:

- **Açma:** sürükle-bırak, "Birlikte aç" (Linux, Windows, Android), son dosyalar, kalınan sayfadan
  devam, parolalı PDF
- **Gezinme:** içindekiler (yan panelde sekme olarak)
- **Diğer:** masaüstünde sekmeler, Android geri düğmesi
- **Telefon:** araç çubuğu dar ekrana sığmıyor, şimdilik yana kayıyor; menüye toplanmalı
- **Tahta:** ekran klavyesi (drAW'daki kopya alınabilir), sunum modu

## Sonraki araçlar (önerilen sıra)

1. İşaretleme, not ve kalem
2. Form doldurma
3. Sayfa işlemleri: birleştirme, bölme, silme, sıralama, kalıcı döndürme
4. Görsel ↔ PDF dönüştürme ve küçültme
5. Taranmış PDF'ler için Türkçe OCR
6. İmza ve parola koyma

## Denenmesi gerekenler

- **Android:** büyük dosyayı dosya seçiciden okumak yavaş olabilir; gerekirse yerel okuma eklenir
  (`PdfFile.read`). Yazdırma, paylaşma ve tam ekran yerel eklentiyle yapıldı, derleniyor ama
  cihazda denenmedi. "Birlikte aç" da küçük bir yerel kod ister.
- **200 MB eşiği:** tahta ve düşük güçlü tablet testlerinden sonra gözden geçirilir; gerekirse
  platforma göre ayrılır.
- **Masaüstü yazdırma:** sistem yazdırma penceresi otomatik testle denenemiyor; elle bakılmalı.
- **Eski tabletler:** en eski WebView'da açılış ve bellek kullanımı.
