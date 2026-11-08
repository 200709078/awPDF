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

test.describe('işaretleme', () => {
  const bar = (page: Page) => page.locator('#annotateBar');
  const barButton = (page: Page, name: string) => bar(page).getByRole('button', { name, exact: true });

  /** A pen stroke on the first page, from (x, y) in page pixels. */
  async function stroke(page: Page, x: number, y: number) {
    const box = (await page.locator('.page').first().boundingBox())!;
    await page.mouse.move(box.x + x, box.y + y);
    await page.mouse.down();
    for (let step = 1; step <= 10; step += 1) await page.mouse.move(box.x + x + step * 15, box.y + y + step * 5);
    await page.mouse.up();
  }

  /** The saved PDF's annotations on page 1, as pdf.js reads them. */
  async function annotationsOf(bytes: number[]) {
    const pdf = await getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
    return (await pdf.getPage(1)).getAnnotations();
  }

  test('kalemle çizilen, kalem bırakılmadan kaydedilse de PDF\'e girer', async ({ page }) => {
    await openPdf(page, makePdf());
    await page.locator('#tool-annotate').click();
    await expect(bar(page)).toBeVisible();
    await expect(page.locator('#tool-annotate')).toHaveAttribute('aria-pressed', 'true');
    await expect(barButton(page, 'Kalem')).toHaveAttribute('aria-pressed', 'true');
    await expect(barButton(page, 'Geri Al')).toBeDisabled();
    await barButton(page, 'Mavi').click();
    await stroke(page, 100, 200);
    await stroke(page, 100, 260);
    await expect(barButton(page, 'Geri Al')).toBeEnabled();
    // Still drawing: pdf.js has not put the strokes in the document yet; saving does.
    await page.keyboard.press('Control+s');
    const saved = await lastSave(page);
    expect(saved.name).toBe('deneme (işaretli).pdf');
    const ink = (await annotationsOf(saved.bytes)).filter(annotation => annotation.subtype === 'Ink');
    expect(ink).toHaveLength(1);
    expect(ink[0].inkLists).toHaveLength(2);
    expect([...ink[0].color]).toEqual([0x1d, 0x4e, 0xd8]);
    // The editing layer speaks Turkish (public/pdfjs-l10n).
    await expect(page.locator('.annotationEditorLayer .inkEditor')).toHaveAttribute('aria-label', 'Çizim');
  });

  test('fosforlu kalem metni vurgular, metin kutusuna yazı yazılır', async ({ page }) => {
    await openPdf(page, makePdf({ text: () => 'Vurgulanacak satır burada' }));
    await page.locator('#tool-annotate').click();
    await barButton(page, 'Fosforlu').click();
    await expect(page.locator('.annotationEditorLayer').first()).toHaveClass(/highlightEditing/);
    const words = (await page.locator('.page[data-page-number="1"] .textLayer span').first().boundingBox())!;
    await page.mouse.move(words.x + 2, words.y + words.height / 2);
    await page.mouse.down();
    await page.mouse.move(words.x + words.width - 2, words.y + words.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('.highlightEditor')).toHaveCount(1);

    await barButton(page, 'Metin').click();
    await barButton(page, 'Büyük').click();
    const box = (await page.locator('.page').first().boundingBox())!;
    await page.mouse.click(box.x + 150, box.y + 400);
    const textBox = page.locator('.freeTextEditor .internal');
    await expect(textBox).toBeFocused();
    await page.keyboard.type('Ödev: Işık ve gölge');
    await barButton(page, 'Bitti').click();
    await expect(bar(page)).toBeHidden();
    await expect(page.locator('.annotationEditorLayer').first()).not.toHaveClass(/(ink|highlight|freetext)Editing/);
    await expect(page.locator('.tab.is-modified')).toHaveCount(1);

    await page.keyboard.press('Control+s');
    const annotations = await annotationsOf((await lastSave(page)).bytes);
    const highlight = annotations.find(annotation => annotation.subtype === 'Highlight');
    expect([...highlight!.color]).toEqual([0xff, 0xff, 0x98]);
    const freeText = annotations.find(annotation => annotation.subtype === 'FreeText');
    expect(freeText!.textContent?.join('') ?? freeText!.contentsObj?.str).toContain('Ödev: Işık ve gölge');
  });

  test('geri al ve yinele çizgi çizgi çalışır; kapatırken kaydedilmemiş çizim sorulur', async ({ page }) => {
    await openPdf(page, makePdf());
    await page.locator('#tool-annotate').click();
    await stroke(page, 100, 200);
    await stroke(page, 100, 260);
    await barButton(page, 'Geri Al').click();
    await barButton(page, 'Geri Al').click();
    await expect(barButton(page, 'Geri Al')).toBeDisabled();
    await barButton(page, 'Yinele').click();
    await barButton(page, 'Bitti').click();
    await expect(page.locator('.inkEditor')).toHaveCount(1);

    // Drawn but the pen not put down: closing still asks.
    await page.locator('#tool-annotate').click();
    await stroke(page, 100, 400);
    await page.locator('.tab__close').click();
    await expect(page.locator('#unsavedDialog')).toBeVisible();
    await page.locator('#unsavedDialog').getByRole('button', { name: 'Kaydet', exact: true }).click();
    const ink = (await annotationsOf((await lastSave(page)).bytes)).filter(annotation => annotation.subtype === 'Ink');
    expect(ink).toHaveLength(2);
    await expect(page.locator('#emptyOpen')).toBeVisible();
    await expect(bar(page)).toBeHidden();
  });

  test('seçilen çizim silinir; Esc ile çubuk kapanır', async ({ page }) => {
    await openPdf(page, makePdf());
    await page.locator('#tool-annotate').click();
    await stroke(page, 100, 200);
    await barButton(page, 'Metin').click();
    await barButton(page, 'Kalem').click();
    await expect(page.locator('.inkEditor')).toHaveCount(1);
    await expect(barButton(page, 'Seçileni Sil')).toBeDisabled();
    await page.locator('.inkEditor').click();
    await expect(barButton(page, 'Seçileni Sil')).toBeEnabled();
    await barButton(page, 'Seçileni Sil').click();
    await expect(page.locator('.inkEditor')).toHaveCount(0);
    await page.locator('#viewerContainer').focus();
    await page.keyboard.press('Escape');
    await expect(bar(page)).toBeHidden();
  });
});

