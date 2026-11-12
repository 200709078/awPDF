import { expect, test, type Page } from '@playwright/test';
import { pretendAndroid } from './helpers/android-bridge';
import { makePdf } from './helpers/make-pdf.mjs';

const send = (page: Page, event: string, data: unknown = {}) => page.evaluate(
  ([name, payload]) => (window as unknown as { sendNative(event: string, data: unknown): void }).sendNative(name as string, payload),
  [event, data],
);
const calls = (page: Page) => page.evaluate(() => (window as unknown as { androidCalls: string[] }).androidCalls);

async function start(page: Page) {
  const pdf = makePdf();
  await pretendAndroid(page, { 1: [...pdf] });
  await page.goto('/');
  await expect(page.locator('#emptyOpen')).toBeVisible();
  return pdf;
}

test('başka uygulamadan gelen PDF parça parça okunarak açılır', async ({ page }) => {
  const pdf = await start(page);
  await send(page, 'fileOpened', { id: 1, name: 'gelen.pdf', size: pdf.length });
  await expect(page.locator('#pageStatus')).toHaveText('1 / 3');
  await expect(page).toHaveTitle(/^gelen\.pdf/);
  expect(await calls(page)).toContain('readFile');
});

test('açılamayan dosya uyarı verir, uygulama çalışmaya devam eder', async ({ page }) => {
  await start(page);
  await send(page, 'fileOpened', { id: 2, name: 'bozuk.pdf', size: 0 });
  await expect(page.locator('#toast')).toHaveText('Bu PDF açılamadı.');
  await expect(page.locator('#emptyOpen')).toBeVisible();
});

test('dosya seçici Android\'inkidir, seçilen dosya son dosyalardan yeniden açılır', async ({ page }) => {
  const pdf = await start(page);
  await page.locator('#emptyOpen').click();
  expect(await calls(page)).toContain('pickFile');
  await send(page, 'fileOpened', { id: 1, name: 'gelen.pdf', size: pdf.length, source: 'content://belge/1' });
  await expect(page.locator('#pageStatus')).toHaveText('1 / 3');
  await page.reload();
  await page.locator('#recentFiles .recent-file').click();
  await expect(page.locator('#pageStatus')).toHaveText('1 / 3');
  expect(await calls(page)).toContain('reopenFile');
});

test('tek belge vardır: yenisi öncekinin yerine geçer, sekme çıkmaz', async ({ page }) => {
  const first = makePdf();
  const second = makePdf({ pages: 2 });
  await pretendAndroid(page, { 1: [...first], 2: [...second] });
  await page.goto('/');
  await send(page, 'fileOpened', { id: 1, name: 'bir.pdf', size: first.length });
  await expect(page.locator('#pageStatus')).toHaveText('1 / 3');
  await send(page, 'fileOpened', { id: 2, name: 'iki.pdf', size: second.length });
  await expect(page.locator('#pageStatus')).toHaveText('1 / 2');
  await expect(page.locator('#tabBar')).toBeHidden();
});

test('sistem çubukları araç çubuğunun rengini alır, koyu temada simgeleri açık olur', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await start(page);
  const lastBars = () => page.evaluate(() => (window as unknown as { androidCallOptions: { method: string; options: unknown }[] })
    .androidCallOptions.filter(call => call.method === 'setSystemBars').at(-1)?.options);
  await expect.poll(lastBars).toEqual({ color: '#ffffff', dark: false });
  await page.locator('#toolbarMenuButton').click();
  await page.locator('#tool-theme').click();
  await expect.poll(lastBars).toEqual({ color: '#1f2937', dark: true });
});

