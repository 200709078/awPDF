import { expect, test, type Page } from '@playwright/test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { makeFormPdf, readForm } from './helpers/make-form-pdf.mjs';
import { makePdf } from './helpers/make-pdf.mjs';
import { makePng, pngSize } from './helpers/make-image.mjs';
import { makeDocx } from './helpers/make-docx.mjs';

interface Saved { name: string; bytes: number[] }

/**
 * Stands in for the browser's save dialog: what the app writes is kept in `window.saves`.
 * `window.cancelSave` makes the next dialog come back cancelled.
 */
async function captureSaves(page: Page) {
  await page.addInitScript(() => {
    const state = window as unknown as { saves: Saved[]; cancelSave?: boolean };
    state.saves = [];
    Object.assign(window, {
      showSaveFilePicker: async ({ suggestedName }: { suggestedName: string }) => {
        if (state.cancelSave) throw new DOMException('Vazgeçildi', 'AbortError');
        const bytes: number[] = [];
        return {
          name: suggestedName,
          isSameEntry: async () => false,
          createWritable: async () => ({
            // Item by item: spreading a large file overflows the call stack.
            write: async (data: Uint8Array) => { for (const byte of data) bytes.push(byte); },
            close: async () => { state.saves.push({ name: suggestedName, bytes }); },
          }),
        };
      },
    });
  });
}

const saves = (page: Page) => page.evaluate(() => (window as unknown as { saves: Saved[] }).saves);
const lastSave = async (page: Page) => {
  // Counts only: carrying every saved byte over on each poll is slow for a large file.
  await expect.poll(() => page.evaluate(() => (window as unknown as { saves: Saved[] }).saves.length)).toBeGreaterThan(0);
  return page.evaluate(() => (window as unknown as { saves: Saved[] }).saves.at(-1)!);
};

async function openPdf(page: Page, buffer: Buffer, name = 'deneme.pdf') {
  await page.locator('#pdfInput').setInputFiles({ name, mimeType: 'application/pdf', buffer });
  await expect(page.locator('.page .textLayer').first()).toBeAttached();
}

/** Each page as "text@rotation", read back by pdf.js. */
async function pagesOf(bytes: number[]): Promise<string[]> {
  const pdf = await getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  const pages: string[] = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const text = (await page.getTextContent()).items.map(item => ('str' in item ? item.str : '')).join('');
    pages.push(`${text}@${page.rotate}`);
  }
  return pages;
}

/** Page sizes of a saved PDF, in points. */
async function pageShapes(bytes: number[]) {
  const pdf = await getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  const shapes: string[] = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    shapes.push(`${Math.round(page.view[2])}x${Math.round(page.view[3])}`);
  }
  return shapes;
}

const status = (page: Page) => page.locator('#pageStatus');
const text = (index: number) => `S${index + 1}`;

test.beforeEach(async ({ page }) => {
  await captureSaves(page);
  await page.goto('/');
});

