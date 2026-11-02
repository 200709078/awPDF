import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { _electron as electron } from '@playwright/test'
import { makePdf } from '../tests/helpers/make-pdf.mjs'

const executablePath = process.env.AWPDF_ELECTRON_EXECUTABLE
const launchEnvironment = { ...process.env, AWPDF_DEV_SERVER_URL: '' }
delete launchEnvironment.ELECTRON_RUN_AS_NODE
const launchArguments = executablePath ? [] : ['.']
const launch = (...files) => electron.launch({
  ...(executablePath ? { executablePath } : {}),
  args: [...launchArguments, ...files],
  env: launchEnvironment,
  timeout: 30_000,
})
const folder = mkdtempSync(path.join(tmpdir(), 'awpdf-'))
const pdfOnDisk = (name, pages = 3) => {
  const file = path.join(folder, name)
  writeFileSync(file, makePdf({ pages }))
  return file
}
const application = await launch()

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
  assert.deepEqual(await page.evaluate(() => Object.keys(window.awPDFDesktop ?? {}).sort()), ['files', 'windowControls'])

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

  // A file from the disk is read by the shell; the page gets its name, never its path.
  await page.locator('#pdfInput').setInputFiles(pdfOnDisk('secilen.pdf', 4))
  await page.waitForFunction(() => document.title.startsWith('secilen.pdf'))
  await page.waitForFunction(() => document.querySelector('.page[data-page-number="1"] .textLayer')?.textContent.includes('awPDF'))
  assert.equal(await page.evaluate(() => window.awPDFDesktop.files.reopen('/etc/hostname')), null)

  // A second start ("open with" while the app runs) hands its file over and leaves.
  const electronBinary = executablePath ?? await application.evaluate(() => process.execPath)
  const second = spawnSync(electronBinary, [...launchArguments, pdfOnDisk('ikinci.pdf', 5)], { env: launchEnvironment, timeout: 20_000 })
  assert.equal(second.status, 0, 'İkinci başlatma dosyayı devredip çıkmalı')
  await page.waitForFunction(() => document.title.startsWith('ikinci.pdf'))
  assert.equal(application.windows().length, 1, 'İkinci başlatma yeni pencere açmamalı')

  // Every document has a tab; ctrl+w closes the tab, never the window.
  assert.equal(await page.locator('.tab').count(), 3)
  await page.locator('#viewerContainer').click()
  await page.keyboard.press('Control+w')
  await page.waitForFunction(() => document.querySelectorAll('.tab').length === 2)
  assert.equal(application.windows().length, 1)

  // Links reach the system only through the window handler, and only of the allowed kinds.
  await application.evaluate(({ shell }) => {
    globalThis.openedLinks = []
    shell.openExternal = async url => { globalThis.openedLinks.push(url) }
  })
  await page.evaluate(() => {
    for (const url of ['https://madematik.com/', 'file:///etc/hostname']) window.open(url, '_blank', 'noopener,noreferrer')
  })
  await page.waitForTimeout(300)
  assert.deepEqual(await application.evaluate(() => globalThis.openedLinks), ['https://madematik.com/'])
  assert.equal(application.windows().length, 1, 'Bağlantı uygulama içinde yeni pencere açmamalı')

  // The toolbar's full screen button drives the window, not the page.
  const isFullScreen = () => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())
  await page.locator('#tool-fullscreen').click()
  await page.waitForFunction(() => document.querySelector('#tool-fullscreen')?.getAttribute('aria-pressed') === 'true')
  assert.equal(await isFullScreen(), true)
  await page.locator('#tool-fullscreen').click()
  await page.waitForFunction(() => document.querySelector('#tool-fullscreen')?.getAttribute('aria-pressed') === 'false')

  // The page may read only the app's own origin, never the disk.
  assert.equal(await page.evaluate(() => fetch('file:///etc/hostname').then(() => 'okundu', () => 'engellendi')), 'engellendi')
  assert.equal(await page.evaluate(() => fetch('https://example.com/').then(() => 'gitti', () => 'engellendi')), 'engellendi')
  // Those two refused requests are expected; only anything else counts as an error.
  const unexpected = errors.filter(error => !error.includes('file:///etc/hostname') && !error.includes('https://example.com/'))
  assert.deepEqual(unexpected, [], 'Electron içinde JavaScript veya varlık yükleme hatası olmamalı')
  await page.screenshot({ path: path.join('test-results', 'electron.png') })
} finally {
  await application.close()
}

// "Open with" while the app is closed: the file waits for the page to load.
const started = await launch(pdfOnDisk('baslangic.pdf'))
try {
  const page = await started.firstWindow()
  await page.waitForFunction(() => document.title.startsWith('baslangic.pdf'))
  await page.waitForFunction(() => document.querySelector('#pageStatus')?.textContent === '1 / 3')
} finally {
  await started.close()
  rmSync(folder, { recursive: true, force: true })
}
console.log('Electron kontrolü geçti: uygulama adresi, başlık çubuğu, PDF açma ve çizim, Birlikte aç, CSP ve renderer yalıtımı.')