test.describe('işaretlerin yolları', () => {
  async function drawRed(page: Page) {
    await page.locator('#tool-annotate').click();
    await page.locator('#annotateBar').getByRole('button', { name: 'Kırmızı', exact: true }).click();
    await page.locator('#annotateBar').getByRole('button', { name: 'Kalın', exact: true }).click();
    const box = (await page.locator('.page').first().boundingBox())!;
    await page.mouse.move(box.x + 100, box.y + 300);
    await page.mouse.down();
    for (let step = 1; step <= 10; step += 1) await page.mouse.move(box.x + 100 + step * 30, box.y + 300);
    await page.mouse.up();
  }

  test('Sayfaları Düzenle işaretleri yeni belgeye taşır', async ({ page }) => {
    await openPdf(page, makePdf({ pages: 3, text }));
    await drawRed(page);
    await page.locator('#tool-editPages').click();
    await expect(page.locator('#pageEditorGrid .page-card')).toHaveCount(3);
    await page.locator('#pageEditorGrid .page-card').nth(1).click();
    await page.locator('#pageEditor-delete').click();
    await page.locator('#pageEditor-save').click();
    const saved = await lastSave(page);
    expect(await pagesOf(saved.bytes)).toEqual(['S1@0', 'S3@0']);
    const pdf = await getDocument({ data: new Uint8Array(saved.bytes), verbosity: 0 }).promise;
    const ink = (await (await pdf.getPage(1)).getAnnotations()).filter(annotation => annotation.subtype === 'Ink');
    expect(ink).toHaveLength(1);
  });

  test('başka sekmeye geçip dönünce işaretler yerinde durur, kaydedilmiş belge değişmiş sayılmaz', async ({ page }) => {
    await openPdf(page, makePdf({ pages: 2, text: index => `A${index + 1}` }), 'a.pdf');
    await drawRed(page);
    await page.locator('#annotateBar').getByRole('button', { name: 'Metin', exact: true }).click();
    const box = (await page.locator('.page').first().boundingBox())!;
    await page.mouse.click(box.x + 100, box.y + 450);
    await page.keyboard.type('Not burada');
    await page.locator('#annotateBar').getByRole('button', { name: 'Bitti', exact: true }).click();
    const place = (selector: string) => page.locator(selector).first().evaluate(element => {
      const { x, y, width } = element.getBoundingClientRect();
      return [Math.round(x), Math.round(y), Math.round(width)];
    });
    const before = [await place('.inkEditor'), await place('.freeTextEditor')];
    await page.keyboard.press('Control+s');
    await lastSave(page);
    await expect(page.locator('.tab.is-modified')).toHaveCount(0);

    await page.locator('#pdfInput').setInputFiles({ name: 'b.pdf', mimeType: 'application/pdf', buffer: makePdf({ pages: 1, text: () => 'B1' }) });
    await expect(page.locator('.tab__title')).toHaveText(['a.pdf', 'b.pdf']);
    await expect(page.locator('.inkEditor')).toHaveCount(0);
    await page.locator('.tab__title', { hasText: 'a.pdf' }).click();
    await expect(page.locator('.inkEditor')).toHaveCount(1);
    await expect(page.locator('.freeTextEditor')).toContainText('Not burada');
    await expect(page.locator('.freeTextEditor')).toBeVisible();
    expect([await place('.inkEditor'), await place('.freeTextEditor')]).toEqual(before);
    await expect(page.locator('.tab.is-modified')).toHaveCount(0);

    // Saved again, the marks are there once each.
    await page.keyboard.press('Control+s');
    await expect.poll(() => saves(page).then(list => list.length)).toBe(2);
    const pdf = await getDocument({ data: new Uint8Array((await saves(page))[1].bytes), verbosity: 0 }).promise;
    const kinds = (await (await pdf.getPage(1)).getAnnotations()).map(annotation => annotation.subtype).sort();
    expect(kinds).toEqual(['FreeText', 'Ink']);
  });

  test('yazdırılan sayfada kalemin çizgisi vardır', async ({ page }) => {
    await page.evaluate(() => { window.print = () => {}; });
    await openPdf(page, makePdf({ pages: 1 }));
    await drawRed(page);
    await page.locator('#tool-print').click();
    await page.locator('#printRangeDialog').getByRole('button', { name: 'Yazdır' }).click();
    const image = page.locator('#printContainer .print-page img');
    await expect(image).toHaveCount(1);
    const redPixels = await image.evaluate(async (element: HTMLImageElement) => {
      await element.decode();
      const canvas = document.createElement('canvas');
      canvas.width = element.naturalWidth;
      canvas.height = element.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(element, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let count = 0;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index] > 180 && data[index + 1] < 90 && data[index + 2] < 90) count += 1;
      }
      return count;
    });
    expect(redPixels).toBeGreaterThan(500);
  });
});

