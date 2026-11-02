import assert from 'node:assert/strict'
import path from 'node:path'
import { _electron as electron } from '@playwright/test'
import { makePdf } from '../tests/helpers/make-pdf.mjs'

const executablePath = process.env.AWPDF_ELECTRON_EXECUTABLE
const launchEnvironment = { ...process.env, AWPDF_DEV_SERVER_URL: '' }
delete launchEnvironment.ELECTRON_RUN_AS_NODE
const application = await electron.launch({
  ...(executablePath ? { executablePath, args: [] } : { args: ['.'] }),
  env: launchEnvironment,
  timeout: 30_000,
})

try {
  const page = await application.firstWindow()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`))
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.waitForLoadState('load')
  const title = 'awPDF | mADEMatik'
  assert.equal(await page.title(), title)
  assert.ok(page.url().startsWith('awpdf://app/'), 'Üretim çıktısı uygulamanın kendi adresinden açılmalı')

  const preferences = await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    return window.webContents.getLastWebPreferences()
  })
  assert.equal(preferences.nodeIntegration, false)
  assert.equal(preferences.contextIsolation, true)
  assert.equal(preferences.sandbox, true)
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined')
  assert.deepEqual(await page.evaluate(() => Object.keys(window.awPDFDesktop ?? {})), ['windowControls'])

  // Frameless window: the renderer's title bar replaces the system frame.
  const titlebar = page.locator('#titlebar')
  await titlebar.waitFor()
  assert.equal(await titlebar.locator('.titlebar__title').textContent(), title)
  const titlebarHeight = (await titlebar.boundingBox()).height
  assert.equal(titlebarHeight, 36)
  assert.equal((await page.locator('#toolbar').boundingBox()).y, titlebarHeight, 'Araç çubuğu başlık çubuğunun altında başlamalı')

  // Worker, wasm, fonts and the viewer must all work from the packaged origin under its CSP.
  await page.locator('#pdfInput').setInputFiles({ name: 'deneme.pdf', mimeType: 'application/pdf', buffer: makePdf() })
  await page.waitForFunction(() => document.querySelector('#pageStatus')?.textContent === '1 / 3')
  await page.waitForFunction(() => document.querySelector('.page[data-page-number="1"] .textLayer')?.textContent.includes('awPDF'))
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.page[data-page-number="1"] canvas')
    if (!canvas?.width) return false
    return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 !== 3 && value < 128)
  })

  // The page may read only the app's own origin, never the disk.
  assert.equal(await page.evaluate(() => fetch('file:///etc/hostname').then(() => 'okundu', () => 'engellendi')), 'engellendi')
  assert.equal(await page.evaluate(() => fetch('https://example.com/').then(() => 'gitti', () => 'engellendi')), 'engellendi')
  // Those two refused requests are expected; only anything else counts as an error.
  const unexpected = errors.filter(error => !error.includes('file:///etc/hostname') && !error.includes('https://example.com/'))
  assert.deepEqual(unexpected, [], 'Electron içinde JavaScript veya varlık yükleme hatası olmamalı')
  await page.screenshot({ path: path.join('test-results', 'electron.png') })
  console.log('Electron kontrolü geçti: uygulama adresi, başlık çubuğu, PDF açma ve çizim, CSP ve renderer yalıtımı.')
} finally {
  await application.close()
}
