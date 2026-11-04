import { expect, test, type Page } from '@playwright/test';
import { linkTop, makePdf } from './helpers/make-pdf.mjs';

async function openPdf(page: Page, buffer: Buffer, name = 'deneme.pdf') {
  await page.locator('#pdfInput').setInputFiles({ name, mimeType: 'application/pdf', buffer });
  await expect(page.locator('.page[data-page-number="1"] .textLayer').or(page.locator('.page .textLayer')).first()).toBeAttached();
}

const status = (page: Page) => page.locator('#pageStatus');
const pageBox = async (page: Page, number = 1) => (await page.locator(`.page[data-page-number="${number}"]`).boundingBox())!;
const space = async (page: Page) => (await page.locator('#viewerContainer').boundingBox())!;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('görünüm', () => {
  test('sayfaya sığdırınca sayfa tümüyle görünür, pencere değişince yeniden sığar', async ({ page }) => {
    await openPdf(page, makePdf());
    await expect(status(page)).toHaveText('1 / 3');
    // The drawing, not the page's box: pdf.js's transparent border around it carries only the shadow.
    const fits = async () => {
      const box = (await page.locator('.page[data-page-number="1"] .canvasWrapper').boundingBox())!;
      const room = await space(page);
      return box.y >= room.y && box.y + box.height <= room.y + room.height + 1
        && box.width <= room.width && box.height > room.height * 0.9;
    };
    await page.locator('#tool-fitPage').click();
    await expect.poll(fits).toBe(true);
    await page.setViewportSize({ width: 1000, height: 600 });
    await expect.poll(fits).toBe(true);
  });

  test('görünümü döndürme sayfayı yan çevirir, küçük resmi de çevirir, yeni belgede sıfırlanır', async ({ page }) => {
    await openPdf(page, makePdf());
    await expect(status(page)).toHaveText('1 / 3');
    await page.locator('#tool-sidePanel').click();
    await expect.poll(async () => (await pageBox(page)).height).toBeGreaterThan((await pageBox(page)).width);
    const canvas = page.locator('.thumbnail[data-page="1"] canvas');
    await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.height > element.width)).toBe(true);

    await page.locator('#tool-rotate').click();
    await expect.poll(async () => { const box = await pageBox(page); return box.width > box.height; }).toBe(true);
    await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.width > element.height)).toBe(true);

    await page.locator('#tool-sidePanel').click();
    await page.keyboard.press('r');
    await expect.poll(async () => { const box = await pageBox(page); return box.height > box.width; }).toBe(true);

    await openPdf(page, makePdf({ pages: 2 }), 'ikinci.pdf');
    await expect(status(page)).toHaveText('1 / 2');
    await expect.poll(async () => { const box = await pageBox(page); return box.height > box.width; }).toBe(true);
  });

  test('tek sayfa görünümünde yalnız geçerli sayfa durur, düğmeler ve tekerlek sayfa çevirir', async ({ page }) => {
    await openPdf(page, makePdf({ pages: 4 }));
    await expect(status(page)).toHaveText('1 / 4');
    await page.locator('#tool-fitPage').click();
    await page.locator('#tool-singlePage').click();
    await expect(page.locator('#tool-singlePage')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.page[data-page-number="2"]')).toBeHidden();

    await page.locator('#tool-nextPage').click();
    await expect(status(page)).toHaveText('2 / 4');
    await expect(page.locator('.page[data-page-number="2"]')).toBeVisible();
    await expect(page.locator('.page[data-page-number="1"]')).toBeHidden();

    await page.mouse.move(700, 500);
    await page.mouse.wheel(0, 200);
    await expect(status(page)).toHaveText('3 / 4');
    await page.waitForTimeout(400);
    await page.mouse.wheel(0, -200);
    await expect(status(page)).toHaveText('2 / 4');
  });

  test('tek sayfa seçimi yeni belgede korunur ve iki sayfayla birlikte çalışır', async ({ page }) => {
    await page.locator('#pdfInput').setInputFiles({ name: 'a.pdf', mimeType: 'application/pdf', buffer: makePdf({ pages: 6 }) });
    await expect(status(page)).toHaveText('1 / 6');
    await page.locator('#tool-singlePage').click();
    await page.locator('#tool-twoPages').click();
    await expect(status(page)).toHaveText('1-2 / 6');
    await expect(page.locator('.page[data-page-number="2"]')).toBeVisible();
    await expect(page.locator('.page[data-page-number="3"]')).toBeHidden();
    await page.locator('#tool-nextPage').click();
    await expect(status(page)).toHaveText('3-4 / 6');
    await expect(page.locator('.page[data-page-number="3"]')).toBeVisible();
    await expect(page.locator('.page[data-page-number="1"]')).toBeHidden();

    await page.locator('#tool-twoPages').click();
    await page.locator('#pdfInput').setInputFiles({ name: 'b.pdf', mimeType: 'application/pdf', buffer: makePdf({ pages: 5 }) });
    await expect(status(page)).toHaveText('1 / 5');
    await expect(page.locator('#tool-singlePage')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.page[data-page-number="2"]')).toBeHidden();
  });

  test('tam ekran düğmesi açar ve kapatır', async ({ page }) => {
    const toggle = page.locator('#tool-fullscreen');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  test('koyu tema arayüzü koyulaştırır, seçim korunur, PDF sayfası beyaz kalır', async ({ page }) => {
    await openPdf(page, makePdf());
    await expect(status(page)).toHaveText('1 / 3');
    const background = () => page.locator('#toolbar').evaluate(element => getComputedStyle(element).backgroundColor);
    expect(await background()).toBe('rgb(255, 255, 255)');
    const toggle = page.locator('#tool-theme');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(await background()).toBe('rgb(31, 41, 55)');
    await expect.poll(() => page.locator('.page[data-page-number="1"] canvas').evaluate((canvas: HTMLCanvasElement) =>
      canvas.getContext('2d')!.getImageData(canvas.width - 2, canvas.height - 2, 1, 1).data[0])).toBe(255);

    await page.reload();
    await expect(page.locator('#tool-theme')).toHaveAttribute('aria-pressed', 'true');
    expect(await background()).toBe('rgb(31, 41, 55)');
  });

  test('tema seçilmemişse sistemi izler, seçim sistemi yener', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    const toggle = page.locator('#tool-theme');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await page.emulateMedia({ colorScheme: 'dark' });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    const background = await page.locator('#toolbar').evaluate(element => getComputedStyle(element).backgroundColor);
    expect(background).toBe('rgb(255, 255, 255)');
  });

  test('tema kaydı yapılamayan tarayıcıda da çalışır', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('engelli'); } });
    });
    await page.goto(test.info().project.use.baseURL!);
    const toggle = page.locator('#tool-theme');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await context.close();
  });

  test('yazı kutusundayken tek tuşlu kısayollar çalışmaz', async ({ page }) => {
    await openPdf(page, makePdf());
    await expect(status(page)).toHaveText('1 / 3');
    const before = await pageBox(page);
    await page.locator('#tool-search').click();
    await page.locator('#searchInput').pressSequentially('r');
    await expect(page.locator('#searchInput')).toHaveValue('r');
    await page.waitForTimeout(200);
    expect((await pageBox(page)).width).toBe(before.width);
  });
});