test.describe('imza', () => {
  const bar = (page: Page) => page.locator('#annotateBar');
  const dialog = (page: Page) => page.locator('#signatureDialog');
  /** İşaretle, then the bar's İmza. */
  async function signFromBar(page: Page) {
    if (!await bar(page).isVisible()) await page.locator('#tool-annotate').click();
    await bar(page).getByRole('button', { name: 'İmza', exact: true }).click();
  }

  /** A wavy signature on the pad. */
  async function drawSignature(page: Page) {
    const pad = (await page.locator('#signatureCanvas').boundingBox())!;
    await page.mouse.move(pad.x + 40, pad.y + 140);
    await page.mouse.down();
    for (let step = 1; step <= 30; step += 1) await page.mouse.move(pad.x + 40 + step * 12, pad.y + 120 - Math.sin(step / 3) * 60);
    await page.mouse.up();
  }

  async function annotationsOf(bytes: number[]) {
    const pdf = await getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
    return (await pdf.getPage(1)).getAnnotations();
  }

  test('çizilen imza sayfaya konur, bu cihazda saklanır, PDF\'e imza olarak yazılır', async ({ page }) => {
    await openPdf(page, makePdf());
    await signFromBar(page);
    // No signature kept yet: the dialog comes at once.
    await expect(dialog(page)).toBeVisible();
    await expect(page.locator('#signatureAdd')).toBeDisabled();
    await drawSignature(page);
    await expect(page.locator('#signatureAdd')).toBeEnabled();
    await page.locator('#signatureName').fill('Ayşe Işık');
    await page.locator('#signatureAdd').click();
    await expect(dialog(page)).toBeHidden();
    await expect(bar(page).getByRole('button', { name: 'İmza', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const signature = page.locator('.signatureEditor');
    await expect(signature).toHaveCount(1);
    await expect(signature).toHaveAttribute('aria-description', /İmza: .*Ayşe Işık/);
    await expect(bar(page).locator('.annotate-bar__signature')).toHaveCount(1);
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('awpdf.imzalar') ?? '[]'));
    expect(kept).toHaveLength(1);
    expect(kept[0].description).toBe('Ayşe Işık');

    await page.keyboard.press('Control+s');
    const saved = await lastSave(page);
    expect(saved.name).toBe('deneme (işaretli).pdf');
    const stamps = (await annotationsOf(saved.bytes)).filter(annotation => annotation.subtype === 'Stamp');
    expect(stamps).toHaveLength(1);
  });

  test('saklanan imza yeniden kullanılır: düğmeyle ortaya, dokunuşla dokunulan yere; pencereden silinir', async ({ page }) => {
    await openPdf(page, makePdf());
    await signFromBar(page);
    await drawSignature(page);
    await page.locator('#signatureAdd').click();
    await expect(page.locator('.signatureEditor')).toHaveCount(1);

    await page.reload();
    await openPdf(page, makePdf());
    await signFromBar(page);
    await expect(dialog(page)).toBeHidden();
    const kept = bar(page).locator('.annotate-bar__signature');
    await expect(kept).toHaveCount(1);
    await expect(kept).toHaveAttribute('aria-pressed', 'true');
    await kept.click();
    await expect(page.locator('.signatureEditor')).toHaveCount(1);

    // The first tap unselects the signature just put; the next one signs where it is.
    const box = (await page.locator('.page').first().boundingBox())!;
    await page.mouse.click(box.x + 300, box.y + 700);
    await expect(page.locator('.signatureEditor')).toHaveCount(1);
    await page.mouse.click(box.x + 300, box.y + 700);
    await expect(page.locator('.signatureEditor')).toHaveCount(2);
    const placed = (await page.locator('.signatureEditor').nth(1).boundingBox())!;
    expect(Math.abs(placed.x + placed.width / 2 - (box.x + 300))).toBeLessThan(4);

    await bar(page).getByRole('button', { name: 'Yeni İmza' }).click();
    await expect(dialog(page)).toBeVisible();
    await expect(page.locator('#signatureSavedList li')).toHaveCount(1);
    await page.locator('#signatureSavedList').getByRole('button', { name: /imzasını sil/ }).click();
    await expect(page.locator('#signatureSaved')).toBeHidden();
    await expect(kept).toHaveCount(0);
    await dialog(page).getByRole('button', { name: 'Vazgeç' }).click();
    expect(await page.evaluate(() => localStorage.getItem('awpdf.imzalar'))).toBe('[]');
  });

  test('yazılan ad ve imza fotoğrafı da imza olur; saklanması istenmezse saklanmaz', async ({ page }) => {
    await openPdf(page, makePdf());
    await signFromBar(page);
    await page.locator('#signatureTabType').click();
    await expect(page.locator('#signatureText')).toBeFocused();
    await page.keyboard.type('Ömer Çelik');
    await expect(page.locator('#signatureTypePreview svg path')).toHaveCount(1);
    await page.locator('#signatureKeep').uncheck();
    await page.locator('#signatureAdd').click();
    await expect(page.locator('.signatureEditor')).toHaveCount(1);
    await expect(bar(page).locator('.annotate-bar__signature')).toHaveCount(0);

    // A dark scribble on white paper, as a phone photo would be.
    const photo = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 160;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#f4f4f0';
      context.fillRect(0, 0, 400, 160);
      context.strokeStyle = '#1a1a40';
      context.lineWidth = 6;
      context.beginPath();
      context.moveTo(30, 110);
      for (let x = 30; x <= 370; x += 10) context.lineTo(x, 80 - Math.sin(x / 25) * 40);
      context.stroke();
      return canvas.toDataURL('image/png').split(',')[1];
    }), 'base64');
    await bar(page).getByRole('button', { name: 'Yeni İmza' }).click();
    await page.locator('#signatureTabImage').click();
    await page.locator('#signatureImageInput').setInputFiles({ name: 'imza.png', mimeType: 'image/png', buffer: photo });
    await expect(page.locator('#signatureImagePreview svg path')).toHaveCount(1);
    await page.locator('#signatureAdd').click();
    await expect(page.locator('.signatureEditor')).toHaveCount(2);
    await expect(bar(page).locator('.annotate-bar__signature')).toHaveCount(1);
  });
});

