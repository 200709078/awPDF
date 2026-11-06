import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DesktopFiles, type OpenedFile } from './files.js'
import { ScreenKeyboardService } from './screen-keyboard.js'

const distPath = fileURLToPath(new URL('../dist/', import.meta.url))
const preloadPath = fileURLToPath(new URL('./preload.cjs', import.meta.url))
const devServerUrl = app.isPackaged ? undefined : process.env.AWPDF_DEV_SERVER_URL
const iconPath = fileURLToPath(new URL(
  devServerUrl ? '../public/img/app-icon.png' : '../dist/img/app-icon.png',
  import.meta.url,
))

const SCHEME = 'awpdf'
const screenKeyboard = new ScreenKeyboardService()
const OPENABLE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])
const APP_HOST = 'app'
// The app works without a network: documents are untrusted, and nothing may leave the machine.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data: blob:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

// The app runs from its own origin, not file://, so a page can never read local files.
protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true },
}])

function registerAppProtocol(): void {
  protocol.handle(SCHEME, async request => {
    const { host, pathname } = new URL(request.url)
    const file = path.join(distPath, decodeURIComponent(pathname))
    if (host !== APP_HOST || !file.startsWith(distPath)) return new Response(null, { status: 404 })
    const response = await net.fetch(pathToFileURL(file).href)
    const headers = new Headers(response.headers)
    headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY)
    return new Response(response.body, { status: response.status, headers })
  })
}

function senderWindow(event: IpcMainEvent | IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

/** The renderer draws its own title bar; these channels back its window buttons. */
function registerWindowControls(): void {
  ipcMain.on('window:minimize', event => senderWindow(event)?.minimize())
  ipcMain.on('window:toggle-maximize', event => {
    const window = senderWindow(event)
    if (!window) return
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  })
  ipcMain.on('window:toggle-fullscreen', event => {
    const window = senderWindow(event)
    window?.setFullScreen(!window.isFullScreen())
  })
  ipcMain.on('window:set-fullscreen', (event, enabled: unknown) => senderWindow(event)?.setFullScreen(enabled === true))
  ipcMain.on('window:close', event => senderWindow(event)?.close())
  ipcMain.handle('window:is-maximized', event => senderWindow(event)?.isMaximized() ?? false)
  ipcMain.handle('window:is-fullscreen', event => senderWindow(event)?.isFullScreen() ?? false)
}

/** The PDFs on a command line: paths, or `file:` addresses from a file manager's "open with". */
function pdfPaths(argv: readonly string[], directory: string): string[] {
  return argv.slice(1)
    .filter(argument => !argument.startsWith('-'))
    .map(argument => (argument.startsWith('file:') ? fileURLToPath(argument) : path.resolve(directory, argument)))
    .filter(argument => /\.pdf$/i.test(argument))
}

/** Holds the files that arrive while the page is still loading. */
function fileDelivery(files: DesktopFiles): (paths: readonly string[]) => void {
  const waiting: OpenedFile[] = []
  let page: Electron.WebContents | null = null
  ipcMain.on('files:ready', event => {
    page = event.sender
    for (const file of waiting.splice(0)) page.send('files:opened', file)
  })
  return paths => {
    for (const filePath of paths) {
      files.open(filePath).then(file => {
        if (page) page.send('files:opened', file)
        else waiting.push(file)
      }).catch(console.error)
    }
  }
}

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    title: 'awPDF | mADEMatik',
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: '#ffffff',
    icon: iconPath,
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: 'hidden',
    fullscreenable: true,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  screenKeyboard.allowWindow(window)
  window.on('maximize', () => window.webContents.send('window:maximize-changed', true))
  window.on('unmaximize', () => window.webContents.send('window:maximize-changed', false))
  window.on('enter-full-screen', () => window.webContents.send('window:fullscreen-changed', true))
  window.on('leave-full-screen', () => window.webContents.send('window:fullscreen-changed', false))
  // F11 is handled here so the renderer does not toggle a second time.
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      event.preventDefault()
      window.setFullScreen(!window.isFullScreen())
    }
  })

  // The renderer confirms a link with the user and asks for a window; this hands it to the system.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (OPENABLE_PROTOCOLS.has(new URL(url).protocol)) void shell.openExternal(url).catch(console.error)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', event => event.preventDefault())
  // The page holds back closing while a document has unsaved changes; the user decides here.
  window.webContents.on('will-prevent-unload', event => {
    const choice = dialog.showMessageBoxSync(window, {
      type: 'warning',
      title: 'awPDF',
      message: 'Kaydedilmemiş değişiklikler var.',
      detail: 'Kapatırsanız değişiklikler kaybolur.',
      buttons: ['Kaydetmeden kapat', 'Vazgeç'],
      defaultId: 1,
      cancelId: 1,
    })
    if (choice === 0) event.preventDefault()
  })

  await window.loadURL(devServerUrl || `${SCHEME}://${APP_HOST}/index.html`)
}

// One window for all documents: a second start hands its files over and leaves.
const isFirstInstance = app.requestSingleInstanceLock()
if (!isFirstInstance) app.quit()

if (isFirstInstance) void app.whenReady().then(async () => {
  app.setAppUserModelId('com.madematik.awpdf')
  // Electron's own menu would close the window on ctrl+w and reload the page, tabs and all, on ctrl+r.
  Menu.setApplicationMenu(null)
  registerAppProtocol()
  registerWindowControls()
  screenKeyboard.register(ipcMain)
  const files = new DesktopFiles()
  files.register()
  const deliver = fileDelivery(files)
  app.on('second-instance', (_event, argv, directory) => {
    deliver(pdfPaths(argv, directory))
    const window = BrowserWindow.getAllWindows()[0]
    if (window?.isMinimized()) window.restore()
    window?.focus()
  })
  deliver(pdfPaths(process.argv, process.cwd()))
  await createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow().catch(console.error)
    }
  })
}).catch((error: unknown) => {
  console.error(error)
  app.quit()
  process.exitCode = 1
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