test.describe('gezinme', () => {
  test('sayfa numarasına tıklayınca istenen sayfaya gidilir', async ({ page }) => {
    await openPdf(page, makePdf({ pages: 5 }));
    await expect(status(page)).toHaveText('1 / 5');
    await status(page).click();
    const dialog = page.locator('#goToPageDialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('1-5');
    await page.locator('#goToPageInput').fill('4');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(status(page)).toHaveText('4 / 5');
  });

  test('geçersiz sayfa numarası kabul edilmez, vazgeçince yer değişmez', async ({ page }) => {
    await openPdf(page, makePdf({ pages: 5 }));
    await expect(status(page)).toHaveText('1 / 5');
    await page.keyboard.press('Control+g');
    const dialog = page.locator('#goToPageDialog');
    await expect(dialog).toBeVisible();
    for (const value of ['0', '6']) {
      await page.locator('#goToPageInput').fill(value);
      await page.keyboard.press('Enter');
      await expect(dialog).toBeVisible();
    }
    await dialog.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(dialog).toBeHidden();
    await expect(status(page)).toHaveText('1 / 5');
  });

  test('belge yokken sayfa göstergesi kapalıdır', async ({ page }) => {
    await expect(status(page)).toBeDisabled();
  });

  test('PDF içi bağlantı hedef sayfaya gider', async ({ page }) => {
    await openPdf(page, makePdf({ pages: 3, links: [{ page: 0, toPage: 2 }] }));
    await expect(status(page)).toHaveText('1 / 3');
    await page.locator('.page[data-page-number="1"] .linkAnnotation a').click();
    await expect(status(page)).toHaveText('3 / 3');
  });

  test('dış bağlantı onay sorar; vazgeçince açılmaz, onaylanınca açılır', async ({ page }) => {
    await page.evaluate(() => {
      const state = window as unknown as { opened: string[] };
      state.opened = [];
      window.open = url => { state.opened.push(String(url)); return null; };
    });
    await openPdf(page, makePdf({ links: [{ page: 0, url: 'https://madematik.com/deneme' }] }));
    await expect(status(page)).toHaveText('1 / 3');
    const opened = () => page.evaluate(() => (window as unknown as { opened: string[] }).opened);
    const link = page.locator('.page[data-page-number="1"] .linkAnnotation a');
    const dialog = page.locator('#externalLinkDialog');

    await link.click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('https://madematik.com/deneme');
    await dialog.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(dialog).toBeHidden();
    expect(await opened()).toEqual([]);

    await link.click();
    await dialog.getByRole('button', { name: 'Aç' }).click();
    await expect.poll(opened).toEqual(['https://madematik.com/deneme']);
    await expect(page).toHaveURL(/127\.0\.0\.1/);
  });

  test('izin verilmeyen türde bağlantı açılmaz', async ({ page }) => {
    await openPdf(page, makePdf({ links: [{ page: 0, url: 'ftp://madematik.com/' }] }));
    await expect(status(page)).toHaveText('1 / 3');
    await page.locator('.page[data-page-number="1"] .linkAnnotation a').click();
    await expect(page.locator('#toast')).toHaveText('Bu bağlantı açılamıyor.');
    await expect(page.locator('#externalLinkDialog')).toBeHidden();
  });

  test('bağlantı sayfada doğru yerdedir', async ({ page }) => {
    await openPdf(page, makePdf({ links: [{ page: 0, toPage: 1 }] }));
    await expect(status(page)).toHaveText('1 / 3');
    const link = (await page.locator('.linkAnnotation').first().boundingBox())!;
    const box = await pageBox(page);
    const top = (792 - linkTop) / 792 * box.height;
    expect(Math.abs(link.y - box.y - top)).toBeLessThan(12);
  });
});

test.describe('dokunma ve tekerlek', () => {
  test.use({ hasTouch: true });

  async function pinch(page: Page, from: number, to: number) {
    const client = await page.context().newCDPSession(page);
    const y = 400;
    const points = (gap: number) => [{ x: 700 - gap / 2, y, id: 0 }, { x: 700 + gap / 2, y, id: 1 }];
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(from) });
    for (let step = 1; step <= 10; step += 1) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(from + (to - from) * step / 10) });
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  test('iki parmakla büyütüp küçültür, sayfa sonra keskin çizilir', async ({ page }) => {
    await openPdf(page, makePdf());
    await expect(page.locator('.page[data-page-number="1"] .textLayer')).toContainText('awPDF');
    await page.locator('#tool-zoomOut').click();
    const start = await pageBox(page);

    await pinch(page, 100, 300);
    await expect.poll(async () => (await pageBox(page)).width).toBeGreaterThan(start.width * 2);
    const wide = (await pageBox(page)).width;
    // Deep in a zoom pdf.js keeps a coarse canvas and lays a sharp one over the part in view.
    await expect.poll(() => page.locator('.page[data-page-number="1"] canvas').evaluateAll(canvases =>
      Math.max(...canvases.map(canvas => (canvas as HTMLCanvasElement).width)))).toBeGreaterThan(1300);

    await pinch(page, 300, 100);
    await expect.poll(async () => (await pageBox(page)).width).toBeLessThan(wide * 0.6);
  });

  test('iki parmakla büyütme tarayıcının sayfa yakınlaştırmasını tetiklemez', async ({ page }) => {
    await openPdf(page, makePdf());
    await expect(page.locator('.page[data-page-number="1"] .textLayer')).toContainText('awPDF');
    await pinch(page, 100, 200);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.visualViewport!.scale)).toBe(1);
  });

  test('ctrl+tekerlek yakınlaştırır', async ({ page }) => {
    await openPdf(page, makePdf());
    await expect(page.locator('.page[data-page-number="1"] .textLayer')).toContainText('awPDF');
    await page.locator('#tool-zoomOut').click();
    const before = (await pageBox(page)).width;
    await page.mouse.move(700, 400);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -200);
    await page.keyboard.up('Control');
    await expect.poll(async () => (await pageBox(page)).width).toBeGreaterThan(before);
  });

  test('tek sayfa görünümünde yana kaydırma sayfa çevirir', async ({ page }) => {
    await openPdf(page, makePdf());
    await expect(status(page)).toHaveText('1 / 3');
    await page.locator('#tool-fitPage').click();
    await page.locator('#tool-singlePage').click();
    await page.waitForTimeout(300);
    const client = await page.context().newCDPSession(page);
    const swipe = async (from: number, to: number) => {
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from, y: 400 }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: (from + to) / 2, y: 400 }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: to, y: 400 }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await swipe(900, 600);
    await expect(status(page)).toHaveText('2 / 3');
    await swipe(600, 900);
    await expect(status(page)).toHaveText('1 / 3');
  });

  test('sürekli görünümde sağa kaydırma tarayıcıda geri gitmez', async ({ page }) => {
    await openPdf(page, makePdf());
    await expect(status(page)).toHaveText('1 / 3');
    await page.locator('#tool-fitPage').click();
    await page.waitForTimeout(300);
    const client = await page.context().newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 500, y: 400 }] });
    for (const x of [600, 700, 800, 900]) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: 400 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(500);
    await expect(status(page)).toHaveText('1 / 3');
    await expect(page).toHaveURL(/127\.0\.0\.1/);
  });

  test('parmakla dikey kaydırma çalışmaya devam eder', async ({ page }) => {
    await openPdf(page, makePdf());
    await expect(status(page)).toHaveText('1 / 3');
    const client = await page.context().newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 700, y: 700 }] });
    for (const y of [650, 600, 500, 400, 300]) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 700, y }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => page.locator('#viewerContainer').evaluate(element => element.scrollTop)).toBeGreaterThan(100);
  });
});