test.describe('işaretleme (dokunmatik)', () => {
  test.use({ hasTouch: true });

  test('tek sayfa görünümünde parmakla çizmek sayfayı çevirmez, çizer', async ({ page }) => {
    await openPdf(page, makePdf());
    await page.locator('#tool-fitPage').click();
    await page.locator('#tool-singlePage').click();
    await page.locator('#tool-annotate').click();
    await page.waitForTimeout(300);
    const client = await page.context().newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 900, y: 400 }] });
    for (const x of [850, 800, 750, 700, 650, 600]) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: 400 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    await expect(status(page)).toHaveText('1 / 3');
    await page.locator('#annotateBar').getByRole('button', { name: 'Bitti', exact: true }).click();
    await expect(page.locator('.inkEditor')).toHaveCount(1);
  });
});

test.describe('PDF küçültme', () => {
  /** A tool's button, from the menu (☰) when the row is full. */
  async function runTool(page: Page, id: string) {
    if (await page.locator(`#toolbarMenu #tool-${id}`).count()) await page.locator('#toolbarMenuButton').click();
    await page.locator(`#tool-${id}`).click();
  }

  /** A two-page PDF with text, a large photo-like JPEG and a PNG, written by pdf-lib. */
  async function pdfWithPictures(page: Page) {
    const [jpeg, png] = await page.evaluate(() => {
      const picture = (width: number, height: number, type: string, quality?: number) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d')!;
        const gradient = context.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#3a6ea5');
        gradient.addColorStop(1, '#f2c14e');
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);
        // Fine detail, as in a photo, so the file is large.
        for (let index = 0; index < 40000; index += 1) {
          context.fillStyle = `hsl(${index % 360} 60% ${30 + (index * 7) % 50}%)`;
          context.fillRect((index * 7919) % width, (index * 104729) % height, 6, 6);
        }
        return canvas.toDataURL(type, quality).split(',')[1];
      };
      return [picture(3000, 2000, 'image/jpeg', 0.95), picture(1200, 900, 'image/png')];
    });
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    const photo = await document.embedJpg(Buffer.from(jpeg, 'base64'));
    const drawing = await document.embedPng(Buffer.from(png, 'base64'));
    for (const [index, image] of [photo, drawing].entries()) {
      const pdfPage = document.addPage([595, 842]);
      pdfPage.drawText(`Kucult ${index + 1}`, { x: 50, y: 790, size: 24, font });
      pdfPage.drawImage(image, { x: 50, y: 300, width: 495, height: 330 });
    }
    return Buffer.from(await document.save());
  }

  test('görseller küçülür, yazı yazı olarak kalır; küçük kopya yeni dosyaya kaydedilir', async ({ page }) => {
    const original = await pdfWithPictures(page);
    await openPdf(page, original);
    await runTool(page, 'compress');
    await expect(page.locator('#compressDialog')).toBeVisible();
    await page.locator('#compressDialog').getByRole('button', { name: 'Küçült' }).click();
    const result = page.locator('#compressResultDialog');
    await expect(result).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#compressResultMessage')).toContainText('küçüldü');
    await result.getByRole('button', { name: 'Kaydet' }).click();
    const saved = await lastSave(page);
    expect(saved.name).toBe('deneme (küçültülmüş).pdf');
    expect(saved.bytes.length).toBeLessThan(original.length / 2);
    expect(await pagesOf(saved.bytes)).toEqual(['Kucult 1@0', 'Kucult 2@0']);
    // A new file: opened, it is not taken for the original.
    const [before, after] = await Promise.all([original, Buffer.from(saved.bytes)].map(bytes => getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise));
    expect(after.fingerprints[0]).not.toBe(before.fingerprints[0]);
    // The photo is scaled to the medium level's 1754 px; the PNG keeps its size under its soft mask.
    const { PDFDocument, PDFName, PDFRawStream, PDFNumber } = await import('pdf-lib');
    const smaller = await PDFDocument.load(new Uint8Array(saved.bytes));
    const widths = smaller.context.enumerateIndirectObjects()
      .flatMap(([, object]) => object instanceof PDFRawStream && object.dict.lookup(PDFName.of('Subtype')) === PDFName.of('Image')
        && String(object.dict.lookup(PDFName.of('Filter'))) === '/DCTDecode'
        ? [(object.dict.lookup(PDFName.of('Width')) as InstanceType<typeof PDFNumber>).asNumber()] : [])
      .sort((a, b) => a - b);
    expect(widths).toEqual([1200, 1754]);
  });

  test('küçülmeyen belge için söylenir; parolalı belgenin küçük kopyası parolasız açılır', async ({ page }) => {
    // Already written tightly (object streams) and without pictures: nothing to gain.
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const tight = await PDFDocument.create();
    const font = await tight.embedFont(StandardFonts.Helvetica);
    tight.addPage([595, 842]).drawText('Sade metin', { x: 50, y: 790, size: 24, font });
    await openPdf(page, Buffer.from(await tight.save({ useObjectStreams: true })));
    await runTool(page, 'compress');
    await page.locator('#compressDialog').getByRole('button', { name: 'Küçült' }).click();
    await expect(page.locator('#toast')).toHaveText('Bu belgede küçültülecek görsel yok; dosya daha küçük olmuyor.');
    await expect(page.locator('#compressResultDialog')).toBeHidden();

    await page.locator('#pdfInput').setInputFiles({ name: 'gizli.pdf', mimeType: 'application/pdf', buffer: makePdf({ pages: 2, padding: 20000, password: 'p' }) });
    await page.locator('#passwordInput').fill('p');
    await page.locator('#passwordDialog').getByRole('button', { name: 'Aç' }).click();
    await expect(page.locator('.tab.is-active .tab__title')).toHaveText('gizli.pdf');
    await runTool(page, 'compress');
    await page.locator('#compressDialog').getByRole('button', { name: 'Küçült' }).click();
    await page.locator('#compressResultDialog').getByRole('button', { name: 'Kaydet' }).click();
    const saved = await lastSave(page);
    expect(saved.name).toBe('gizli (küçültülmüş).pdf');
    // pdf-lib cannot write a password: the copy opens without one, with both pages.
    expect(await pagesOf(saved.bytes)).toEqual(['awPDF sayfa 1@0', 'awPDF sayfa 2@0']);
  });
});

