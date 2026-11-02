import { app, BrowserWindow, ipcMain, net, protocol, shell, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const distPath = fileURLToPath(new URL('../dist/', import.meta.url))
const preloadPath = fileURLToPath(new URL('./preload.cjs', import.meta.url))
const devServerUrl = app.isPackaged ? undefined : process.env.AWPDF_DEV_SERVER_URL
const iconPath = fileURLToPath(new URL(
  devServerUrl ? '../public/img/app-icon.png' : '../dist/img/app-icon.png',
  import.meta.url,
))

const SCHEME = 'awpdf'
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

  await window.loadURL(devServerUrl || `${SCHEME}://${APP_HOST}/index.html`)
}

void app.whenReady().then(async () => {
  app.setAppUserModelId('com.madematik.awpdf')
  registerAppProtocol()
  registerWindowControls()
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