test.describe('arama', () => {
  const turkish = makePdf({ pages: 3, text: index => ['ISI ve ısı', 'İzmir ile izmir', 'kitap'][index] });

  test('Türkçe I ve İ harflerinde büyük-küçük ayırmadan bulur', async ({ page }) => {
    await openPdf(page, turkish);
    await expect(status(page)).toHaveText('1 / 3');
    await page.keyboard.press('Control+f');
    const input = page.locator('#searchInput');
    await expect(input).toBeFocused();
    const result = page.locator('#searchStatus');
    for (const [query, total] of [['ısı', 2], ['ISI', 2], ['izmir', 2], ['İZMİR', 2], ['İzmir', 2]] as const) {
      await input.fill(query);
      await expect(result).toHaveText(`1 / ${total}`);
    }
  });

  test('bulunanlar sarı, üzerinde durulan turuncu ve çerçeveli', async ({ page }) => {
    await openPdf(page, makePdf({ pages: 1, text: () => 'kitap ve kitap' }));
    await page.locator('#tool-search').click();
    await page.locator('#searchInput').fill('kitap');
    await expect(page.locator('#searchStatus')).toHaveText('1 / 2');
    const look = (selector: string) => page.locator(selector).first().evaluate(element => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, edge: style.boxShadow };
    });
    expect(await look('.textLayer .highlight.selected')).toEqual({ background: 'rgba(255, 120, 0, 0.5)', edge: 'rgb(204, 82, 0) 0px 0px 0px 1.5px' });
    expect((await look('.textLayer .highlight:not(.selected)')).background).toBe('rgba(255, 204, 0, 0.4)');
  });

  test('eşleşmeler arasında gezer, sayfası değişir, sayfada işaretlenir', async ({ page }) => {
    await openPdf(page, makePdf({ pages: 3, text: index => `kitap ${index + 1}` }));
    await expect(status(page)).toHaveText('1 / 3');
    await page.locator('#tool-search').click();
    const input = page.locator('#searchInput');
    const result = page.locator('#searchStatus');
    await input.fill('kitap');
    await expect(result).toHaveText('1 / 3');
    await expect(page.locator('.page[data-page-number="1"] .textLayer .highlight.selected')).toContainText('kitap');

    await input.press('Enter');
    await expect(result).toHaveText('2 / 3');
    await expect(status(page)).toHaveText('2 / 3');
    await page.locator('#searchNext').click();
    await expect(result).toHaveText('3 / 3');
    await page.locator('#searchPrevious').click();
    await expect(result).toHaveText('2 / 3');
    await input.press('Shift+Enter');
    await expect(result).toHaveText('1 / 3');
  });

  test('işaretin oturduğu metin katmanı sayfanın çizimiyle aynı yerde ve boyda', async ({ page }) => {
    // Dar ekranda sayfa küçük, kenarlığı görece büyüktür; bir fark burada en çok kayar.
    await page.setViewportSize({ width: 392, height: 800 });
    await openPdf(page, makePdf());
    const box = (selector: string) => page.locator(`.page[data-page-number="1"] ${selector}`).boundingBox();
    const drawing = (await box('.canvasWrapper'))!;
    const text = (await box('.textLayer'))!;
    for (const side of ['x', 'y', 'width', 'height'] as const) expect(text[side]).toBeCloseTo(drawing[side], 0);
  });

  test('bulunamayınca söyler, kapatınca işaretler silinir, yeniden açınca çalışır', async ({ page }) => {
    await openPdf(page, turkish);
    await expect(status(page)).toHaveText('1 / 3');
    await page.locator('#tool-search').click();
    const input = page.locator('#searchInput');
    await input.fill('olmayanmetin');
    await expect(page.locator('#searchStatus')).toHaveText('Bulunamadı');

    await input.fill('kitap');
    await expect(page.locator('#searchStatus')).toHaveText('1 / 1');
    await expect(status(page)).toHaveText('3 / 3');
    await input.press('Escape');
    await expect(page.locator('#searchBar')).toBeHidden();
    await expect(page.locator('.textLayer .highlight')).toHaveCount(0);
    await expect(page.locator('#tool-search')).toHaveAttribute('aria-pressed', 'false');

    await page.locator('#tool-search').click();
    await expect(page.locator('#searchInput')).toHaveValue('');
    await page.locator('#searchInput').fill('izmir');
    await expect(page.locator('#searchStatus')).toHaveText('1 / 2');
    await expect(status(page)).toHaveText('2 / 3');
  });

  test('yeni belge açılınca arama kapanır, sonra yeni belgede arar', async ({ page }) => {
    await openPdf(page, turkish);
    await expect(status(page)).toHaveText('1 / 3');
    await page.locator('#tool-search').click();
    await page.locator('#searchInput').fill('kitap');
    await expect(page.locator('#searchStatus')).toHaveText('1 / 1');
    await openPdf(page, makePdf({ pages: 2, text: () => 'defter' }), 'ikinci.pdf');
    await expect(page.locator('#searchBar')).toBeHidden();
    await page.locator('#tool-search').click();
    await page.locator('#searchInput').fill('defter');
    await expect(page.locator('#searchStatus')).toHaveText('1 / 2');
  });

  test('arama açılmadıkça sayfaların metni okunmaz', async ({ page }) => {
    await page.evaluate(() => {
      const original = Blob.prototype.slice;
      const state = window as unknown as { bytesRead: number };
      state.bytesRead = 0;
      Blob.prototype.slice = function slice(begin, end, type) {
        const part = original.call(this, begin, end, type);
        state.bytesRead += part.size;
        return part;
      };
    });
    const buffer = makePdf({ pages: 3, padding: 8 * 1024 * 1024 });
    await openPdf(page, buffer);
    await expect(status(page)).toHaveText('1 / 3');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as unknown as { bytesRead: number }).bytesRead)).toBeLessThan(buffer.length / 2);
  });
});