test.describe('form doldurma', () => {
  async function fillForm(page: Page) {
    await page.locator('input[name="ad"]').fill('Ayşe Işık');
    await page.locator('textarea[name="not"]').fill('İki satır\nnot');
    await page.locator('input[name="onay"]').check();
    await page.locator('select[name="sinif"]').selectOption('10-B');
    await page.locator('input[name="ad"]').focus();
  }

  test('doldurulan alanlar Farklı Kaydet ile yeni dosyaya yazılır, sekme işareti kalkar', async ({ page }) => {
    await openPdf(page, await makeFormPdf(), 'form.pdf');
    await fillForm(page);
    await expect(page.locator('.tab.is-modified')).toHaveCount(1);
    await page.locator('#tool-saveAs').click();
    const saved = await lastSave(page);
    expect(saved.name).toBe('form (doldurulmuş).pdf');
    expect(await readForm(Buffer.from(saved.bytes))).toEqual({ ad: 'Ayşe Işık', not: 'İki satır\nnot', onay: true, sinif: '10-B' });
    await expect(page.locator('#toast')).toHaveText('Kaydedildi: form (doldurulmuş).pdf');
    await expect(page.locator('.tab.is-modified')).toHaveCount(0);
  });

  test('değişmemiş belge "kopya" adıyla kaydedilir, vazgeçilen kayıt bir şey yazmaz', async ({ page }) => {
    await openPdf(page, makePdf({ pages: 2 }));
    await page.evaluate(() => { (window as unknown as { cancelSave: boolean }).cancelSave = true; });
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(300);
    expect(await saves(page)).toHaveLength(0);
    await page.evaluate(() => { (window as unknown as { cancelSave: boolean }).cancelSave = false; });
    await page.keyboard.press('Control+s');
    expect((await lastSave(page)).name).toBe('deneme (kopya).pdf');
  });

  test('kaydedilmemiş değişiklikle kapatırken sorulur: vazgeç, kaydet ya da kaydetmeden kapat', async ({ page }) => {
    await openPdf(page, await makeFormPdf(), 'form.pdf');
    await fillForm(page);
    const dialog = page.locator('#unsavedDialog');
    await page.locator('#tool-closeTab').click();
    await expect(dialog).toBeVisible();
    await expect(page.locator('#unsavedMessage')).toContainText('form.pdf');
    await dialog.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('#viewerContainer')).toBeVisible();

    await page.locator('.tab__close').click();
    await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click();
    expect((await readForm(Buffer.from((await lastSave(page)).bytes))).ad).toBe('Ayşe Işık');
    await expect(page.locator('#emptyOpen')).toBeVisible();

    await openPdf(page, await makeFormPdf(), 'form.pdf');
    await page.locator('input[name="ad"]').fill('Ali');
    await page.locator('#tool-closeTab').click();
    await dialog.getByRole('button', { name: 'Kaydetmeden kapat' }).click();
    await expect(page.locator('#emptyOpen')).toBeVisible();
    expect(await saves(page)).toHaveLength(1);
  });

  test('kayıttan vazgeçilirse belge kapanmaz', async ({ page }) => {
    await openPdf(page, await makeFormPdf(), 'form.pdf');
    await page.locator('input[name="ad"]').fill('Ali');
    await page.evaluate(() => { (window as unknown as { cancelSave: boolean }).cancelSave = true; });
    await page.locator('#tool-closeTab').click();
    await page.locator('#unsavedDialog').getByRole('button', { name: 'Kaydet', exact: true }).click();
    await page.waitForTimeout(300);
    await expect(page.locator('#viewerContainer')).toBeVisible();
    await expect(page.locator('.tab.is-modified')).toHaveCount(1);
  });

  test('alana yazılan harfler kısayol olmaz', async ({ page }) => {
    await openPdf(page, await makeFormPdf(), 'form.pdf');
    const box = async () => (await page.locator('.page[data-page-number="1"]').boundingBox())!;
    await page.locator('input[name="ad"]').click();
    await page.keyboard.type('rr');
    await expect(page.locator('input[name="ad"]')).toHaveValue('rr');
    await page.waitForTimeout(200);
    const { width, height } = await box();
    expect(height).toBeGreaterThan(width);
  });

  test('kaydedilmemiş değişiklik varken sayfadan çıkmak tarayıcıya sorulur', async ({ page }) => {
    await openPdf(page, await makeFormPdf(), 'form.pdf');
    await page.locator('input[name="ad"]').fill('Ali');
    const asked = page.waitForEvent('dialog');
    await page.close({ runBeforeUnload: true });
    const dialog = await asked;
    expect(dialog.type()).toBe('beforeunload');
    await dialog.dismiss();
  });
});

