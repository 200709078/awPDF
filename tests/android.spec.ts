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

test.describe('geri düğmesi', () => {
  test('açık olanı üstten alta kapatır, en son uygulamadan çıkar', async ({ page }) => {
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
    await expect.poll(() => calls(page)).toContain('leaveApp');
    await expect(page.locator('#viewerContainer')).toBeVisible();
  });
});