test.describe('parola', () => {
  async function runTool(page: Page, id: string) {
    if (await page.locator(`#toolbarMenu #tool-${id}`).count()) await page.locator('#toolbarMenuButton').click();
    await page.locator(`#tool-${id}`).click();
  }
  const dialog = (page: Page) => page.locator('#protectDialog');

  test('parola iki kez yazılır, kaydedilen kopya yalnız parolayla açılır', async ({ page }) => {
    await openPdf(page, makePdf({ pages: 2, text }));
    await runTool(page, 'protect');
    await expect(dialog(page)).toBeVisible();
    await expect(page.locator('#protectTitle')).toHaveText('Parola koy');
    await expect(page.locator('#protectChoices')).toBeHidden();
    await expect(page.locator('#protectPassword')).toBeFocused();
    const save = dialog(page).getByRole('button', { name: 'Kaydet' });
    await save.click();
    await expect(page.locator('#protectError')).toHaveText('Bir parola yazın.');
    await page.locator('#protectPassword').fill('abc');
    await save.click();
    await expect(page.locator('#protectError')).toHaveText('Parola en az 4 karakter olmalı.');
    await page.locator('#protectPassword').fill('Işık-2026');
    await page.locator('#protectRepeat').fill('Isik-2026');
    await save.click();
    await expect(page.locator('#protectError')).toHaveText('İki parola aynı değil.');
    await page.locator('#protectShow').check();
    await expect(page.locator('#protectPassword')).toHaveAttribute('type', 'text');
    await page.locator('#protectRepeat').fill('Işık-2026');
    await save.click();
    const saved = await lastSave(page);
    expect(saved.name).toBe('deneme (parolalı).pdf');
    await expect(getDocument({ data: new Uint8Array(saved.bytes), verbosity: 0 }).promise).rejects.toThrow(/password/i);
    const pdf = await getDocument({ data: new Uint8Array(saved.bytes), password: 'Işık-2026', verbosity: 0 }).promise;
    expect(pdf.numPages).toBe(2);
    expect((await (await pdf.getPage(2)).getTextContent()).items.map(item => ('str' in item ? item.str : '')).join('')).toBe('S2');
  });

  test('parolalı belgenin parolası kaldırılır ya da değiştirilir; içindekiler korunur', async ({ page }) => {
    const outline = [{ title: 'Giris', page: 0 }, { title: 'Sonuç', page: 1 }];
    await page.locator('#pdfInput').setInputFiles({ name: 'gizli.pdf', mimeType: 'application/pdf', buffer: makePdf({ pages: 2, text, outline, password: 'eski' }) });
    await page.locator('#passwordInput').fill('eski');
    await page.locator('#passwordDialog').getByRole('button', { name: 'Aç' }).click();
    await expect(status(page)).toHaveText('1 / 2');
    await runTool(page, 'protect');
    await expect(page.locator('#protectTitle')).toHaveText('Parolayı değiştir');
    await expect(page.locator('#protectChoices')).toBeVisible();
    await dialog(page).getByLabel('Parolasız kaydet').check();
    await expect(page.locator('#protectFields')).toBeHidden();
    await dialog(page).getByRole('button', { name: 'Kaydet' }).click();
    const plain = await lastSave(page);
    expect(plain.name).toBe('gizli (parolasız).pdf');
    expect(await pagesOf(plain.bytes)).toEqual(['S1@0', 'S2@0']);
    const opened = await getDocument({ data: new Uint8Array(plain.bytes), verbosity: 0 }).promise;
    expect((await opened.getOutline())?.map(item => item.title)).toEqual(['Giris', 'Sonuç']);

    await runTool(page, 'protect');
    await expect(page.locator('#protectFields')).toBeVisible();
    await page.locator('#protectPassword').fill('yeni-parola');
    await page.locator('#protectRepeat').fill('yeni-parola');
    await dialog(page).getByRole('button', { name: 'Kaydet' }).click();
    await expect.poll(() => saves(page).then(list => list.length)).toBe(2);
    const changed = (await saves(page))[1];
    expect(changed.name).toBe('gizli (parolalı).pdf');
    await expect(getDocument({ data: new Uint8Array(changed.bytes), password: 'eski', verbosity: 0 }).promise).rejects.toThrow(/password/i);
    const pdf = await getDocument({ data: new Uint8Array(changed.bytes), password: 'yeni-parola', verbosity: 0 }).promise;
    expect(pdf.numPages).toBe(2);
  });
});

