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
    const fits = async () => {
      const box = await pageBox(page);
      const room = await space(page);
      return box.height <= room.height && box.width <= room.width && box.height > room.height * 0.9;
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