test.describe('geri düğmesi', () => {
  test('sunumdan çıkar', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    const pdf = await start(page);
    await send(page, 'fileOpened', { id: 1, name: 'gelen.pdf', size: pdf.length });
    await expect(page.locator('#pageStatus')).toHaveText('1 / 3');
    await page.locator('#toolbarMenuButton').click();
    await page.locator('#tool-presentation').click();
    await expect(page.locator('body')).toHaveClass(/is-presenting/);
    await send(page, 'backButton');
    await expect(page.locator('body')).not.toHaveClass(/is-presenting/);
    expect(await calls(page)).not.toContain('leaveApp');
  });

  test('açık olanı üstten alta kapatır, sonra belgeyi; ilk ekrandan uygulamadan çıkar', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    const pdf = await start(page);
    await send(page, 'fileOpened', { id: 1, name: 'gelen.pdf', size: pdf.length });
    await expect(page.locator('#pageStatus')).toHaveText('1 / 3');

    await page.locator('#pageStatus').click();
    await expect(page.locator('#goToPageDialog')).toBeVisible();
    await page.locator('#toolbarMenuButton').evaluate((button: HTMLElement) => button.click());
    await send(page, 'backButton');
    await expect(page.locator('#goToPageDialog')).toBeHidden();
    await expect(page.locator('#pageStatus')).toHaveText('1 / 3');

    await send(page, 'backButton');
    await expect(page.locator('#toolbarMenu')).toBeHidden();
    await expect(page.locator('#toolbarMenuButton')).toHaveAttribute('aria-label', 'Diğer Araçlar');

    await page.locator('#tool-sidePanel').click();
    await page.locator('#toolbarMenuButton').click();
    await page.locator('#tool-search').click();
    await expect(page.locator('#searchBar')).toBeVisible();
    await send(page, 'backButton');
    await expect(page.locator('#searchBar')).toBeHidden();
    await expect(page.locator('#sidePanel')).toBeVisible();

    await send(page, 'backButton');
    await expect(page.locator('#sidePanel')).toBeHidden();

    await page.locator('#toolbarMenuButton').click();
    await page.locator('#tool-fullscreen').click();
    await expect.poll(() => calls(page)).toContain('setFullscreen');
    await send(page, 'backButton');
    await page.locator('#toolbarMenuButton').click();
    await expect(page.locator('#tool-fullscreen')).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Escape');
    expect(await calls(page)).not.toContain('leaveApp');

    await send(page, 'backButton');
    await expect(page.locator('#emptyOpen')).toBeVisible();
    await expect(page.locator('#viewerContainer')).toBeHidden();
    expect(await calls(page)).not.toContain('leaveApp');

    await send(page, 'backButton');
    await expect.poll(() => calls(page)).toContain('leaveApp');
    await expect(page.locator('#emptyOpen')).toBeVisible();
  });
});

test('Belgeyi Kapat ilk ekrana döndürür; belge son dosyalarda kalır', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const pdf = await start(page);
  await send(page, 'fileOpened', { id: 1, name: 'gelen.pdf', size: pdf.length, source: 'content://belge/1' });
  await expect(page.locator('#pageStatus')).toHaveText('1 / 3');
  await page.locator('#toolbarMenuButton').click();
  await page.locator('#tool-closeTab').click();
  await expect(page.locator('#emptyOpen')).toBeVisible();
  await expect(page.locator('#recentFiles .recent-file')).toHaveCount(1);
  await expect(page).toHaveTitle('awPDF | mADEMatik');
});