test.describe('PDF → Word', () => {
  async function runTool(page: Page, id: string) {
    if (await page.locator(`#toolbarMenu #tool-${id}`).count()) await page.locator('#toolbarMenuButton').click();
    await page.locator(`#tool-${id}`).click();
  }

  /** Page 1: a bold centred title, a paragraph, a power and a picture; page 2: two columns. */
  async function sourcePdf(page: Page) {
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 150;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#2563eb';
      context.fillRect(0, 0, 300, 150);
      context.fillStyle = '#fbbf24';
      context.beginPath();
      context.arc(150, 75, 50, 0, Math.PI * 2);
      context.fill();
      return canvas.toDataURL('image/png').split(',')[1];
    });
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const document = await PDFDocument.create();
    const regular = await document.embedFont(StandardFonts.TimesRoman);
    const bold = await document.embedFont(StandardFonts.TimesRomanBold);
    const first = document.addPage([595, 842]);
    const title = 'ODEV KAGIDI';
    first.drawText(title, { x: (595 - bold.widthOfTextAtSize(title, 16)) / 2, y: 780, size: 16, font: bold });
    const lines = [
      'Bu birinci paragrafin ilk satiri biraz girintili yazilmistir ve sagdaki kenara kadar uzanir.',
      'Ikinci satir soldaki kenardan baslar ve yine sagdaki kenara kadar uzanip paragraf surer.',
      'Son satir kisa kalir.',
    ];
    lines.forEach((text, index) => first.drawText(text, { x: index === 0 ? 92 : 72, y: 740 - index * 15, size: 12, font: regular }));
    first.drawText('Alan: x', { x: 72, y: 680, size: 12, font: regular });
    first.drawText('2', { x: 72 + regular.widthOfTextAtSize('Alan: x', 12), y: 685, size: 8, font: regular });
    first.drawImage(await document.embedPng(Buffer.from(png, 'base64')), { x: 72, y: 450, width: 200, height: 100 });
    const second = document.addPage([595, 842]);
    for (let row = 0; row < 10; row += 1) {
      second.drawText(`Sol sutun satir ${row + 1}`, { x: 72, y: 760 - row * 15, size: 12, font: regular });
      second.drawText(`Sag sutun satir ${row + 1}`, { x: 320, y: 760 - row * 15, size: 12, font: regular });
    }
    return Buffer.from(await document.save());
  }

  test('yazı yazı olur (kalın, üs, paragraf), resim resim; iki sütunlu sayfa iki sütun', async ({ page }) => {
    await openPdf(page, await sourcePdf(page), 'odev.pdf');
    await runTool(page, 'pdfToWord');
    const saved = await lastSave(page);
    expect(saved.name).toBe('odev.docx');
    const JSZip = (await import('jszip')).default;
    const archive = await JSZip.loadAsync(Buffer.from(saved.bytes));
    const xml = await archive.file('word/document.xml')!.async('string');
    const text = xml.replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, '');
    expect(text).toContain('ODEV KAGIDI');
    expect(text).toContain('Bu birinci paragrafin ilk satiri biraz girintili yazilmistir ve sagdaki kenara kadar uzanir. Ikinci satir');
    expect(text).toContain('Sol sutun satir 10');
    // The title is bold and centred, the power raised, the picture a picture.
    expect(xml).toMatch(/<w:jc w:val="center"\/>.*?<w:b\/>.*?ODEV KAGIDI/s);
    expect(xml).toMatch(/<w:vertAlign w:val="superscript"\/>.*?>2</s);
    expect(xml).toContain('<w:drawing>');
    // A picture from the page's image is a photo: JPEG.
    expect(Object.keys(archive.files).filter(name => /^word\/media\/.+\.(png|jpe?g)$/.test(name))).toHaveLength(1);
    expect(xml).toMatch(/<w:cols[^>]*w:num="2"/);
    // A4 pages, one section per page at least.
    expect(xml).toMatch(/<w:pgSz w:w="11900" w:h="16840"/);
  });
});

