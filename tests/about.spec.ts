import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

for (const [width, height] of [[1920, 1080], [400, 800]] as const) {
  test(`${width}×${height}: Hakkında ☰ menüsünün en sonunda; küçük pencerede açılır, kapanır`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const toggle = page.locator('#toolbarMenuButton');
    // Geniş ekranda da ☰ görünür: Hakkında hep menüde.
    await expect(toggle).toBeVisible();
    await toggle.click();
    const last = page.locator('#toolbarMenu > button').last();
    await expect(last).toHaveId('tool-about');
    await last.click();
    const dialog = page.locator('#aboutDialog');
    await expect(dialog).toBeVisible();
    await expect(page.locator('#toolbarMenu')).toBeHidden();
    await expect(page.locator('#aboutVersion')).toHaveText(`sürüm ${version}`);
    await expect(dialog.getByRole('link', { name: /Linux/ })).toHaveAttribute('href', 'https://madematik.com/projelerim/awpdf#indirmeler');
    await expect(dialog).toContainText('İletişim');
    await dialog.getByRole('button', { name: 'Kapat' }).click();
    await expect(dialog).toBeHidden();
    await toggle.click();
    await page.locator('#tool-about').click();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
}