test.describe('yazdırma ve paylaşma', () => {
  async function stubPrint(page: Page) {
    await page.evaluate(() => {
      const state = window as unknown as { prints: number };
      state.prints = 0;
      window.print = () => { state.prints += 1; };
    });
  }
  const prints = (page: Page) => page.evaluate(() => (window as unknown as { prints: number }).prints);

  test('bütün sayfalar hazırlanır, yazdırma görünümünde yalnız onlar görünür', async ({ page }) => {
    await stubPrint(page);
    await openPdf(page, makePdf({ pages: 3 }));
    await expect(status(page)).toHaveText('1 / 3');
    await page.locator('#tool-rotate').click();
    await page.locator('#tool-print').click();
    await expect.poll(() => prints(page)).toBe(1);
    await expect(page.locator('#printDialog')).toBeHidden();
    const pages = page.locator('#printContainer .print-page img');
    await expect(pages).toHaveCount(3);
    // The view's rotation stays out of it: the paper gets the file as it is.
    const sizes = await pages.evaluateAll(images => (images as HTMLImageElement[]).map(image => [image.naturalWidth, image.naturalHeight]));
    expect(sizes).toEqual([[1275, 1650], [1275, 1650], [1275, 1650]]);

    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#printContainer')).toBeVisible();
    await expect(page.locator('#toolbar')).toBeHidden();
    await expect(page.locator('#viewerContainer')).toBeHidden();
  });

  test('yazdırma çıktısı sayfa sayısı kadar sayfadır, boş sayfa yoktur', async ({ page }) => {
    await stubPrint(page);
    await openPdf(page, makePdf({ pages: 3 }));
    await expect(status(page)).toHaveText('1 / 3');
    await page.locator('#tool-print').click();
    await expect.poll(() => prints(page)).toBe(1);
    const pdf = await page.pdf({ preferCSSPageSize: true });
    expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length).toBe(3);
  });

  test('yazdırma bitince hazırlanan sayfalar bırakılır', async ({ page }) => {
    await stubPrint(page);
    await openPdf(page, makePdf());
    await expect(status(page)).toHaveText('1 / 3');
    await page.keyboard.press('Control+p');
    await expect.poll(() => prints(page)).toBe(1);
    await expect(page.locator('#printContainer img')).toHaveCount(3);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(page.locator('#printContainer img')).toHaveCount(0);
  });

  test('yazdırma hazırlığından vazgeçilebilir', async ({ page }) => {
    await stubPrint(page);
    await openPdf(page, makePdf({ pages: 60 }));
    await expect(status(page)).toHaveText('1 / 60');
    await page.locator('#tool-print').click();
    const dialog = page.locator('#printDialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(dialog).toBeHidden();
    await page.waitForTimeout(600);
    expect(await prints(page)).toBe(0);
    await expect(page.locator('#printContainer img')).toHaveCount(0);
  });

  test('paylaşma düğmesi webde yoktur, sayfaya git düğmesi araç çubuğunda yer almaz', async ({ page }) => {
    await expect(page.locator('#tool-share')).toHaveCount(0);
    await expect(page.locator('#tool-goToPage')).toHaveCount(0);
  });
});