test.describe('sayfaları düzenleme', () => {
  const editor = (page: Page) => page.locator('#pageEditor');
  const cards = (page: Page) => page.locator('#pageEditorGrid .page-card');
  const origins = (page: Page) => page.locator('#pageEditorGrid .page-card__origin').allTextContents();
  const action = (page: Page, id: string) => page.locator(`#pageEditor-${id}`);

  test('sayfa seçilir, silinir, döndürülür, taşınır; kaydedilen yeni belge açılır', async ({ page }) => {
    await openPdf(page, makePdf({ pages: 4, text }));
    await expect(status(page)).toHaveText('1 / 4');
    await page.locator('#tool-editPages').click();
    await expect(editor(page)).toBeVisible();
    await expect(cards(page)).toHaveCount(4);
    await expect(action(page, 'save')).toBeDisabled();
    await expect(action(page, 'delete')).toBeDisabled();
    // Pages are really drawn.
    await expect.poll(() => cards(page).first().locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBeGreaterThan(0);

    await cards(page).nth(1).click();
    await expect(page.locator('#pageEditorStatus')).toHaveText('4 sayfa · 1 seçili');
    await action(page, 'delete').click();
    await expect(cards(page)).toHaveCount(3);
    await cards(page).nth(0).click();
    await action(page, 'rotateRight').click();
    await expect(cards(page).nth(0)).toHaveAttribute('data-rotation', '90');
    await expect.poll(() => cards(page).nth(0).locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width > canvas.height)).toBe(true);
    await action(page, 'moveRight').click();
    expect(await origins(page)).toEqual(['s. 3', 's. 1', 's. 4']);

    await action(page, 'save').click();
    const saved = await lastSave(page);
    expect(saved.name).toBe('deneme (düzenlendi).pdf');
    expect(await pagesOf(saved.bytes)).toEqual(['S3@0', 'S1@90', 'S4@0']);
    await expect(editor(page)).toBeHidden();
    await expect(status(page)).toHaveText('1 / 3');
    await expect(page.locator('.tab__title')).toHaveText(['deneme.pdf', 'deneme (düzenlendi).pdf']);
  });

  test('başka PDF eklenir, seçilenler ayrı dosyaya yazılır, düzenleyici açık kalır', async ({ page }) => {
    await openPdf(page, makePdf({ pages: 2, text }));
    await page.locator('#tool-editPages').click();
    await page.locator('#pageEditorInput').setInputFiles({ name: 'ek.pdf', mimeType: 'application/pdf', buffer: makePdf({ pages: 2, text: index => `E${index + 1}` }) });
    await expect(cards(page)).toHaveCount(4);
    expect(await origins(page)).toEqual(['s. 1', 's. 2', 'ek.pdf · s. 1', 'ek.pdf · s. 2']);
    await action(page, 'selectAll').click();
    await expect(action(page, 'selectAll')).toHaveText('Seçimi Kaldır');
    await cards(page).nth(1).click();
    await cards(page).nth(2).click();
    await action(page, 'saveSelected').click();
    const saved = await lastSave(page);
    expect(saved.name).toBe('deneme (seçilen sayfalar).pdf');
    expect(await pagesOf(saved.bytes)).toEqual(['S1@0', 'E2@0']);
    await expect(editor(page)).toBeVisible();
    await expect(page.locator('#toast')).toBeVisible();
  });

  test('parolalı ek dosya parolası sorularak eklenir; parolalı belgede not görünür', async ({ page }) => {
    await openPdf(page, makePdf({ pages: 1, text }));
    await page.locator('#tool-editPages').click();
    await expect(page.locator('#pageEditorNote')).toBeHidden();
    await page.locator('#pageEditorInput').setInputFiles({ name: 'gizli.pdf', mimeType: 'application/pdf', buffer: makePdf({ pages: 1, text: () => 'G1', password: 'p' }) });
    await expect(page.locator('#passwordDialog')).toBeVisible();
    await page.locator('#passwordInput').fill('p');
    await page.keyboard.press('Enter');
    await expect(cards(page)).toHaveCount(2);
    await action(page, 'save').click();
    expect(await pagesOf((await lastSave(page)).bytes)).toEqual(['S1@0', 'G1@0']);

    await openPdf(page, makePdf({ pages: 2, password: 'x' }), 'parolali.pdf').catch(() => undefined);
    await page.locator('#passwordInput').fill('x');
    await page.keyboard.press('Enter');
    await expect(status(page)).toHaveText('1 / 2');
    await page.locator('#tool-editPages').click();
    await expect(page.locator('#pageEditorNote')).toContainText('parola korunur');
  });

  test('değişiklik varken çıkmak sorulur; değişiklik yoksa sorulmaz', async ({ page }) => {
    await openPdf(page, makePdf({ pages: 3 }));
    await page.locator('#tool-editPages').click();
    await page.locator('#pageEditorClose').click();
    await expect(editor(page)).toBeHidden();

    await page.locator('#tool-editPages').click();
    await cards(page).first().click();
    await action(page, 'rotateLeft').click();
    await page.locator('#pageEditorClose').click();
    await expect(page.locator('#leaveEditorDialog')).toBeVisible();
    await page.locator('#leaveEditorDialog').getByRole('button', { name: 'Vazgeç' }).click();
    await expect(editor(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#leaveEditorDialog')).toBeVisible();
    await page.locator('#leaveEditorDialog').getByRole('button', { name: 'Çık' }).click();
    await expect(editor(page)).toBeHidden();
    expect(await saves(page)).toHaveLength(0);
  });

  test('fareyle sürüklenen sayfa bırakıldığı yere geçer, seçimi değişmez', async ({ page }) => {
    await openPdf(page, makePdf({ pages: 4, text }));
    await page.locator('#tool-editPages').click();
    await expect(cards(page)).toHaveCount(4);
    const from = (await cards(page).nth(0).boundingBox())!;
    const to = (await cards(page).nth(2).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width * 0.8, to.y + to.height / 2, { steps: 8 });
    await expect(cards(page).nth(2)).toHaveClass(/is-drop-after/);
    await page.mouse.up();
    expect(await origins(page)).toEqual(['s. 2', 's. 3', 's. 1', 's. 4']);
    await expect(page.locator('#pageEditorGrid .is-selected')).toHaveCount(0);
    await expect(action(page, 'save')).toBeEnabled();
  });

  test('seçili sayfaların hepsi birlikte sürüklenir', async ({ page }) => {
    await openPdf(page, makePdf({ pages: 5, text }));
    await page.locator('#tool-editPages').click();
    await cards(page).nth(3).click();
    await cards(page).nth(4).click();
    const from = (await cards(page).nth(4).boundingBox())!;
    const to = (await cards(page).nth(0).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width * 0.2, to.y + to.height / 2, { steps: 8 });
    await page.mouse.up();
    expect(await origins(page)).toEqual(['s. 4', 's. 5', 's. 1', 's. 2', 's. 3']);
  });

  test('dar ekranda düğmeler tek simge olur, pencere ekranı kaplar', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await openPdf(page, makePdf({ pages: 3 }));
    await page.locator('#toolbarMenuButton').click();
    await page.locator('#tool-editPages').click();
    const box = (await editor(page).boundingBox())!;
    expect(box.width).toBe(360);
    expect(box.height).toBe(640);
    const width = await page.evaluate(() => document.querySelector('#pageEditor')!.scrollWidth);
    expect(width).toBeLessThanOrEqual(360);
    await expect(action(page, 'delete').locator('.page-editor__label')).toHaveCSS('position', 'absolute');
  });
});

test.describe('görsel ↔ PDF', () => {
  const cards = (page: Page) => page.locator('#pageEditorGrid .page-card');
  const red = () => makePng({ width: 400, height: 300, color: [220, 30, 30] });
  const tall = () => makePng({ width: 300, height: 600, color: [30, 30, 220] });

  test('seçilen görseller A4 sayfalar olur, düzenleyicide sıralanıp kaydedilir', async ({ page }) => {
    await page.locator('#imageInput').setInputFiles([
      { name: 'kırmızı.png', mimeType: 'image/png', buffer: red() },
      { name: 'uzun.png', mimeType: 'image/png', buffer: tall() },
    ]);
    await expect(page.locator('#imageSizeDialog')).toBeVisible();
    await page.locator('#imageSizeDialog').getByRole('button', { name: 'Oluştur' }).click();
    await expect(page.locator('#pageEditorTitle')).toHaveText('Görsellerden PDF');
    await expect(cards(page)).toHaveCount(2);
    await expect(page.locator('#pageEditor-save')).toBeEnabled();
    await cards(page).nth(1).click();
    await page.locator('#pageEditor-moveLeft').click();
    await page.locator('#pageEditor-save').click();
    const saved = await lastSave(page);
    expect(saved.name).toBe('kırmızı.pdf');
    expect(await pageShapes(saved.bytes)).toEqual(['595x842', '842x595']);
    await expect(page.locator('#pageEditor')).toBeHidden();
    await expect(status(page)).toHaveText('1 / 2');
  });

  test('telefonun yan kaydedip "dik" diye işaretlediği fotoğraf dik sayfa olur', async ({ page }) => {
    // A 400 × 300 JPEG with EXIF orientation 6: shown turned a quarter clockwise, so 300 × 400.
    const jpeg = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 300;
      canvas.getContext('2d')!.fillRect(0, 0, 400, 150);
      const plain = new Uint8Array(await (await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), 'image/jpeg'))).arrayBuffer());
      const tiff = [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
      const body = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
      const app1 = [0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body];
      return [...plain.subarray(0, 2), ...app1, ...plain.subarray(2)];
    });
    await page.locator('#imageInput').setInputFiles({ name: 'foto.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg) });
    await page.locator('#imageSizeDialog input[value="image"]').check();
    await page.locator('#imageSizeDialog').getByRole('button', { name: 'Oluştur' }).click();
    await expect(cards(page)).toHaveCount(1);
    await page.locator('#pageEditor-save').click();
    expect(await pageShapes((await lastSave(page)).bytes)).toEqual(['225x300']);
  });

  test('görselin kendi boyutunda sayfa seçilebilir; kaydetmeden çıkmak sorulur', async ({ page }) => {
    await page.locator('#imageInput').setInputFiles({ name: 'resim.png', mimeType: 'image/png', buffer: red() });
    await page.locator('#imageSizeDialog input[value="image"]').check();
    await page.locator('#imageSizeDialog').getByRole('button', { name: 'Oluştur' }).click();
    await expect(cards(page)).toHaveCount(1);
    await page.locator('#pageEditorClose').click();
    await expect(page.locator('#leaveEditorDialog')).toBeVisible();
    await page.locator('#leaveEditorDialog').getByRole('button', { name: 'Vazgeç' }).click();
    await page.locator('#pageEditor-save').click();
    expect(await pageShapes((await lastSave(page)).bytes)).toEqual(['300x225']);
  });

  test('Android\'in numarayla adlandırdığı görselden "Görseller" ve tarih adlı PDF olur', async ({ page }) => {
    await page.locator('#imageInput').setInputFiles({ name: '1000120402.png', mimeType: 'image/png', buffer: red() });
    await page.locator('#imageSizeDialog').getByRole('button', { name: 'Oluştur' }).click();
    await page.locator('#pageEditor-save').click();
    expect((await lastSave(page)).name).toMatch(/^Görseller \d{4}-\d{2}-\d{2}\.pdf$/);
  });

  test('okunamayan görsel adıyla bildirilir, ötekiler yine PDF olur', async ({ page }) => {
    await page.locator('#imageInput').setInputFiles([
      { name: 'bozuk.png', mimeType: 'image/png', buffer: Buffer.from('bu bir görsel değil') },
      { name: 'iyi.png', mimeType: 'image/png', buffer: red() },
    ]);
    await page.locator('#imageSizeDialog').getByRole('button', { name: 'Oluştur' }).click();
    await expect(page.locator('#toast')).toHaveText('Açılamayan görsel: bozuk.png');
    await expect(cards(page)).toHaveCount(1);
  });

  test('pencereye bırakılan görsel de PDF yapılır; ilk ekranda düğmesi vardır', async ({ page }) => {
    await expect(page.locator('#emptyImages')).toBeVisible();
    await page.evaluate(bytes => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], 'birakilan.png', { type: 'image/png' }));
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
    }, [...red()]);
    await expect(page.locator('#imageSizeDialog')).toBeVisible();
  });

  test('düzenleyicide var olan PDF\'e görsel eklenir', async ({ page }) => {
    await openPdf(page, makePdf({ pages: 2, text }));
    await page.locator('#tool-editPages').click();
    await page.locator('#pageEditorInput').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: tall() });
    await expect(cards(page)).toHaveCount(3);
    expect(await page.locator('#pageEditorGrid .page-card__origin').allTextContents()).toEqual(['s. 1', 's. 2', 'foto.png · s. 1']);
    await page.locator('#pageEditor-save').click();
    expect(await pageShapes((await lastSave(page)).bytes)).toEqual(['612x792', '612x792', '595x842']);
  });

  test('bu sayfa PNG olarak, birkaç sayfa JPG olarak ZIP içinde kaydedilir', async ({ page }) => {
    await openPdf(page, makePdf({ pages: 3, text }));
    await page.locator('#tool-saveImages').click();
    await expect(page.locator('#imageExportCurrent')).toHaveText('Bu sayfa (1)');
    await page.locator('#imageExportDialog').getByRole('button', { name: 'Kaydet' }).click();
    const png = await lastSave(page);
    expect(png.name).toBe('deneme - sayfa 1.png');
    expect(pngSize(png.bytes)).toEqual({ width: 1275, height: 1650 });

    await page.locator('#tool-saveImages').click();
    // It opens on "this page" again, whatever was chosen last time.
    await expect(page.locator('#imageExportDialog input[name="imageExport"][value="current"]')).toBeChecked();
    await page.locator('#imageExportInput').fill('2-3');
    await page.locator('#imageExportDialog input[value="jpg"]').check();
    await page.locator('#imageExportDialog input[value="300"]').check();
    await page.locator('#imageExportDialog').getByRole('button', { name: 'Kaydet' }).click();
    await expect.poll(async () => (await saves(page)).length).toBe(2);
    const archive = Buffer.from((await saves(page))[1].bytes);
    expect((await saves(page))[1].name).toBe('deneme (görseller).zip');
    expect(archive.readUInt32LE(0)).toBe(0x04034b50);
    expect(archive.includes(Buffer.from('deneme - sayfa 2.jpg'))).toBe(true);
    expect(archive.includes(Buffer.from('deneme - sayfa 3.jpg'))).toBe(true);
    expect(archive.readUInt16LE(archive.length - 12)).toBe(2);
  });

  test('çizilen bölge yüksek çözünürlüklü görsel olur ve kaydedilir; Esc bölge almayı bırakır', async ({ page }) => {
    await openPdf(page, makePdf({ pages: 2, text }));
    await page.locator('#tool-captureRegion').click();
    await expect(page.locator('.region-overlay')).toBeVisible();
    await expect(page.locator('#regionHint')).toBeVisible();
    await expect(page.locator('#tool-captureRegion')).toHaveAttribute('aria-pressed', 'true');
    const box = (await page.locator('.page[data-page-number="1"] .canvasWrapper').boundingBox())!;
    // A quarter of the page's width and a tenth of its height, from its top left quarter.
    const from = { x: box.x + box.width * 0.25, y: box.y + box.height * 0.1 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + box.width * 0.25, from.y + box.height * 0.1, { steps: 5 });
    await expect(page.locator('.region-overlay__box')).toBeVisible();
    await page.mouse.up();
    await expect(page.locator('#regionDialog')).toBeVisible();
    await expect(page.locator('#regionShare')).toBeHidden();
    await page.locator('#regionSave').click();
    const saved = await lastSave(page);
    expect(saved.name).toBe('deneme - sayfa 1 bölge.png');
    // 612 × 792 points at 300 DPI is 2550 × 3300 pixels; a quarter and a tenth of that.
    const { width, height } = pngSize(saved.bytes);
    expect(Math.abs(width - 2550 * 0.25)).toBeLessThan(15);
    expect(Math.abs(height - 3300 * 0.1)).toBeLessThan(15);
    await expect(page.locator('#regionDialog')).toBeHidden();
    // Still on for another part, until Esc.
    await expect(page.locator('.region-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.region-overlay')).toHaveCount(0);
    await expect(page.locator('#regionHint')).toBeHidden();
  });

  test('sayfa dışına çizilen bölge uyarı verir', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openPdf(page, makePdf({ pages: 1, text }));
    await page.locator('#tool-fitPage').click();
    await page.locator('#tool-captureRegion').click();
    const area = (await page.locator('.region-overlay').boundingBox())!;
    await page.mouse.move(area.x + 10, area.y + area.height - 60);
    await page.mouse.down();
    await page.mouse.move(area.x + 80, area.y + area.height - 10, { steps: 3 });
    await page.mouse.up();
    await expect(page.locator('#toast')).toHaveText('Bölgeyi bir sayfanın üstüne çizin.');
  });
});

