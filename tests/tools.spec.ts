import { expect, test } from '@playwright/test';
import { LARGE_FILE_WARNING_BYTES, formatMegabytes, needsLargeFileWarning } from '../src/core/open-policy';
import { isOpenableLink } from '../src/core/links';
import { foldTurkish } from '../src/core/turkish-search';
import { fromBase64, toBase64 } from '../src/core/base64';
import { RecentFiles } from '../src/core/recent-files';
import { TOOLS } from '../src/tools';
import { parsePageRange } from '../src/core/page-range';
import { PagePlan } from '../src/core/page-plan';
import { blankPdf, buildPdf, isEncrypted, nameWithSuffix } from '../src/core/pdf-build';
import { rotatePages } from '../src/core/pdf-rotate';
import { imagesToPdf } from '../src/core/images-to-pdf';
import { crc32, zip } from '../src/core/zip';
import { isOldWordFile, isWordFile } from '../src/app/word-to-pdf';
import { cssWithFallbacks, cssWithWordLines, plainBullets, symbolText, withFallback, wordLineHeight } from '../src/core/word-fonts';
import { fontStyle, layoutPage, type Glyphs, type Graphic, type TextStyle } from '../src/core/page-layout';
import { protectPdf, passwordBytes } from '../src/core/pdf-encrypt';
import { crc32 as nodeCrc32 } from 'node:zlib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { makePdf } from './helpers/make-pdf.mjs';

/** Each page as "text@rotation", read back by pdf.js. */
async function pagesOf(data: Uint8Array, password?: string): Promise<string[]> {
  const pdf = await getDocument({ data: data.slice(), password, verbosity: 0 }).promise;
  const pages: string[] = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const text = (await page.getTextContent()).items.map(item => ('str' in item ? item.str : '')).join('');
    pages.push(`${text}@${page.rotate}`);
  }
  return pages;
}
const openPdf = (bytes: Buffer, password?: string) => getDocument({ data: new Uint8Array(bytes), password, verbosity: 0 }).promise;