test.describe('sürükle-bırak', () => {
  const dragPdf = (page: Page, type: string, buffer: Buffer | null) => page.evaluate(([event, bytes]) => {
    const dataTransfer = new DataTransfer();
    if (bytes) dataTransfer.items.add(new File([new Uint8Array(bytes as number[])], 'birakilan.pdf', { type: 'application/pdf' }));
    else dataTransfer.setData('text/plain', 'yazı');
    const dragEvent = new DragEvent(event as string, { dataTransfer, bubbles: true, cancelable: true });
    document.querySelector('#workspace')!.dispatchEvent(dragEvent);
    return dragEvent.defaultPrevented;
  }, [type, buffer ? [...buffer] : null]);

  test('bırakılan PDF açılır, sürüklerken alan belli olur', async ({ page }) => {
    const pdf = makePdf();
    await dragPdf(page, 'dragover', pdf);
    await expect(page.locator('body')).toHaveClass(/is-dropping/);
    await dragPdf(page, 'drop', pdf);
    await expect(status(page)).toHaveText('1 / 3');
    await expect(page.locator('body')).not.toHaveClass(/is-dropping/);
    await expect(page).toHaveTitle(/^birakilan\.pdf/);
  });

  test('dosya olmayan sürükleme araya girmez', async ({ page }) => {
    expect(await dragPdf(page, 'dragover', null)).toBe(false);
    await expect(page.locator('body')).not.toHaveClass(/is-dropping/);
  });
});

test.describe('son dosyalar', () => {
  const pick = (page: Page) => page.evaluate(async () => {
    const folder = await navigator.storage.getDirectory();
    const handle = await folder.getFileHandle('kayitli.pdf');
    Object.assign(window, { showOpenFilePicker: async () => [handle] });
    document.querySelector<HTMLElement>('#tool-open')!.click();
  });
  const onDisk = (page: Page, pdf: Buffer) => page.evaluate(async bytes => {
    const folder = await navigator.storage.getDirectory();
    const writer = await (await folder.getFileHandle('kayitli.pdf', { create: true })).createWritable();
    await writer.write(new Uint8Array(bytes));
    await writer.close();
  }, [...pdf]);

  test('belge kalınan sayfadan açılır, liste ekrana gelir', async ({ page }) => {
    await page.locator('#pdfInput').setInputFiles({ name: 'deneme.pdf', mimeType: 'application/pdf', buffer: makePdf({ pages: 5 }) });
    await expect(status(page)).toHaveText('1 / 5');
    await page.locator('#tool-nextPage').click();
    await page.locator('#tool-nextPage').click();
    await expect(status(page)).toHaveText('3 / 5');

    await page.reload();
    await expect(page.locator('#recentFiles .recent-file')).toContainText('Sayfa 3');
    await page.locator('#pdfInput').setInputFiles({ name: 'baska-ad.pdf', mimeType: 'application/pdf', buffer: makePdf({ pages: 5 }) });
    await expect(status(page)).toHaveText('3 / 5');
    await expect(page.locator('#toast')).toHaveText('Kaldığınız yer: sayfa 3');
    await expect(page.locator('.page[data-page-number="3"] .textLayer')).toContainText('sayfa 3');
  });

  test('tarayıcı dosyayı tutabiliyorsa listeden tek dokunuşla açılır', async ({ page }) => {
    await onDisk(page, makePdf());
    await pick(page);
    await expect(status(page)).toHaveText('1 / 3');
    await page.reload();
    await page.locator('#recentFiles .recent-file').click();
    await expect(status(page)).toHaveText('1 / 3');
    await expect(page).toHaveTitle(/^kayitli\.pdf/);
  });

  test('yeri bilinmeyen dosya yeniden seçilir, sayfası kaybolmaz', async ({ page }) => {
    await page.locator('#pdfInput').setInputFiles({ name: 'deneme.pdf', mimeType: 'application/pdf', buffer: makePdf() });
    await expect(status(page)).toHaveText('1 / 3');
    await page.reload();
    await page.evaluate(() => { delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker; });
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#recentFiles .recent-file').click();
    await expect(page.locator('#toast')).toHaveText('Dosyanın yeri bilinmiyor, lütfen yeniden seçin.');
    await (await chooser).setFiles({ name: 'deneme.pdf', mimeType: 'application/pdf', buffer: makePdf() });
    await expect(status(page)).toHaveText('1 / 3');
  });

  test('araç çubuğundan açılır, liste temizlenebilir', async ({ page }) => {
    await page.locator('#tool-recent').click();
    await expect(page.locator('#recentDialogEmpty')).toBeVisible();
    await page.locator('#recentDialog button[value="close"]').click();
    await page.locator('#pdfInput').setInputFiles({ name: 'deneme.pdf', mimeType: 'application/pdf', buffer: makePdf() });
    await expect(status(page)).toHaveText('1 / 3');
    await page.locator('#tool-recent').click();
    await expect(page.locator('#recentDialog .recent-file')).toHaveCount(1);
    await page.locator('#recentDialog .recent-clear').click();
    await expect(page.locator('#recentDialog .recent-file')).toHaveCount(0);
    await expect(page.locator('#recentDialogEmpty')).toBeVisible();
    await page.reload();
    await expect(page.locator('#recentFiles')).toBeHidden();
  });
});