test.describe('Word → PDF', () => {
  const cards = (page: Page) => page.locator('#pageEditorGrid .page-card');
  const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  test('ilk ekrandaki üç düğme aynı boyuttadır', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 760 });
    const sizes = await page.locator('#emptyOpen, #emptyImages, #emptyWord')
      .evaluateAll(buttons => buttons.map(button => `${button.getBoundingClientRect().width}x${button.getBoundingClientRect().height}`));
    expect(sizes).toHaveLength(3);
    expect(new Set(sizes).size).toBe(1);
  });

  test('Word belgesi sayfa sayfa A4 PDF olur, düzenleyicide açılıp kaydedilir', async ({ page }) => {
    await expect(page.locator('#emptyWord')).toBeVisible();
    await page.locator('#wordInput').setInputFiles({ name: 'Ödev.docx', mimeType: DOCX_TYPE, buffer: await makeDocx({ lines: 150 }) });
    await expect(page.locator('#pageEditorTitle')).toHaveText("Word'den PDF");
    // The title page, the table page, and 150 lines, which no Word has paged, over three pages.
    await expect(cards(page)).toHaveCount(5);
    await expect(page.locator('#pageEditor-save')).toBeEnabled();
    await page.locator('#pageEditor-save').click();
    const saved = await lastSave(page);
    expect(saved.name).toBe('Ödev.pdf');
    expect(await pageShapes(saved.bytes)).toEqual(Array(5).fill('595x842'));
    await expect(page.locator('#pageEditor')).toBeHidden();
    await expect(status(page)).toHaveText('1 / 5');
  });

  test('araç çubuğundaki düğme Word belgesi sorar; bırakılan Word belgesi de dönüştürülür', async ({ page }) => {
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#tool-wordToPdf').click();
    expect((await chooser).isMultiple()).toBe(false);
    await page.evaluate(bytes => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], 'bırakılan.docx'));
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
    }, [...await makeDocx()]);
    await expect(page.locator('#pageEditorTitle')).toHaveText("Word'den PDF");
    await expect(cards(page)).toHaveCount(2);
  });

  test('düzenleyicide var olan PDF\'e Word belgesi eklenir', async ({ page }) => {
    await openPdf(page, makePdf({ pages: 1, text }));
    await page.locator('#tool-editPages').click();
    await expect(page.locator('#pageEditor-add')).toContainText('Dosya Ekle');
    await page.locator('#pageEditorInput').setInputFiles({ name: 'ek.docx', mimeType: DOCX_TYPE, buffer: await makeDocx() });
    await expect(cards(page)).toHaveCount(3);
    expect(await page.locator('#pageEditorGrid .page-card__origin').allTextContents()).toEqual(['s. 1', 'ek.docx · s. 1', 'ek.docx · s. 2']);
    await page.locator('#pageEditor-save').click();
    expect(await pageShapes((await lastSave(page)).bytes)).toEqual(['612x792', '595x842', '595x842']);
  });

  test('eski .doc biçimi ve bozuk belge adıyla bildirilir', async ({ page }) => {
    await page.locator('#wordInput').setInputFiles({ name: 'eski.doc', mimeType: 'application/msword', buffer: Buffer.from('eski') });
    await expect(page.locator('#toast')).toContainText('.docx olarak kaydedip');
    await page.locator('#wordInput').setInputFiles({ name: 'bozuk.docx', mimeType: DOCX_TYPE, buffer: Buffer.from('bu bir Word belgesi değil') });
    await expect(page.locator('#toast')).toHaveText('Word belgesi okunamadı: bozuk.docx');
    await expect(page.locator('#pageEditor')).toBeHidden();
    await expect(page.locator('#workDialog')).toBeHidden();
  });
});