test.describe('kaydetme ve düzenleme', () => {
  const callOptions = (page: Page) => page.evaluate(() => (window as unknown as { androidCallOptions: { method: string; options: Record<string, unknown> }[] }).androidCallOptions);

  test('Farklı Kaydet dosyayı parça parça yerel tarafa verir, sistemin kaydet ekranını açar', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    const pdf = await start(page);
    await send(page, 'fileOpened', { id: 1, name: 'gelen.pdf', size: pdf.length });
    await expect(page.locator('#pageStatus')).toHaveText('1 / 3');
    await page.locator('#toolbarMenuButton').click();
    await page.locator('#tool-saveAs').click();
    await expect(page.locator('#toast')).toHaveText('Kaydedildi: gelen (kopya).pdf');
    const options = await callOptions(page);
    const pieces = options.filter(call => call.method === 'appendShareFile');
    expect(pieces[0].options).toMatchObject({ name: 'gelen (kopya).pdf', first: true });
    expect(options.at(-1)).toEqual({ method: 'saveFile', options: { name: 'gelen (kopya).pdf', type: 'application/pdf' } });
  });

  test('geri düğmesi değişmiş sayfa düzenleyicisinden çıkmadan önce sorar', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    const pdf = await start(page);
    await send(page, 'fileOpened', { id: 1, name: 'gelen.pdf', size: pdf.length });
    await expect(page.locator('#pageStatus')).toHaveText('1 / 3');
    await page.locator('#toolbarMenuButton').click();
    await page.locator('#tool-editPages').click();
    await page.locator('#pageEditorGrid .page-card').first().click();
    await page.locator('#pageEditor-delete').click();
    await send(page, 'backButton');
    await expect(page.locator('#leaveEditorDialog')).toBeVisible();
    await send(page, 'backButton');
    await expect(page.locator('#leaveEditorDialog')).toBeHidden();
    await expect(page.locator('#pageEditor')).toBeVisible();
    await page.locator('#pageEditorClose').click();
    await page.locator('#leaveEditorDialog').getByRole('button', { name: 'Çık' }).click();
    await expect(page.locator('#pageEditor')).toBeHidden();
    await send(page, 'backButton');
    await expect(page.locator('#emptyOpen')).toBeVisible();
    expect(await calls(page)).not.toContain('leaveApp');
  });

  test('bölge görseli Android\'de PNG olarak paylaşılır; geri düğmesi bölge almayı bırakır', async ({ page }) => {
    const pdf = await start(page);
    await send(page, 'fileOpened', { id: 1, name: 'gelen.pdf', size: pdf.length });
    await expect(page.locator('#pageStatus')).toHaveText('1 / 3');
    await page.locator('#toolbarMenuButton').or(page.locator('#tool-captureRegion')).first().click();
    if (await page.locator('#toolbarMenu').isVisible()) await page.locator('#tool-captureRegion').click();
    const box = (await page.locator('.page[data-page-number="1"] .canvasWrapper').boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 80, { steps: 3 });
    await page.mouse.up();
    await page.locator('#regionShare').click();
    await expect.poll(async () => (await callOptions(page)).at(-1)).toEqual({ method: 'shareFile', options: { name: 'gelen - sayfa 1 bölge.png', type: 'image/png' } });
    await page.locator('#regionClose').click();
    await send(page, 'backButton');
    await expect(page.locator('.region-overlay')).toHaveCount(0);
    await expect(page.locator('#viewerContainer')).toBeVisible();
  });
});

test('yazdırılan sayfalar afterprint\'ten sonra da kalır, sonraki yazdırmada yenilenir', async ({ page }) => {
  // Android'in yazdırma servisi önizlemeden sonra sayfayı yazıcı için yeniden okur; WebView her
  // geçişte afterprint gönderir. Sayfalar o an silinince kâğıt boş çıkıyordu (2026-11-12, telefonda).
  const pdf = await start(page);
  await send(page, 'fileOpened', { id: 1, name: 'gelen.pdf', size: pdf.length });
  await expect(page.locator('#pageStatus')).toHaveText('1 / 3');
  const print = async () => {
    await page.keyboard.press('Control+p');
    await expect(page.locator('#printRangeDialog')).toBeVisible();
    await page.keyboard.press('Enter');
  };
  await print();
  await expect.poll(async () => (await calls(page)).filter(call => call === 'print').length).toBe(1);
  await expect(page.locator('#printContainer img')).toHaveCount(3);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('#printContainer img')).toHaveCount(3);
  await print();
  await expect.poll(async () => (await calls(page)).filter(call => call === 'print').length).toBe(2);
  await expect(page.locator('#printContainer img')).toHaveCount(3);
});