test.describe('içindekiler', () => {
  const outline = [
    { title: 'Baslangic', page: 0 },
    { title: 'Birinci Bölüm', page: 1, items: [{ title: 'Alt Konu', page: 3 }] },
    { title: 'Açık Bölüm', page: 2, open: true, items: [{ title: 'Görünen Alt', page: 4 }] },
    { title: 'Kaynak', url: 'https://madematik.com/' },
  ];
  const tab = (page: Page) => page.locator('#sidePanelOutlineTab');

  test('yan panelde sekmedir; başlığa basınca o sayfaya gider', async ({ page }) => {
    await openPdf(page, makePdf({ pages: 5, outline }));
    await page.locator('#tool-sidePanel').click();
    await expect(page.locator('.thumbnail').first()).toBeVisible();
    await tab(page).click();
    await expect(page.locator('.thumbnail').first()).toBeHidden();
    await expect(tab(page)).toHaveAttribute('aria-selected', 'true');
    await page.locator('.outline__title', { hasText: 'Birinci Bölüm' }).click();
    await expect(status(page)).toHaveText('2 / 5');
  });

  test('alt başlıklar PDF\'in istediği gibi kapalı ya da açık gelir, açılıp kapanır', async ({ page }) => {
    await openPdf(page, makePdf({ pages: 5, outline }));
    await page.locator('#tool-sidePanel').click();
    await tab(page).click();
    await expect(page.locator('.outline__title', { hasText: 'Alt Konu' })).toBeHidden();
    await expect(page.locator('.outline__title', { hasText: 'Görünen Alt' })).toBeVisible();
    await page.locator('.outline__fold').first().click();
    await page.locator('.outline__title', { hasText: 'Alt Konu' }).click();
    await expect(status(page)).toHaveText('4 / 5');
  });

  test('dış bağlantılı başlık onay sorar', async ({ page }) => {
    await openPdf(page, makePdf({ pages: 5, outline }));
    await page.locator('#tool-sidePanel').click();
    await tab(page).click();
    await page.locator('.outline__title', { hasText: 'Kaynak' }).click();
    await expect(page.locator('#externalLinkDialog')).toBeVisible();
  });

  test('içindekileri olmayan belgede sekme yoktur, sonraki belgede sayfalara döner', async ({ page }) => {
    await openPdf(page, makePdf({ pages: 5, outline }));
    await page.locator('#tool-sidePanel').click();
    await tab(page).click();
    await openPdf(page, makePdf({ pages: 2 }), 'ikinci.pdf');
    await expect(page.locator('#sidePanelTabs')).toBeHidden();
    await expect(page.locator('.thumbnail').first()).toBeVisible();
  });

  test('dar ekranda seçim paneli kapatır', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await openPdf(page, makePdf({ pages: 5, outline }));
    await page.locator('#tool-sidePanel').click();
    await tab(page).click();
    await page.locator('.outline__title', { hasText: 'Baslangic' }).click();
    await expect(page.locator('#sidePanel')).toBeHidden();
  });
});

test.describe('parolalı PDF', () => {
  const secret = makePdf({ pages: 2, password: 'gizli12' });
  const dialog = (page: Page) => page.locator('#passwordDialog');
  const choose = (page: Page) => page.locator('#pdfInput').setInputFiles({ name: 'sinav.pdf', mimeType: 'application/pdf', buffer: secret });
  const answer = async (page: Page, password: string) => {
    await page.locator('#passwordInput').fill(password);
    await page.locator('#passwordInput').press('Enter');
  };

  test('doğru parolayla açılır; içerik okunur, parola hiçbir yerde kalmaz', async ({ page }) => {
    await choose(page);
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText('sinav.pdf');
    await expect(page.locator('#passwordWrong')).toBeHidden();
    await answer(page, 'gizli12');
    await expect(status(page)).toHaveText('1 / 2');
    await expect(page.locator('.page[data-page-number="1"] .textLayer')).toContainText('awPDF sayfa 1');
    await expect(page.locator('#passwordInput')).toHaveValue('');
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain('gizli12');
  });

  test('yanlış parola yeniden sorulur', async ({ page }) => {
    await choose(page);
    await answer(page, 'yanlis');
    await expect(page.locator('#passwordWrong')).toBeVisible();
    await expect(page.locator('#passwordInput')).toHaveValue('');
    await answer(page, 'gizli12');
    await expect(status(page)).toHaveText('1 / 2');
    await expect(dialog(page)).toBeHidden();
  });

  test('vazgeçince uyarı çıkmaz, açık belge yerinde kalır', async ({ page }) => {
    await openPdf(page, makePdf());
    await choose(page);
    await dialog(page).locator('button[value="cancel"]').click();
    await expect(dialog(page)).toBeHidden();
    await expect(page.locator('#toast')).toBeHidden();
    await expect(status(page)).toHaveText('1 / 3');
  });

  test('yeniden açınca parola yine sorulur, kalınan sayfa korunur', async ({ page }) => {
    await choose(page);
    await answer(page, 'gizli12');
    await page.locator('#tool-nextPage').click();
    await expect(status(page)).toHaveText('2 / 2');
    await page.reload();
    await choose(page);
    await answer(page, 'gizli12');
    await expect(status(page)).toHaveText('2 / 2');
  });
});

test('görünümü döndürünce okunan sayfada kalınır', async ({ page }) => {
  await page.locator('#pdfInput').setInputFiles({ name: 'deneme.pdf', mimeType: 'application/pdf', buffer: makePdf({ pages: 6 }) });
  await expect(status(page)).toHaveText('1 / 6');
  await page.locator('#tool-nextPage').click();
  await page.locator('#tool-nextPage').click();
  await expect(status(page)).toHaveText('3 / 6');
  for (let turn = 0; turn < 4; turn += 1) {
    await page.locator('#tool-rotate').click();
    await page.waitForTimeout(200);
    await expect(status(page)).toHaveText('3 / 6');
  }
});

