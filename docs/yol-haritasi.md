# awPDF yol haritası

Kullanıcının istekleri ve öneriler tarihiyle buraya yazılır; kullanıcı açıkça istemeden uygulanmaz.
Kesinleşmiş kararlar `CLAUDE.md` dosyasındadır.

## İlk sürüm (2026-11-02)

İskelette hazır olanlar: PDF açma (dosya seçici), sayfa düğmeleri, yakınlaştırma, genişliğe ve
yüksekliğe sığdırma, iki sayfa görünümü, sayfa önizleme paneli, metin seçme, 200 MB uyarısı.

**Yayın kararı (2026-11-02, kullanıcı):** temel özellikler bitmeden web sürümü yüklenmez ve sürüm
çıkarılmaz.

Kalanlar:

- **Açma:** sürükle-bırak, "Birlikte aç" (Linux, Windows, Android), son dosyalar, kalınan sayfadan
  devam, parolalı PDF
- **Gezinme:** içindekiler (yan panelde sekme olarak), sayfa numarasına gitme, PDF içi bağlantılar
- **Görünüm:** iki parmakla yakınlaştırma, sayfaya sığdırma, görünümü döndürme, tek sayfa görünümü,
  tam ekran, koyu tema
- **Metin:** arama (yalnız istenince çalışır, iptal edilebilir)
- **Dış bağlantılar:** onay sorarak açılır; şimdilik kapalı
- **Diğer:** yazdırma, paylaşma (Android), masaüstünde sekmeler, Android geri düğmesi
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
  (`PdfFile.read`). Doğrudan yazdırma ve "Birlikte aç" küçük bir yerel kod ister.
- **Türkçe arama:** `I/ı` ve `İ/i` eşleşmeleri ayrıca denenmeli, gerekirse düzeltilmeli.
- **200 MB eşiği:** tahta ve düşük güçlü tablet testlerinden sonra gözden geçirilir; gerekirse
  platforma göre ayrılır.
- **Eski tabletler:** en eski WebView'da açılış ve bellek kullanımı.
