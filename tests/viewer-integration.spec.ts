import { expect, test, type Page } from '@playwright/test';
import { makePdf } from './helpers/make-pdf.mjs';

const MEGABYTE = 1024 * 1024;

async function openPdf(page: Page, buffer: Buffer, name = 'deneme.pdf') {
  await page.locator('#pdfInput').setInputFiles({ name, mimeType: 'application/pdf', buffer });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('boş ekranda belge isteyen araçlar kapalıdır', async ({ page }) => {
  await expect(page.locator('#emptyOpen')).toBeVisible();
  await expect(page.locator('#tool-open')).toBeEnabled();
  await expect(page.locator('#tool-zoomIn')).toBeDisabled();
  await expect(page.locator('#tool-nextPage')).toBeDisabled();
  await expect(page.locator('#pageStatus')).toHaveText('');
});

test('PDF açılır, metni seçilebilir ve başlığa adı yazılır', async ({ page }) => {
  await openPdf(page, makePdf());
  await expect(page.locator('#pageStatus')).toHaveText('1 / 3');
  await expect(page.locator('#emptyState')).toBeHidden();
  await expect(page.locator('.page[data-page-number="1"] .textLayer')).toContainText('awPDF sayfa 1');
  await expect(page).toHaveTitle('deneme.pdf | awPDF | mADEMatik');
});

test('sayfa çizilir: tuval boş değildir', async ({ page }) => {
  await openPdf(page, makePdf());
  await expect(page.locator('.page[data-page-number="1"] canvas')).toBeVisible();
  await expect.poll(() => page.locator('.page[data-page-number="1"] canvas').evaluate((canvas: HTMLCanvasElement) => {
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    return data.some((value, index) => index % 4 !== 3 && value < 128);
  })).toBe(true);
});

test('sayfa düğmeleri gezinir, ilk ve son sayfada pasif olur', async ({ page }) => {
  await openPdf(page, makePdf());
  const status = page.locator('#pageStatus');
  const previous = page.locator('#tool-previousPage');
  const next = page.locator('#tool-nextPage');
  await expect(status).toHaveText('1 / 3');
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  await next.click();
  await expect(status).toHaveText('2 / 3');
  await expect(previous).toBeEnabled();
  await expect(next).toBeEnabled();
  await next.click();
  await expect(status).toHaveText('3 / 3');
  await expect(previous).toBeEnabled();
  await expect(next).toBeDisabled();
  await previous.click();
  await expect(status).toHaveText('2 / 3');
  await expect(next).toBeEnabled();
});

test('kaydırarak son sayfaya gelince sonraki sayfa düğmesi pasif olur', async ({ page }) => {
  await openPdf(page, makePdf());
  await expect(page.locator('#pageStatus')).toHaveText('1 / 3');
  await page.locator('#viewerContainer').evaluate(container => { container.scrollTop = container.scrollHeight; });
  await expect(page.locator('#pageStatus')).toHaveText('3 / 3');
  await expect(page.locator('#tool-nextPage')).toBeDisabled();
  await expect(page.locator('#tool-previousPage')).toBeEnabled();
});

test('tek sayfalık belgede iki düğme de pasiftir', async ({ page }) => {
  await openPdf(page, makePdf({ pages: 1 }));
  await expect(page.locator('#pageStatus')).toHaveText('1 / 1');
  await expect(page.locator('#tool-previousPage')).toBeDisabled();
  await expect(page.locator('#tool-nextPage')).toBeDisabled();
});

test('yakınlaştırma düğmeleri ve kısayolları sayfayı büyütür', async ({ page }) => {
  await openPdf(page, makePdf());
  const firstPage = page.locator('.page[data-page-number="1"]');
  await expect(firstPage.locator('.textLayer')).toContainText('awPDF');
  const width = async () => (await firstPage.boundingBox())!.width;
  const fitted = await width();
  await page.locator('#tool-zoomOut').click();
  await expect.poll(width).toBeLessThan(fitted);
  await page.keyboard.press('Control+0');
  await expect.poll(width).toBeCloseTo(fitted, 0);
});

test('iki sayfa görünümünde sayfalar yan yana gelir, düğmeler satır satır gezer', async ({ page }) => {
  await openPdf(page, makePdf({ pages: 5 }));
  const status = page.locator('#pageStatus');
  const toggle = page.locator('#tool-twoPages');
  const previous = page.locator('#tool-previousPage');
  const next = page.locator('#tool-nextPage');
  await expect(status).toHaveText('1 / 5');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  // The pointer is still over the button: the pressed look must survive hover.
  await expect(toggle).toHaveCSS('background-color', 'rgb(37, 99, 235)');
  await expect(status).toHaveText('1-2 / 5');
  // The contents, not `.page`: its invisible frame reaches into the neighbour's.
  await expect.poll(async () => {
    const first = (await page.locator('.page[data-page-number="1"] .canvasWrapper').boundingBox())!;
    const second = (await page.locator('.page[data-page-number="2"] .canvasWrapper').boundingBox())!;
    return Math.abs(second.y - first.y) < 1 && second.x >= first.x + first.width;
  }).toBe(true);
  await expect(previous).toBeDisabled();

  await next.click();
  await expect(status).toHaveText('3-4 / 5');
  await next.click();
  await expect(status).toHaveText('5 / 5');
  await expect(next).toBeDisabled();
  await previous.click();
  await expect(status).toHaveText('3-4 / 5');
  await previous.click();
  await expect(status).toHaveText('1-2 / 5');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(status).toHaveText(/^[12] \/ 5$/);
});

test('çift sayılı belgede son satırda sonraki sayfa düğmesi pasif olur', async ({ page }) => {
  await openPdf(page, makePdf({ pages: 4 }));
  await expect(page.locator('#pageStatus')).toHaveText('1 / 4');
  await page.locator('#tool-twoPages').click();
  await page.locator('#tool-nextPage').click();
  await expect(page.locator('#pageStatus')).toHaveText('3-4 / 4');
  await expect(page.locator('#tool-nextPage')).toBeDisabled();
});

test('iki sayfa görünümünde iki sayfa ekrana sığar, yeni belgede de korunur', async ({ page }) => {
  await openPdf(page, makePdf());
  await expect(page.locator('#pageStatus')).toHaveText('1 / 3');
  await page.locator('#tool-twoPages').click();
  await expect.poll(() => page.locator('#viewerContainer').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);

  await openPdf(page, makePdf({ pages: 2 }), 'ikinci.pdf');
  await expect(page.locator('#pageStatus')).toHaveText('1-2 / 2');
  await expect(page.locator('#tool-twoPages')).toHaveAttribute('aria-pressed', 'true');
});

test('yüksekliğe sığdırınca sayfa tümüyle görünür, pencere değişince yeniden sığar', async ({ page }) => {
  await openPdf(page, makePdf());
  const firstPage = page.locator('.page[data-page-number="1"]');
  await expect(firstPage.locator('.textLayer')).toContainText('awPDF');
  const fitsHeight = async () => {
    const pageHeight = (await firstPage.boundingBox())!.height;
    const space = (await page.locator('#viewerContainer').boundingBox())!.height;
    return pageHeight <= space && pageHeight > space * 0.95;
  };
  expect(await fitsHeight()).toBe(false);
  await page.locator('#tool-fitHeight').click();
  await expect.poll(fitsHeight).toBe(true);
  await page.setViewportSize({ width: 1440, height: 600 });
  await expect.poll(fitsHeight).toBe(true);
});

test('pencere daralınca sayfa genişliğe sığar, seçilen yakınlaştırma korunur', async ({ page }) => {
  await openPdf(page, makePdf());
  const firstPage = page.locator('.page[data-page-number="1"]');
  await expect(firstPage.locator('.textLayer')).toContainText('awPDF');
  const width = async () => (await firstPage.boundingBox())!.width;
  await page.setViewportSize({ width: 500, height: 800 });
  await expect.poll(width).toBeLessThan(500);

  await page.locator('#tool-zoomIn').click();
  await expect.poll(width).toBeGreaterThan(500);
  const zoomed = await width();
  await page.setViewportSize({ width: 420, height: 800 });
  await page.waitForTimeout(200);
  expect(await width()).toBe(zoomed);
});

test('pdf.js ayrı işçide çalışır, dışarıya istek gitmez', async ({ page, context, baseURL }) => {
  const requests: string[] = [];
  context.on('request', request => requests.push(request.url()));
  const worker = page.waitForEvent('worker', candidate => candidate.url().includes('pdf.worker'));
  await openPdf(page, makePdf());
  await worker;
  await expect(page.locator('.page[data-page-number="1"] .textLayer')).toContainText('awPDF');
  expect(requests.filter(url => !url.startsWith(baseURL!) && !/^(blob|data):/.test(url))).toEqual([]);
});

test('pdf.js\'in yardımcı dosyaları pakette gelir', async ({ page }) => {
  const statuses = await page.evaluate(() => Promise.all([
    'pdfjs/cmaps/UniGB-UTF16-H.bcmap',
    'pdfjs/iccs/CGATS001Compat-v2-micro.icc',
    'pdfjs/standard_fonts/LiberationSans-Regular.ttf',
    'pdfjs/wasm/openjpeg.wasm',
  ].map(async url => (await fetch(url)).status)));
  expect(statuses).toEqual([200, 200, 200, 200]);
});

test('büyük dosya bütünüyle okunmaz', async ({ page }) => {
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
  const buffer = makePdf({ padding: 20 * MEGABYTE });
  await openPdf(page, buffer);
  await expect(page.locator('.page[data-page-number="1"] .textLayer')).toContainText('awPDF');
  const bytesRead = await page.evaluate(() => (window as unknown as { bytesRead: number }).bytesRead);
  expect(bytesRead).toBeGreaterThan(0);
  expect(bytesRead).toBeLessThan(buffer.length / 4);
});

test('bozuk dosya uygulamayı bozmaz, anlaşılır mesaj verir', async ({ page }) => {
  await openPdf(page, Buffer.from('bu bir PDF değil'));
  await expect(page.locator('#toast')).toHaveText('Bu PDF açılamadı.');
  await expect(page.locator('#emptyState')).toBeVisible();
  await openPdf(page, makePdf());
  await expect(page.locator('#pageStatus')).toHaveText('1 / 3');
});

test('aynı dosya art arda açılabilir, yeni belge eskisinin yerini alır', async ({ page }) => {
  await openPdf(page, makePdf({ pages: 3 }));
  await expect(page.locator('#pageStatus')).toHaveText('1 / 3');
  await openPdf(page, makePdf({ pages: 2 }), 'ikinci.pdf');
  await expect(page.locator('#pageStatus')).toHaveText('1 / 2');
  await expect(page).toHaveTitle('ikinci.pdf | awPDF | mADEMatik');
});

test('200 MB üstü dosyada uyarı çıkar, vazgeçilince açılmaz', async ({ page }) => {
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new ArrayBuffer(201 * 1024 * 1024)], 'kitap.pdf', { type: 'application/pdf' }));
    const input = document.querySelector<HTMLInputElement>('#pdfInput')!;
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
  });
  const dialog = page.locator('#largeFileDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('kitap.pdf (201 MB)');
  await dialog.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#emptyState')).toBeVisible();
  await expect(page.locator('#toast')).toBeHidden();
});

test('dış bağlantılar kapalıdır', async ({ page }) => {
  await openPdf(page, makePdf());
  await expect(page.locator('#pageStatus')).toHaveText('1 / 3');
  await expect(page.locator('.annotationLayer a[href^="http"]')).toHaveCount(0);
});
