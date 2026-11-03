import { mkdirSync, readFileSync } from 'node:fs'
import { test, type Browser, type Page } from '@playwright/test'
import { pretendAndroid } from '../../tests/helpers/android-bridge'
import { sampleHtml } from './ornek-belge'

// Google Play ekran görüntüleri: `npx playwright test -c scripts/play` → docs/play/ekran/.
// Uygulama Android kipinde (tek belge) açılır, örnek belge kendi çalışma kâğıdımızdır.
const out = 'docs/play/ekran'
mkdirSync(out, { recursive: true })

let pdf: Buffer

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage()
  await page.setContent(sampleHtml)
  pdf = await page.pdf({ preferCSSPageSize: true, outline: true, tagged: true, printBackground: true })
  await page.close()
})

// Telefon 1080×2160 (1:2, Play'in sınırı), 7 inç tablet 1200×1920, 10 inç tablet 2560×1600.
const devices = {
  telefon: { viewport: { width: 360, height: 720 }, deviceScaleFactor: 3 },
  tablet7: { viewport: { width: 600, height: 960 }, deviceScaleFactor: 2 },
  tablet10: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 },
}

async function openApp(browser: Browser, device: keyof typeof devices, dark = false): Promise<Page> {
  const context = await browser.newContext({
    ...devices[device], isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light',
  })
  const page = await context.newPage()
  // Android'de dosya, sistemin seçicisinden ya da "Birlikte aç"tan fileOpened olayıyla gelir.
  await pretendAndroid(page, { 1: [...pdf] })
  await page.goto('/')
  await page.evaluate(size => (window as unknown as { sendNative(event: string, data: unknown): void })
    .sendNative('fileOpened', { id: 1, name: 'Fonksiyonlar ve Grafikleri.pdf', size }), pdf.length)
  await page.locator('.page[data-loaded="true"]').first().waitFor()
  return page
}

// Düğme satıra sığmayıp menüye taşınmış olabilir; görünürlüğüne bakmadan tıklanır.
const runTool = (page: Page, id: string) => page.locator(`#tool-${id}`).evaluate(button => (button as HTMLButtonElement).click())

// Yakınlaştırma, panel kayması ve görünen sayfaların çizimi bitsin.
const settle = (page: Page) => page.waitForTimeout(1200)

async function search(page: Page, text: string) {
  await runTool(page, 'search')
  await page.locator('#searchInput').fill(text)
  await page.locator('.highlight').first().waitFor()
  await page.locator('#searchInput').blur()
}

for (const device of ['telefon', 'tablet7'] as const) {
  test(`${device}: belge`, async ({ browser }) => {
    const page = await openApp(browser, device)
    await settle(page)
    await page.screenshot({ path: `${out}/${device}-1-belge.png` })
  })

  test(`${device}: sayfa paneli`, async ({ browser }) => {
    const page = await openApp(browser, device)
    await runTool(page, 'sidePanel')
    await page.locator('#thumbnailList canvas, #thumbnailList img').nth(1).waitFor()
    await settle(page)
    await page.screenshot({ path: `${out}/${device}-2-sayfalar.png` })
  })

  test(`${device}: arama`, async ({ browser }) => {
    const page = await openApp(browser, device)
    await search(page, 'grafik')
    await settle(page)
    await page.screenshot({ path: `${out}/${device}-3-arama.png` })
  })

  test(`${device}: koyu tema`, async ({ browser }) => {
    const page = await openApp(browser, device, true)
    await page.locator('#viewerContainer').evaluate(container => { container.scrollTop = container.scrollHeight / 3 })
    await settle(page)
    await page.screenshot({ path: `${out}/${device}-4-koyu.png` })
  })
}

test('tablet10: iki sayfa ve içindekiler', async ({ browser }) => {
  const page = await openApp(browser, 'tablet10')
  await runTool(page, 'twoPages')
  await runTool(page, 'fitPage')
  await runTool(page, 'sidePanel')
  await page.locator('#sidePanelOutlineTab').click()
  await settle(page)
  await page.screenshot({ path: `${out}/tablet10-1-iki-sayfa.png` })
})

test('tablet10: arama', async ({ browser }) => {
  const page = await openApp(browser, 'tablet10')
  await runTool(page, 'twoPages')
  await runTool(page, 'fitWidth')
  await search(page, 'fonksiyon')
  await settle(page)
  await page.screenshot({ path: `${out}/tablet10-2-arama.png` })
})

// Play simgesi 512×512: köşeleri Play yuvarlar, bu yüzden uygulama simgesinin köşesiz, tam kare hâli.
test('simge', async ({ page }) => {
  const svg = readFileSync('public/img/app-icon.svg', 'utf8').replace('rx="96" ', '')
  await page.setViewportSize({ width: 512, height: 512 })
  await page.setContent(`<style>body{margin:0}</style>${svg}`)
  await page.screenshot({ path: 'docs/play/simge-512.png' })
})

// Öne çıkan görsel 1024×500, saydamlık yok. Telefon ekran görüntüsü önceki testlerden gelir.
test('öne çıkan görsel', async ({ page }) => {
  const icon = readFileSync('public/img/app-icon.svg', 'utf8')
  const phone = readFileSync(`${out}/telefon-1-belge.png`).toString('base64')
  await page.setViewportSize({ width: 1024, height: 500 })
  await page.setContent(`<!doctype html><html lang="tr"><style>
    body { margin: 0; width: 1024px; height: 500px; overflow: hidden; font-family: 'DejaVu Sans', sans-serif;
      background: linear-gradient(135deg, #eff6ff 0%, #ffffff 55%, #fff1f2 100%); position: relative; }
    .text { position: absolute; left: 72px; top: 118px; width: 560px; }
    .text svg { width: 96px; height: 96px; filter: drop-shadow(0 6px 14px rgb(15 23 42 / .15)); }
    h1 { margin: 18px 0 8px; font-size: 64px; color: #1f2937; letter-spacing: -1px; }
    h1 b { color: #2563eb; } h1 i { color: #e11d48; font-style: normal; }
    p { margin: 0; font-size: 26px; color: #4b5563; line-height: 1.4; }
    .phone { position: absolute; right: 70px; top: 46px; width: 250px; height: 500px; border-radius: 32px;
      border: 10px solid #1f2937; background: #1f2937 url(data:image/png;base64,${phone}) top / cover no-repeat;
      box-shadow: 0 20px 50px rgb(15 23 42 / .25); transform: rotate(4deg); }
  </style><div class="text">${icon}<h1><b>a</b><i>w</i>PDF</h1>
    <p>Sade ve hızlı PDF okuyucu.<br>Telefonda, tablette ve akıllı tahtada.</p></div>
    <div class="phone"></div></html>`)
  await page.screenshot({ path: 'docs/play/one-cikan-1024x500.png' })
})

test('tablet10: sunum', async ({ browser }) => {
  const page = await openApp(browser, 'tablet10', true)
  await runTool(page, 'presentation')
  await settle(page)
  await page.screenshot({ path: `${out}/tablet10-3-sunum.png` })
})