test.describe('sekmeler', () => {
  const choose = (page: Page, name: string, pages: number) => page.locator('#pdfInput').setInputFiles({
    name, mimeType: 'application/pdf', buffer: makePdf({ pages, text: index => `${name} ${index + 1}` }),
  });
  const tab = (page: Page, name: string) => page.locator('.tab', { hasText: name });
  const twoDocuments = async (page: Page) => {
    await choose(page, 'bir.pdf', 4);
    await expect(status(page)).toHaveText('1 / 4');
    await choose(page, 'iki.pdf', 2);
    await expect(status(page)).toHaveText('1 / 2');
  };

  test('her belge sekmede açılır, aralarında geçilir, başlık izler', async ({ page }) => {
    await twoDocuments(page);
    await expect(page.locator('.tab')).toHaveCount(2);
    await expect(tab(page, 'iki.pdf')).toHaveClass(/is-active/);
    await expect(page).toHaveTitle(/^iki\.pdf/);
    await tab(page, 'bir.pdf').locator('.tab__title').click();
    await expect(status(page)).toHaveText('1 / 4');
    await expect(page).toHaveTitle(/^bir\.pdf/);
    await expect(page.locator('.page[data-page-number="1"] .textLayer')).toContainText('bir.pdf 1');
  });

  test('her sekme sayfasını, yakınlaştırmasını ve döndürmesini korur', async ({ page }) => {
    await twoDocuments(page);
    await tab(page, 'bir.pdf').locator('.tab__title').click();
    await expect(status(page)).toHaveText('1 / 4');
    await page.locator('#tool-nextPage').click();
    await page.locator('#tool-nextPage').click();
    await expect(status(page)).toHaveText('3 / 4');
    await page.locator('#tool-rotate').click();
    await page.locator('#tool-zoomIn').click();
    const box = async () => {
      const { width, height } = (await page.locator('.page[data-page-number="3"]').boundingBox())!;
      return { width: Math.round(width), height: Math.round(height) };
    };
    await expect.poll(async () => (await box()).width).toBeGreaterThan((await box()).height);
    const before = await box();

    await tab(page, 'iki.pdf').locator('.tab__title').click();
    await expect(status(page)).toHaveText('1 / 2');
    const other = (await page.locator('.page[data-page-number="1"]').boundingBox())!;
    expect(other.height).toBeGreaterThan(other.width);

    await tab(page, 'bir.pdf').locator('.tab__title').click();
    await expect(status(page)).toHaveText('3 / 4');
    await expect.poll(box).toEqual(before);
  });

  test('Belgeyi Kapat düğmesi açık olan sekmeyi kapatır', async ({ page }) => {
    await twoDocuments(page);
    await page.locator('#tool-closeTab').click();
    await expect(page.locator('.tab')).toHaveCount(1);
    await expect(status(page)).toHaveText('1 / 4');
    await page.locator('#tool-closeTab').click();
    await expect(page.locator('#emptyOpen')).toBeVisible();
    await expect(page.locator('#tool-closeTab')).toBeDisabled();
  });

  test('aynı belge ikinci kez açılmaz, sekmesine dönülür', async ({ page }) => {
    await twoDocuments(page);
    await choose(page, 'bir.pdf', 4);
    await expect(status(page)).toHaveText('1 / 4');
    await expect(page.locator('.tab')).toHaveCount(2);
  });

  test('sekme kapanınca yanındaki gelir, son sekmede boş ekrana dönülür', async ({ page }) => {
    await twoDocuments(page);
    await page.locator('#tool-sidePanel').click();
    await tab(page, 'iki.pdf').locator('.tab__close').click();
    await expect(status(page)).toHaveText('1 / 4');
    await expect(page.locator('.thumbnail')).toHaveCount(4);
    await tab(page, 'bir.pdf').locator('.tab__close').click();
    await expect(page.locator('.tab')).toHaveCount(0);
    await expect(page.locator('#tabBar')).toBeHidden();
    await expect(page.locator('#emptyOpen')).toBeVisible();
    await expect(page.locator('#viewerContainer')).toBeHidden();
    await expect(page.locator('#sidePanel')).toBeHidden();
    await expect(page.locator('#tool-print')).toBeDisabled();
    await expect(status(page)).toHaveText('');
    await expect(page).toHaveTitle('awPDF | mADEMatik');
    await choose(page, 'uc.pdf', 2);
    await expect(status(page)).toHaveText('1 / 2');
  });

  test('sekme değişince arama kapanır, kısayolla sırayla geçilir', async ({ page }) => {
    await twoDocuments(page);
    await page.locator('#tool-search').click();
    await page.locator('#searchInput').fill('bir');
    await tab(page, 'bir.pdf').locator('.tab__title').click();
    await expect(page.locator('#searchBar')).toBeHidden();
    await page.locator('#viewerContainer').click();
    await page.keyboard.press('Control+Tab');
    await expect(status(page)).toHaveText('1 / 2');
    await page.keyboard.press('Control+Tab');
    await expect(status(page)).toHaveText('1 / 4');
  });

  test('birden çok dosya seçilince hepsi açılır, sonuncusu önde kalır', async ({ page }) => {
    await page.locator('#pdfInput').setInputFiles(['a.pdf', 'b.pdf', 'c.pdf'].map((name, index) => ({
      name, mimeType: 'application/pdf', buffer: makePdf({ pages: index + 1 }),
    })));
    await expect(page.locator('.tab')).toHaveCount(3);
    await expect(status(page)).toHaveText('1 / 3');
  });
});

