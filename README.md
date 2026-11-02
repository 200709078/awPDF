# awPDF

Web, masaüstü ve Android için **PDF görüntüleme** uygulaması.

**mADEMatik Solutions** — [madematik.com](https://madematik.com)

> Geliştirme aşamasında; henüz sürüm yayımlanmadı.

## Özellikler

- PDF açma, sayfalar arasında gezinme, yakınlaştırma ve genişliğe sığdırma
- Metin seçme ve kopyalama
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
