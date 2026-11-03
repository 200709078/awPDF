// Mağaza ekran görüntülerinde açılan örnek belge: kendi yazdığımız bir çalışma kâğıdı, böylece
// görüntülerde başkasına ait içerik olmaz. Chromium'un PDF çıktısıyla üretilir.
const parabola = Array.from({ length: 81 }, (_, i) => {
  const x = -4 + i / 10
  return `${200 + x * 40},${200 - (x * x - 4) * 20}`
}).join(' ')

const sine = Array.from({ length: 161 }, (_, i) => {
  const x = i / 160 * 4 * Math.PI
  return `${20 + x * 28},${110 - Math.sin(x) * 70}`
}).join(' ')

const grid = (width: number, height: number, step: number) =>
  Array.from({ length: width / step + 1 }, (_, i) => `M${i * step} 0V${height}`).join('')
  + Array.from({ length: height / step + 1 }, (_, i) => `M0 ${i * step}H${width}`).join('')

const rows = [-3, -2, -1, 0, 1, 2, 3]
  .map(x => `<tr><td>${x}</td><td>${x * x - 4}</td><td>${2 * x + 1}</td></tr>`).join('')

export const sampleHtml = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 22mm 20mm; }
  body { font-family: 'DejaVu Sans', sans-serif; color: #1f2937; font-size: 11.5pt; line-height: 1.55; }
  h1 { color: #2563eb; font-size: 24pt; margin: 0 0 4mm; }
  h2 { color: #e11d48; font-size: 15pt; margin: 9mm 0 3mm; border-bottom: 1.5pt solid #e5e7eb; padding-bottom: 1.5mm; }
  .lead { color: #4b5563; font-size: 12.5pt; }
  .box { background: #eff6ff; border-left: 4pt solid #2563eb; padding: 3mm 5mm; margin: 4mm 0; }
  .formula { font-family: 'DejaVu Serif', serif; font-size: 14pt; text-align: center; margin: 4mm 0; }
  figure { text-align: center; margin: 5mm 0; }
  figcaption { color: #6b7280; font-size: 10pt; }
  table { border-collapse: collapse; margin: 4mm auto; }
  td, th { border: 1pt solid #cbd5e1; padding: 1.5mm 6mm; text-align: center; }
  th { background: #f1f5f9; }
  ol li { margin-bottom: 3mm; }
  .page { break-after: page; }
</style></head><body>
<section class="page">
  <h1>Fonksiyonlar ve Grafikleri</h1>
  <p class="lead">Çalışma kâğıdı · 10. sınıf matematik</p>
  <h2>1. Fonksiyon nedir?</h2>
  <p>Bir A kümesinin her elemanını B kümesinin <b>yalnız bir</b> elemanıyla eşleyen bağıntıya
  A'dan B'ye bir fonksiyon denir. Fonksiyonlar çoğunlukla <i>f</i>, <i>g</i>, <i>h</i> gibi harflerle gösterilir.</p>
  <div class="box">Düşey doğru testi: Bir grafiği her düşey doğru en çok bir noktada kesiyorsa grafik bir fonksiyona aittir.</div>
  <h2>2. İkinci dereceden fonksiyonlar</h2>
  <p class="formula">f(x) = ax² + bx + c &nbsp;&nbsp; (a ≠ 0)</p>
  <p>Grafiği bir paraboldür. a &gt; 0 ise kollar yukarı, a &lt; 0 ise aşağı doğrudur.
  Tepe noktasının apsisi r = −b / 2a eşitliğiyle bulunur.</p>
  <figure>
    <svg width="400" height="300" viewBox="0 0 400 300">
      <path d="${grid(400, 300, 20)}" stroke="#e5e7eb" stroke-width="1"/>
      <path d="M0 200H400M200 0V300" stroke="#6b7280" stroke-width="1.5"/>
      <polyline points="${parabola}" fill="none" stroke="#2563eb" stroke-width="3"/>
      <path d="M60 300L340 20" stroke="#e11d48" stroke-width="3"/>
      <circle cx="200" cy="280" r="5" fill="#2563eb"/>
      <text x="345" y="70" fill="#2563eb" font-size="18" font-style="italic">f</text>
      <text x="282" y="95" fill="#e11d48" font-size="18" font-style="italic">g</text>
    </svg>
    <figcaption>Şekil 1. f(x) = x² − 4 (mavi) ve g(x) = 2x + 1 (kırmızı)</figcaption>
  </figure>
</section>
<section class="page">
  <h2>3. Değer tablosu</h2>
  <p>Aşağıdaki tabloda f(x) = x² − 4 ve g(x) = 2x + 1 fonksiyonlarının bazı değerleri verilmiştir.
  Tabloyu kullanarak iki grafiğin kesiştiği noktaları yaklaşık olarak belirleyiniz.</p>
  <table><tr><th>x</th><th>f(x)</th><th>g(x)</th></tr>${rows}</table>
  <h2>4. Alıştırmalar</h2>
  <ol>
    <li>f(x) = x² − 6x + 5 fonksiyonunun tepe noktasını ve x eksenini kestiği noktaları bulunuz.</li>
    <li>Işık hızıyla ilgili bir problemde mesafe d(t) = 3·10⁸ · t fonksiyonuyla veriliyor. d(2) değerini hesaplayınız.</li>
    <li>İki fonksiyonun grafiği hangi noktalarda kesişir? f(x) = x² − 4 ve g(x) = 2x + 1 için çözünüz.</li>
    <li>Bir dikdörtgenin çevresi 20 cm'dir. Alanını bir kenar uzunluğunun fonksiyonu olarak yazınız ve en büyük alanı bulunuz.</li>
  </ol>
  <div class="box">İpucu: Kesişim noktaları için f(x) = g(x) denklemini çözün.</div>
</section>
<section>
  <h2>5. Trigonometrik fonksiyonlar</h2>
  <p>Sinüs fonksiyonu periyodiktir: her 2π aralığında aynı değerleri alır. En büyük değeri 1, en küçük değeri −1'dir.</p>
  <p class="formula">sin(x + 2π) = sin x</p>
  <figure>
    <svg width="400" height="220" viewBox="0 0 400 220">
      <path d="${grid(400, 220, 20)}" stroke="#e5e7eb" stroke-width="1"/>
      <path d="M0 110H400M20 0V220" stroke="#6b7280" stroke-width="1.5"/>
      <polyline points="${sine}" fill="none" stroke="#e11d48" stroke-width="3"/>
      <text x="300" y="30" fill="#e11d48" font-size="16">y = sin x</text>
    </svg>
    <figcaption>Şekil 2. Sinüs fonksiyonunun iki periyodu</figcaption>
  </figure>
  <h2>6. Değerlendirme</h2>
  <p>Bu bölümde fonksiyon kavramını, ikinci dereceden fonksiyonların grafiklerini ve trigonometrik
  fonksiyonların periyodikliğini inceledik. Sonraki çalışma kâğıdında ters fonksiyonlara geçeceğiz.</p>
</section>
</body></html>`