test.describe('sunum modu', () => {
  const start = async (page: Page, pages = 3) => {
    await openPdf(page, makePdf({ pages }));
    await page.locator('#toolbarMenuButton').or(page.locator('#tool-presentation')).first().waitFor();
    await page.locator('#tool-presentation').click();
    await expect(page.locator('body')).toHaveClass(/is-presenting/);
  };
  const tapAt = async (page: Page, share: number) => {
    const { width } = page.viewportSize()!;
    await page.mouse.click(width * share, 300);
  };

  test('araçlar kalkar, sayfa ekrana sığar, tek sayfa görünür', async ({ page }) => {
    await start(page);
    await expect(page.locator('#toolbar')).toBeHidden();
    await expect(page.locator('#tabBar')).toBeHidden();
    await expect(page.locator('#presentationExit')).toBeVisible();
    await expect.poll(async () => {
      const box = (await page.locator('.page[data-page-number="1"]').boundingBox())!;
      return box.height >= page.viewportSize()!.height * 0.9 && box.height <= page.viewportSize()!.height;
    }).toBe(true);
    await expect(page.locator('.page[data-page-number="2"]')).toBeHidden();
  });

  test('dik ekranda sayfa dikeyde ortalanır', async ({ page }) => {
    await start(page);
    // Telefon dik çevrilmiş gibi; sayfaya sığdırma yeni boyuta yeniden uyar.
    await page.setViewportSize({ width: 360, height: 740 });
    // Sayfa yeni genişliğe sığınca üstte ve altta eşit boşluk kalır.
    await expect.poll(async () => {
      const box = (await page.locator('.page[data-page-number="1"]').boundingBox())!;
      return box.width <= 360 && Math.abs(box.y + box.height / 2 - 740 / 2) < 4;
    }).toBe(true);
  });

  test('sağa dokunmak ilerletir, sol üçte bir geri alır', async ({ page }) => {
    await start(page);
    await tapAt(page, 0.8);
    await expect(status(page)).toHaveText('2 / 3');
    await tapAt(page, 0.5);
    await expect(status(page)).toHaveText('3 / 3');
    await tapAt(page, 0.1);
    await expect(status(page)).toHaveText('2 / 3');
  });

  test('tuşlarla ilerlenir; Esc çıkar, görünüm eski haline döner', async ({ page }) => {
    await openPdf(page, makePdf({ pages: 5 }));
    await page.locator('#tool-twoPages').click();
    await page.locator('#tool-zoomOut').click();
    const width = async () => (await page.locator('.page[data-page-number="1"]').boundingBox())!.width;
    await page.waitForTimeout(200);
    const before = await width();
    await page.keyboard.press('F5');
    await expect(page.locator('body')).toHaveClass(/is-presenting/);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await expect(status(page)).toHaveText('3 / 5');
    await page.keyboard.press('ArrowLeft');
    await expect(status(page)).toHaveText('2 / 5');
    await page.keyboard.press('End');
    await expect(status(page)).toHaveText('5 / 5');
    await page.keyboard.press('Home');
    await expect(status(page)).toHaveText('1 / 5');
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).not.toHaveClass(/is-presenting/);
    await expect(page.locator('#toolbar')).toBeVisible();
    await expect(page.locator('#tool-twoPages')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#tool-singlePage')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(width).toBeCloseTo(before, 0);
    await expect(page.locator('#presentationExit')).toBeHidden();
  });

  test('çıkış düğmesi tam ekranı da kapatır', async ({ page }) => {
    await start(page);
    await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
    await page.locator('#presentationExit').click();
    await expect(page.locator('body')).not.toHaveClass(/is-presenting/);
    await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(false);
  });

  test('tarayıcının kendi tam ekrandan çıkışı sunumu da bitirir', async ({ page }) => {
    await start(page);
    await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
    await page.evaluate(() => document.exitFullscreen());
    await expect(page.locator('body')).not.toHaveClass(/is-presenting/);
  });

  test('arama ve panel açıksa kapanır', async ({ page }) => {
    await openPdf(page, makePdf());
    await page.locator('#tool-sidePanel').click();
    await page.locator('#tool-search').click();
    await page.locator('#tool-presentation').click();
    await expect(page.locator('#sidePanel')).toBeHidden();
    await expect(page.locator('#searchBar')).toBeHidden();
  });
});

test.describe('ekran klavyesi', () => {
  const pretendBoard = (page: Page) => page.addInitScript(() => {
    const calls: string[] = [];
    Object.assign(window, {
      keyboardCalls: calls,
      awPDFDesktop: {
        windowControls: {
          isMaximized: async () => false,
          isFullscreen: async () => false,
          onMaximizeChanged: () => undefined,
          onFullscreenChanged: () => undefined,
        },
        files: { onOpened: () => undefined, adopt: async () => null },
        screenKeyboard: {
          show: async () => { calls.push('show'); return (window as unknown as { keyboardResult?: string }).keyboardResult ?? 'shown'; },
          hide: () => { calls.push('hide'); },
        },
      },
    });
  });
  const calls = (page: Page) => page.evaluate(() => (window as unknown as { keyboardCalls: string[] }).keyboardCalls);

  test('tahtada yazı alanı açar, alandan çıkınca kapatır', async ({ page }) => {
    await pretendBoard(page);
    await page.goto('/?tahta=1');
    await openPdf(page, makePdf());
    await page.locator('#tool-search').click();
    await expect.poll(() => calls(page)).toEqual(['show']);
    await page.locator('#searchClose').click();
    await expect.poll(() => calls(page)).toEqual(['show', 'hide']);
    await page.locator('#pageStatus').click();
    await expect.poll(() => calls(page)).toEqual(['show', 'hide', 'show']);
  });

  test('klavye yoksa ne yapılacağı söylenir', async ({ page }) => {
    await pretendBoard(page);
    await page.addInitScript(() => Object.assign(window, { keyboardResult: 'unavailable' }));
    await page.goto('/?tahta=1');
    await openPdf(page, makePdf());
    await page.locator('#tool-search').click();
    await expect(page.locator('#toast')).toContainText('ETA Klavye veya Onboard');
  });

  test('tahta değilse klavye istenmez', async ({ page }) => {
    await pretendBoard(page);
    await page.goto('/');
    await openPdf(page, makePdf());
    await page.locator('#tool-search').click();
    await expect(page.locator('#searchInput')).toBeFocused();
    expect(await calls(page)).toEqual([]);
  });
});
