# awPDF

Web, masaüstü ve Android için **PDF görüntüleme** uygulaması.

**mADEMatik Solutions** — [madematik.com](https://madematik.com)

> Web sürümü: [madematik.com/awPDF](https://madematik.com/awPDF/). Kurulum paketleri: [GitHub Releases](https://github.com/200709078/awPDF/releases/latest).

## Özellikler

- PDF açma, sürükle-bırak, "Birlikte aç", masaüstü ve web'de sekmeler
- Son dosyalar, kalınan sayfadan devam, parolalı PDF'ler
- Sayfa önizleme paneli, içindekiler, sayfaya gitme, PDF içi ve dış bağlantılar
- Yakınlaştırma (iki parmakla da), genişliğe, yüksekliğe ve sayfaya sığdırma
- Tek ve iki sayfa görünümü, görünümü döndürme, tam ekran, koyu tema
- Türkçe harflere uyumlu metin arama, metin seçme ve kopyalama
- Akıllı tahta için sunum modu ve ekran klavyesi
- Yazdırma, Android'de paylaşma
- Büyük dosyalar parça parça okunur; dosya bütünüyle belleğe alınmaz
- Tamamen yerel çalışır: PDF hiçbir sunucuya gönderilmez, internet gerekmez

Planlanan özellikler: [docs/yol-haritasi.md](docs/yol-haritasi.md).

## Geliştirme

Node.js 22.13 veya üstü gerekir.

```sh
npm ci
npm run dev
npm test
```

Komutların tamamı `package.json` dosyasındadır.

## Lisans

[MIT](LICENSE). PDF motoru [pdf.js](https://github.com/mozilla/pdf.js) Apache 2.0 lisanslıdır.
