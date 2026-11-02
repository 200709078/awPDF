import { expect, test, type Page } from '@playwright/test';
import { makePdf } from './helpers/make-pdf.mjs';

const PHONE = { width: 360, height: 640 };
const WIDE = { width: 1440, height: 900 };

async function openPdf(page: Page) {
  await page.locator('#pdfInput').setInputFiles({ name: 'deneme.pdf', mimeType: 'application/pdf', buffer: makePdf() });
  await expect(page.locator('#pageStatus')).toHaveText('1 / 3');
}

const toolbar = (page: Page) => page.locator('#toolbar');
const menu = (page: Page) => page.locator('#toolbarMenu');
const toggle = (page: Page) => page.locator('#toolbarMenuButton');

async function expectOneLine(page: Page) {
  const { scrollWidth, clientWidth, top, bottom } = await toolbar(page).evaluate(element => {
    const row = element.getBoundingClientRect();
    return { scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, top: row.top, bottom: row.bottom };
  });
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  for (const box of await toolbar(page).locator(':scope > :visible').evaluateAll(items => items.filter(item => item.id !== 'toolbarMenu').map(item => item.getBoundingClientRect().toJSON()))) {
    expect(box.top).toBeGreaterThanOrEqual(top);
    expect(box.bottom).toBeLessThanOrEqual(bottom);
    expect(box.right).toBeLessThanOrEqual(clientWidth);
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('geniş ekranda bütün düğmeler sırada, menü düğmesi görünmez', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await openPdf(page);
  await expect(toggle(page)).toBeHidden();
  await expect(toolbar(page).locator(':scope > .toolbar__button:visible')).toHaveCount(16);
  await expect(page.locator('.toolbar__label:visible')).toHaveCount(0);
  await expectOneLine(page);
});

test('dar ekranda satır kaymaz, sığmayanlar menüde simge ve adıyla durur', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await openPdf(page);
  await expectOneLine(page);
  await expect(page.locator('#pageStatus')).toBeVisible();
  // The order stays: the first tools on the row, the rest in the menu.
  await expect(toolbar(page).locator(':scope > .toolbar__button:visible').first()).toHaveId('tool-open');
  await expect(page.locator('#toolbar > #tool-previousPage')).toBeVisible();
  await expect(page.locator('#toolbar > #tool-nextPage')).toBeVisible();
  await expect(menu(page).locator('#tool-search')).toHaveCount(1);

  await expect(menu(page)).toBeHidden();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await toggle(page).click();
  await expect(menu(page)).toBeVisible();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  const zoomIn = menu(page).locator('#tool-zoomIn');
  await expect(zoomIn.locator('svg')).toBeVisible();
  await expect(zoomIn).toContainText('Yakınlaştır');
  const box = (await menu(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width);
  expect(box.y + box.height).toBeLessThanOrEqual(PHONE.height);
});

test('menüdeki araç çalışır ve menü kapanır; durumlar menüde de görünür', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await openPdf(page);
  await toggle(page).click();
  await expect(menu(page).locator('#tool-singlePage')).toHaveAttribute('aria-pressed', 'false');
  await menu(page).locator('#tool-singlePage').click();
  await expect(menu(page)).toBeHidden();
  await toggle(page).click();
  await expect(menu(page).locator('#tool-singlePage')).toHaveAttribute('aria-pressed', 'true');
  await expect(menu(page).locator('#tool-twoPages')).toBeEnabled();
});

test('menü dışına dokununca ve Esc ile kapanır, açık kalmaz', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await openPdf(page);
  await toggle(page).click();
  await page.locator('#viewerContainer').click({ position: { x: 20, y: 400 } });
  await expect(menu(page)).toBeHidden();
  await toggle(page).click();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden();
  await expect(toggle(page)).toBeFocused();
  await toggle(page).click();
  await toggle(page).click();
  await expect(menu(page)).toBeHidden();
});

test('ekran genişleyince düğmeler sıraya döner, daralınca yine menüye geçer', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await openPdf(page);
  await page.setViewportSize(PHONE);
  await expect(toggle(page)).toBeVisible();
  await expect(menu(page).locator('#tool-print')).toHaveCount(1);
  await page.setViewportSize(WIDE);
  await expect(toggle(page)).toBeHidden();
  await expect(page.locator('#toolbar > #tool-print')).toBeVisible();
  await expectOneLine(page);
});

test('sayfa bilgisi uzayınca satır yine taşmaz', async ({ page }) => {
  await page.setViewportSize({ width: 372, height: 640 });
  await openPdf(page);
  await toggle(page).click();
  await menu(page).locator('#tool-twoPages').click();
  await expect(page.locator('#pageStatus')).toHaveText('1-2 / 3');
  await expectOneLine(page);
});

test('PDF açılmadan önce de satır taşmaz', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await expectOneLine(page);
  await expect(toggle(page)).toBeVisible();
});