test('her aracın kimliği tektir', () => {
  const ids = TOOLS.map(tool => tool.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test('bir kısayol iki araca bağlanmaz', () => {
  const shortcuts = TOOLS.flatMap(tool => tool.shortcuts ?? []);
  expect(new Set(shortcuts).size).toBe(shortcuts.length);
});

test('büyük dosya uyarısı tam 200 MB\'ın üstünde başlar', () => {
  expect(LARGE_FILE_WARNING_BYTES).toBe(200 * 1024 * 1024);
  expect(needsLargeFileWarning(LARGE_FILE_WARNING_BYTES)).toBe(false);
  expect(needsLargeFileWarning(LARGE_FILE_WARNING_BYTES + 1)).toBe(true);
});

test('boyut Türkçe biçimde yazılır', () => {
  expect(formatMegabytes(1536 * 1024 * 1024)).toBe('1.536 MB');
});

test('Türkçe I harfleri tek harfe iner, uzunluk değişmez', () => {
  const text = 'ISI ısı İZMİR izmir';
  expect(foldTurkish(text)).toBe('iSi isi iZMiR izmir');
  expect(foldTurkish(text).length).toBe(text.length);
});

test('dosya parçası Android köprüsünden bozulmadan geçer', () => {
  const bytes = Uint8Array.from({ length: 200_000 }, (_, index) => (index * 31) % 256);
  expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  expect(fromBase64('')).toEqual(new Uint8Array());
});

test.describe('son dosyalar', () => {
  const memory = () => {
    const values = new Map<string, string>();
    return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  };

  test('son açılan başa gelir, liste sınırlıdır, sayfa ve yer korunur', () => {
    const recent = new RecentFiles(memory());
    for (let index = 0; index < 25; index += 1) recent.remember(`belge${index}`, `${index}.pdf`, undefined);
    expect(recent.list).toHaveLength(20);
    expect(recent.list[0].name).toBe('24.pdf');
    recent.setPage('belge10', 7);
    recent.remember('belge10', 'yeni-ad.pdf', undefined);
    expect(recent.list[0]).toMatchObject({ fingerprint: 'belge10', name: 'yeni-ad.pdf', page: 7 });
    expect(recent.pageOf('tanınmayan')).toBe(1);
  });

  test('kayıt yeniden yüklenir; bozuk kayıt ve dolu depo uygulamayı durdurmaz', () => {
    const store = memory();
    const first = new RecentFiles(store);
    first.remember('belge', 'a.pdf', 'yer');
    expect(new RecentFiles(store).list[0]).toMatchObject({ name: 'a.pdf', source: 'yer' });
    store.setItem('awPDF.recent', '{bozuk');
    expect(new RecentFiles(store).list).toEqual([]);
    const full = new RecentFiles({ getItem: () => null, setItem: () => { throw new Error('dolu'); } });
    full.remember('belge', 'a.pdf', undefined);
    expect(full.list).toHaveLength(1);
  });
});

test('yalnız web ve e-posta bağlantıları uygulamadan çıkar', () => {
  expect(isOpenableLink('https://madematik.com/')).toBe(true);
  expect(isOpenableLink('http://madematik.com/')).toBe(true);
  expect(isOpenableLink('mailto:a@b.co')).toBe(true);
  expect(isOpenableLink('file:///etc/passwd')).toBe(false);
  expect(isOpenableLink('javascript:alert(1)')).toBe(false);
  expect(isOpenableLink('ftp://madematik.com/')).toBe(false);
  expect(isOpenableLink('bu bir adres değil')).toBe(false);
});

test.describe('sayfa aralığı', () => {
  test('aralıklar, tek sayfalar ve açık uçlar belge sırasıyla, birer kez okunur', () => {
    expect(parsePageRange('1-3, 5', 10)).toEqual([1, 2, 3, 5]);
    expect(parsePageRange(' 8- ; 2,2', 10)).toEqual([2, 8, 9, 10]);
    expect(parsePageRange('-2', 10)).toEqual([1, 2]);
    expect(parsePageRange('4–2', 10)).toEqual([2, 3, 4]);
  });

  test('boş, okunamayan ya da belgenin dışındaki aralık geçersizdir', () => {
    for (const text of ['', ' , ', 'a', '1-2-3', '0', '11', '3-12', '1.5']) expect(parsePageRange(text, 10)).toBeNull();
  });
});

test.describe('sayfa planı', () => {
  const describe = (plan: PagePlan) => plan.pages.map(page => `${page.source}:${page.index}@${page.rotation}`).join(' ');
  const keys = (plan: PagePlan, ...positions: number[]) => new Set(positions.map(position => plan.pages[position].key));

  test('döndürme, silme, taşıma ve ekleme sırayı ve açıyı doğru değiştirir', () => {
    const plan = new PagePlan(4);
    expect(plan.isChanged).toBe(false);
    plan.rotate(keys(plan, 0, 2), 1);
    plan.rotate(keys(plan, 2), 1);
    plan.rotate(keys(plan, 3), -1);
    expect(describe(plan)).toBe('0:0@90 0:1@0 0:2@180 0:3@270');
    plan.remove(keys(plan, 1));
    plan.append(1, 2);
    expect(describe(plan)).toBe('0:0@90 0:2@180 0:3@270 1:0@0 1:1@0');
    plan.moveTo(keys(plan, 3, 4), 0);
    expect(describe(plan)).toBe('1:0@0 1:1@0 0:0@90 0:2@180 0:3@270');
    plan.moveTo(keys(plan, 0), 5);
    expect(describe(plan)).toBe('1:1@0 0:0@90 0:2@180 0:3@270 1:0@0');
    expect(plan.isChanged).toBe(true);
  });

  test('adım adım taşıma seçileni blok olarak kaydırır, uçta durur', () => {
    const plan = new PagePlan(5);
    const chosen = keys(plan, 1, 2);
    plan.step(chosen, -1);
    expect(describe(plan)).toBe('0:1@0 0:2@0 0:0@0 0:3@0 0:4@0');
    plan.step(chosen, -1);
    expect(describe(plan)).toBe('0:1@0 0:2@0 0:0@0 0:3@0 0:4@0');
    plan.step(chosen, 1);
    plan.step(chosen, 1);
    plan.step(chosen, 1);
    plan.step(chosen, 1);
    expect(describe(plan)).toBe('0:0@0 0:3@0 0:4@0 0:1@0 0:2@0');
  });

  test('geri alınan değişiklik planı değişmemiş sayar', () => {
    const plan = new PagePlan(2);
    plan.rotate(keys(plan, 0), 1);
    plan.rotate(keys(plan, 0), -1);
    expect(plan.isChanged).toBe(false);
  });
});

test('kaydedilen dosyanın adı eskisinden türer', () => {
  expect(nameWithSuffix('ders.pdf', 'düzenlendi')).toBe('ders (düzenlendi).pdf');
  expect(nameWithSuffix('Ödev.PDF', 'kopya')).toBe('Ödev (kopya).pdf');
  expect(nameWithSuffix('belge', 'kopya')).toBe('belge (kopya).pdf');
});

test.describe('yeni PDF yazma', () => {
  const text = (index: number) => `S${index + 1}`;

  test('sayfalar seçilir, sıralanır, döndürülür ve başka PDF ile birleşir', async () => {
    const primary = await openPdf(makePdf({ pages: 3, text }));
    const other = new Uint8Array(makePdf({ pages: 2, text: index => `E${index + 1}` }));
    const plan = new PagePlan(3);
    plan.append(1, 2);
    const at = (...positions: number[]) => new Set(positions.map(position => plan.pages[position].key));
    plan.remove(at(1));
    plan.rotate(at(0), 1);
    plan.moveTo(at(3), 0);
    expect(await pagesOf(await buildPdf(primary, [other], plan.pages))).toEqual(['E2@0', 'S1@90', 'S3@0', 'E1@0']);
  });

  test('parolalı belgenin yalnız kendi sayfaları aynı parolayla kalır, döndürme bozmaz', async () => {
    const primary = await openPdf(makePdf({ pages: 3, text, password: 'gizli' }), 'gizli');
    expect(await isEncrypted(primary)).toBe(true);
    const plan = new PagePlan(3);
    plan.rotate(new Set([plan.pages[2].key]), -1);
    plan.remove(new Set([plan.pages[1].key]));
    const saved = await buildPdf(primary, [], plan.pages);
    await expect(openPdf(Buffer.from(saved))).rejects.toThrow();
    expect(await pagesOf(saved, 'gizli')).toEqual(['S1@0', 'S3@270']);
  });

  test('parolalı ek dosya boş sayfa yardımıyla parolasız kopyalanır', async () => {
    const added = await openPdf(makePdf({ pages: 2, text: index => `E${index + 1}`, password: 'p' }), 'p');
    const copy = await added.extractPages([{ document: null }, { document: blankPdf() }]);
    const primary = await openPdf(makePdf({ pages: 1, text }));
    const pages = [{ key: 1, source: 0, index: 0, rotation: 0 }, { key: 2, source: 1, index: 1, rotation: 180 }];
    expect(await pagesOf(await buildPdf(primary, [copy], pages))).toEqual(['S1@0', 'E2@180']);
  });

  test('döndürme eski tablolu ve yeni akışlı PDF\'de üst üste uygulanabilir', async () => {
    const table = rotatePages(new Uint8Array(makePdf({ pages: 2, text })), [0, 90]);
    expect(await pagesOf(table)).toEqual(['S1@0', 'S2@90']);
    expect(await pagesOf(rotatePages(table, [270, 90]))).toEqual(['S1@270', 'S2@180']);
    const primary = await openPdf(makePdf({ pages: 2, text }));
    const stream = await primary.extractPages([{ document: null }]);
    expect(await pagesOf(rotatePages(rotatePages(stream, [90, 0]), [90, -90]))).toEqual(['S1@180', 'S2@270']);
  });

  test('döndürülecek bir şey yoksa dosya olduğu gibi kalır', () => {
    const bytes = new Uint8Array(makePdf({ pages: 2 }));
    expect(rotatePages(bytes, [0, 360])).toBe(bytes);
  });
});

test.describe('görsellerden PDF ve ZIP', () => {
  // A real JPEG's bytes are not needed to lay out pages; pdf.js reads the page sizes without them.
  const picture = (width: number, height: number) => ({ data: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), width, height });
  const sizes = async (data: Uint8Array) => {
    const pdf = await getDocument({ data, verbosity: 0 }).promise;
    const result: number[][] = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const { view } = await pdf.getPage(number);
      result.push([Math.round(view[2]), Math.round(view[3])]);
    }
    return result;
  };

  test('A4 sayfa geniş görselde yan döner; kendi boyutunda sayfa 96 DPI ile ölçülür', async () => {
    const pictures = [picture(400, 300), picture(300, 500)];
    expect(await sizes(imagesToPdf(pictures, 'a4'))).toEqual([[842, 595], [595, 842]]);
    expect(await sizes(imagesToPdf(pictures, 'a4-full'))).toEqual([[842, 595], [595, 842]]);
    expect(await sizes(imagesToPdf(pictures, 'image'))).toEqual([[300, 225], [225, 375]]);
  });

  test('verilen çözünürlükteki görsel kendi boyutunda sayfada doğru ölçülür', async () => {
    // A4 drawn at 150 DPI, as a Word page is.
    expect(await sizes(imagesToPdf([{ ...picture(1240, 1754), dpi: 150 }], 'image'))).toEqual([[595, 842]]);
  });

  test('çok büyük görsel PDF\'in sayfa sınırını aşmaz', async () => {
    const [[width, height]] = await sizes(imagesToPdf([picture(40000, 10000)], 'image'));
    expect(width).toBe(14400);
    expect(height).toBe(3600);
  });

  test('ZIP arşivi dosyaları olduğu gibi, Türkçe adlarıyla saklar', () => {
    const files = [{ name: 'sayfa ı 1.png', data: new Uint8Array([1, 2, 3]) }, { name: 'b.png', data: new Uint8Array(1000).fill(7) }];
    expect(crc32(files[1].data)).toBe(nodeCrc32(files[1].data));
    const archive = Buffer.from(zip(files));
    const view = new DataView(archive.buffer, archive.byteOffset, archive.length);
    const entries: { name: string; utf8: boolean; data: number[] }[] = [];
    for (let offset = 0; view.getUint32(offset, true) === 0x04034b50;) {
      const flags = view.getUint16(offset + 6, true);
      const size = view.getUint32(offset + 18, true);
      const nameLength = view.getUint16(offset + 26, true);
      const name = archive.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
      const start = offset + 30 + nameLength;
      entries.push({ name, utf8: (flags & 0x0800) !== 0, data: [...archive.subarray(start, start + size)] });
      expect(view.getUint32(offset + 14, true)).toBe(nodeCrc32(archive.subarray(start, start + size)));
      offset = start + size;
    }
    expect(entries.map(entry => entry.name)).toEqual(['sayfa ı 1.png', 'b.png']);
    expect(entries.every(entry => entry.utf8)).toBe(true);
    expect(entries[0].data).toEqual([1, 2, 3]);
    // The end record counts both files.
    expect(archive.readUInt16LE(archive.length - 12)).toBe(2);
  });
});

test.describe('Word → PDF', () => {
  test('yalnız .docx dönüştürülür; eski .doc ayrıca tanınır', () => {
    expect(isWordFile('Ödev 1.DOCX')).toBe(true);
    expect(isWordFile('eski.doc')).toBe(false);
    expect(isOldWordFile('eski.doc')).toBe(true);
    expect(isOldWordFile('belge.docx')).toBe(false);
  });

  test('Word\'ün Symbol ve Wingdings madde işaretleri sıradan karakter olur', () => {
    expect(plainBullets('p.a:before { content: "\uf0b7\\9"; font-family: Symbol; }')).toBe('p.a:before { content: "•\\9"; font-family: Symbol; }');
    expect(plainBullets('"\uf0a7" "\uf0d8" "\uf0fc" "\uf0e1"')).toBe('"▪" "➢" "✓" "•"');
    expect(plainBullets('"%1." "o"')).toBe('"%1." "o"');
  });

  test('Symbol ile yazılmış matematik işaretleri ve Wingdings kutuları doğru karaktere döner', () => {
    // Typed as letters in the Symbol font, and as Word's private code points (w:sym).
    expect(symbolText('p r2 a\u00b3b', 'Symbol')).toBe('π ρ2 α≥β');
    expect(symbolText('\uf0b9 \uf0b1 \uf0b4 \uf0b8 \uf0a3 \uf0d6', 'Symbol')).toBe('≠ ± × ÷ ≤ √');
    expect(symbolText('\uf0fe \uf0a8 \uf0fc', '"Wingdings"')).toBe('☑ □ ✓');
    expect(symbolText('p ≥ 2', 'Calibri')).toBe('p ≥ 2');
  });

  test('Word\'ün tek ve katlı satır aralığı yazı tipinin satır yüksekliğiyle ölçülür', () => {
    expect(wordLineHeight('1.00')).toBe('1.15');
    expect(wordLineHeight('2')).toBe('2.3');
    expect(wordLineHeight('12pt')).toBe('12pt');
    expect(wordLineHeight('calc(100% + 2pt)')).toBe('calc(100% + 2pt)');
    expect(cssWithWordLines('p { line-height: 1.50; } q { line-height: 14pt }')).toBe('p { line-height: 1.725; } q { line-height: 14pt }');
  });

  test('cihazda olmayan yazı tipine benzer genel aile eklenir', () => {
    expect(withFallback('Calibri')).toBe('Calibri, sans-serif');
    expect(withFallback("'Times New Roman'")).toBe("'Times New Roman', serif");
    expect(withFallback("'Courier New'")).toBe("'Courier New', monospace");
    expect(withFallback('Arial, sans-serif')).toBe('Arial, sans-serif');
    expect(withFallback('var(--docx-minorHAnsi-font)')).toBe('var(--docx-minorHAnsi-font), sans-serif');
    expect(cssWithFallbacks('.docx { font-family: Cambria; font-size: 11pt; } p { font-family: Arial }'))
      .toBe('.docx { font-family: Cambria, serif; font-size: 11pt; } p { font-family: Arial, sans-serif}');
  });
});

test.describe('PDF → Word sayfa düzeni', () => {
  const plain: TextStyle = { family: 'Times New Roman', bold: false, italic: false, math: false };
  const bold: TextStyle = { ...plain, bold: true };
  const math: TextStyle = { ...plain, family: 'MT Extra', math: true };
  const run = (text: string, x: number, y: number, style = plain, size = 12, width = text.length * size * 0.5): Glyphs => ({ text, x, y, size, width, style });
  const page = { width: 595, height: 842 };
  const texts = (blocks: ReturnType<typeof layoutPage>['columns'][number]) => blocks.map(block => block.kind === 'paragraph'
    ? block.lines.map(line => line.parts.map(part => (part.kind === 'text' ? part.run.text : '[resim]')).join('')).join(' / ')
    : `[${block.regions.length} resim]`);

  test('ortalanmış başlık, girintili paragraflar ve sağa yaslı imza ayrı paragraflardır', () => {
    const glyphs = [
      run('BAŞLIK', 260, 80, bold, 12, 75),
      run('Birinci paragrafın ilk satırı girintili ve uzun bir satırdır.', 92, 106, plain, 12, 433),
      run('ikinci satır sütunun sonuna dek gider ve paragraf sürer.', 71, 120, plain, 12, 454),
      run('Kısa son satır.', 71, 134, plain, 12, 90),
      run('İkinci paragraf yine girintiyle başlar ve sağa dek uzanır.', 92, 148, plain, 12, 433),
      run('Ad SOYAD', 470, 200, bold, 12, 55),
      run('Okulun adı ve sınıfı', 420, 214, plain, 12, 105),
    ];
    const layout = layoutPage(glyphs, [], page);
    expect(layout.columns).toHaveLength(1);
    const blocks = layout.columns[0];
    expect(texts(blocks)).toEqual([
      'BAŞLIK',
      'Birinci paragrafın ilk satırı girintili ve uzun bir satırdır. / ikinci satır sütunun sonuna dek gider ve paragraf sürer. / Kısa son satır.',
      'İkinci paragraf yine girintiyle başlar ve sağa dek uzanır.',
      'Ad SOYAD',
      'Okulun adı ve sınıfı',
    ]);
    expect(blocks[0].kind === 'paragraph' && blocks[0].align).toBe('center');
    expect(blocks[1].kind === 'paragraph' && blocks[1].firstLine - blocks[1].left).toBeCloseTo(21, 0);
  });

  test('üs ve alt simge satırına girer; geniş boşluk boşluk olarak kalır', () => {
    const glyphs = [run('x', 72, 100), run('2', 78, 95, plain, 8, 4), run('+ a', 86, 100), run('n', 104, 103, plain, 8, 4), run('Sağda', 400, 100)];
    const [line] = layoutPage(glyphs, [], page).columns[0].flatMap(block => (block.kind === 'paragraph' ? block.lines : []));
    const runs = line.parts.flatMap(part => (part.kind === 'text' ? [part.run] : []));
    expect(runs.map(item => item.position)).toEqual(['normal', 'super', 'normal', 'sub', 'normal']);
    expect(runs.at(-1)!.text).toMatch(/^ {20,}Sağda$/);
  });

  test('iki sütun tanınır; başlık üstte, sütunlar soldan sağa', () => {
    const glyphs = [run('ÜST BAŞLIK BOYDAN BOYA UZANAN SATIR', 72, 60, bold, 12, 450)];
    for (let row = 0; row < 8; row += 1) {
      glyphs.push(run(`Sol ${row + 1}`, 72, 100 + row * 14, plain, 12, 200), run(`Sağ ${row + 1}`, 320, 100 + row * 14, plain, 12, 200));
    }
    const layout = layoutPage(glyphs, [], page);
    expect(layout.columns).toHaveLength(2);
    expect(texts(layout.before)).toEqual(['ÜST BAŞLIK BOYDAN BOYA UZANAN SATIR']);
    expect(texts(layout.columns[0]).join(' / ')).toContain('Sol 1');
    expect(texts(layout.columns[0]).join(' / ')).not.toContain('Sağ');
    expect(texts(layout.columns[1]).join(' / ')).toContain('Sağ 8');
  });

  test('tablo ızgarası ve resim resim olur, içindeki yazıyla; tek çizgi ve sayfa numarası atılır', () => {
    const line = (x0: number, y0: number, x1: number, y1: number): Graphic => ({ kind: 'path', box: { x0, y0, x1, y1 } });
    const graphics: Graphic[] = [
      // A 2×2 table.
      line(72, 200, 300, 201), line(72, 230, 300, 231), line(72, 260, 300, 261),
      line(72, 200, 73, 261), line(186, 200, 187, 261), line(299, 200, 300, 261),
      // A rule under the title, alone.
      line(72, 90, 520, 91),
      { kind: 'image', box: { x0: 72, y0: 300, x1: 272, y1: 420 } },
    ];
    const glyphs = [
      run('Başlık', 72, 80), run('Hücre', 80, 220, plain, 10, 30), run('Not', 200, 250, plain, 10, 20),
      run('Metin satırı', 72, 450), run('∫ f(x) dx', 72, 480, math, 12, 50), run('- 3 -', 290, 820, plain, 9, 18),
    ];
    const layout = layoutPage(glyphs, graphics, page);
    // The table and the photo are apart; the formula stands alone; the rule and the page number are gone.
    expect(texts(layout.columns[0])).toEqual(['Başlık', '[1 resim]', '[1 resim]', 'Metin satırı', '[1 resim]']);
    const [table] = layout.columns[0].flatMap(block => (block.kind === 'pictures' ? block.regions : []));
    expect(table.box).toMatchObject({ x0: 72, y0: 200, x1: 300, y1: 261 });
  });

  test('yazı tipi adından aile, kalın, eğik ve formül', () => {
    expect(fontStyle('BAAAAA+LiberationSerif-Bold', 'serif')).toEqual({ family: 'Times New Roman', bold: true, italic: false, math: false });
    expect(fontStyle('ABCDEF+TimesNewRomanPS-ItalicMT', 'serif')).toMatchObject({ family: 'Times New Roman', italic: true });
    expect(fontStyle('ArialMT', 'sans-serif').family).toBe('Arial');
    expect(fontStyle('Calibri-Bold', 'sans-serif')).toMatchObject({ family: 'Calibri', bold: true });
    expect(fontStyle('MTExtra', 'serif').math).toBe(true);
    expect(fontStyle('Symbol', 'serif').math).toBe(true);
    expect(fontStyle(undefined, 'serif').family).toBe('Times New Roman');
  });
});

test.describe('parola (AES-256)', () => {
  test('parolasız açılmaz, Türkçe harfli parolayla açılır; parolasız kayıt son sayfayı atabilir', async () => {
    const protectedPdf = await protectPdf(makePdf({ pages: 2, text: index => `Gizli ${index + 1}` }), 'Işık-şifre 1');
    await expect(getDocument({ data: protectedPdf.slice(), verbosity: 0 }).promise).rejects.toThrow(/password/i);
    const pdf = await getDocument({ data: protectedPdf.slice(), password: 'Işık-şifre 1', verbosity: 0 }).promise;
    expect((await (await pdf.getPage(2)).getTextContent()).items.map(item => ('str' in item ? item.str : '')).join('')).toBe('Gizli 2');
    const plainCopy = await protectPdf(makePdf({ pages: 3 }), null, { dropLastPage: true });
    expect((await getDocument({ data: plainCopy, verbosity: 0 }).promise).numPages).toBe(2);
  });

  test('parola NFKC ile, en çok 127 bayt', () => {
    expect(passwordBytes('ﬁ')).toEqual(new TextEncoder().encode('fi'));
    expect(passwordBytes('ş'.repeat(100))).toHaveLength(127);
  });
});