test.describe('yazı tanıma (OCR)', () => {
  async function runTool(page: Page, id: string) {
    if (await page.locator(`#toolbarMenu #tool-${id}`).count()) await page.locator('#toolbarMenuButton').click();
    await page.locator(`#tool-${id}`).click();
  }

  /** A "scan": Turkish text drawn on a picture, the picture alone on an A4 page. */
  async function scannedPdf(page: Page) {
    const jpeg = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 2480;
      canvas.height = 3508;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#111111';
      context.font = '64px serif';
      const lines = ['Işık ve gölge çalışması', 'Öğrenciler ödevlerini şimdi teslim etsin.', 'Ağaçların yaprakları düştü.'];
      lines.forEach((line, index) => context.fillText(line, 240, 400 + index * 120));
      return canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
    });
    const { PDFDocument } = await import('pdf-lib');
    const document = await PDFDocument.create();
    const image = await document.embedJpg(Buffer.from(jpeg, 'base64'));
    document.addPage([595, 842]).drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
    return Buffer.from(await document.save());
  }

  test('taranmış sayfanın Türkçe yazısı tanınır; kopya aranabilir olarak kaydedilip açılır', async ({ page }) => {
    test.setTimeout(120000);
    await openPdf(page, await scannedPdf(page), 'tarama.pdf');
    await runTool(page, 'ocr');
    await expect(page.locator('#workDialog')).toBeVisible();
    // Recognition takes some seconds a page.
    await expect.poll(() => saves(page).then(list => list.length), { timeout: 90000 }).toBe(1);
    const saved = await lastSave(page);
    expect(saved.name).toBe('tarama (metinli).pdf');
    const pdf = await getDocument({ data: new Uint8Array(saved.bytes), verbosity: 0 }).promise;
    const text = (await (await pdf.getPage(1)).getTextContent()).items.map(item => ('str' in item ? item.str : '')).join(' ');
    for (const word of ['Işık', 'gölge', 'çalışması', 'Öğrenciler', 'şimdi', 'Ağaçların']) expect(text).toContain(word);
    // The copy is open, ready to be searched; the original stays open as it was.
    await expect(page.locator('.tab.is-active .tab__title')).toHaveText('tarama (metinli).pdf');
    await expect(page.locator('.page[data-page-number="1"] .textLayer')).toContainText('Öğrenciler');
  });

  test('yazısı olan belgede tanınacak sayfa yok denir', async ({ page }) => {
    await openPdf(page, makePdf({ pages: 2 }));
    await runTool(page, 'ocr');
    await expect(page.locator('#toast')).toHaveText('Bu belgenin sayfalarında yazı zaten var; tanınacak taranmış sayfa yok.');
    expect(await saves(page)).toHaveLength(0);
  });
});
