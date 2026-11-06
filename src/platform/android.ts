import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { fromBase64, toBase64 } from '../core/base64'
import type { PdfFile } from '../core/pdf-file'
import { browserPlatform } from './browser'
import { PDF_TYPE, type FileType, type Platform } from './platform'

/** A file from the system's "open with". Size 0 means it could not be opened. */
interface OpenedFile {
  id: number
  name: string
  size: number
  /** Present when Android lets the app come back to the file later. */
  source?: string
}

/** The Android app's own plugin (android/…/AwPdfNativePlugin.java). */
interface AwPdfNative {
  addListener(event: 'fileOpened', listener: (file: OpenedFile) => void): Promise<PluginListenerHandle>
  addListener(event: 'backButton', listener: () => void): Promise<PluginListenerHandle>
  /** Puts the app behind the others; the open document is still there on coming back. */
  leaveApp(): Promise<void>
  pickFile(): Promise<void>
  reopenFile(options: { source: string }): Promise<OpenedFile>
  readFile(options: { id: number; begin: number; end: number }): Promise<{ data: string }>
  print(options: { name: string }): Promise<void>
  setFullscreen(options: { enabled: boolean }): Promise<void>
  /** `color` is a CSS hex colour; `dark` turns the bars' icons light. */
  setSystemBars(options: { color: string; dark: boolean }): Promise<void>
  /** Adds base64 data to the copy kept for sharing; `first` starts a new copy. */
  appendShareFile(options: { name: string; data: string; first: boolean }): Promise<void>
  shareFile(options: { name: string; type: string }): Promise<void>
  /** Asks where to save the copy `appendShareFile` made; `name` is absent when the user cancelled. */
  saveFile(options: { name: string; type: string }): Promise<{ name?: string }>
}

const native = registerPlugin<AwPdfNative>('AwPdfNative')

/** A multiple of 3: the chunks' base64 joins up without padding in the middle of the file. */
const SHARE_CHUNK_BYTES = 3 * 256 * 1024

/** Android's `Color.parseColor` reads only #RRGGBB, and the build shortens #ffffff to #fff. */
function sixDigitHex(color: string): string {
  return /^#[0-9a-f]{3}$/i.test(color) ? `#${[...color.slice(1)].map(digit => digit + digit).join('')}` : color
}

function pdfFileFromNative({ id, name, size, source }: OpenedFile): PdfFile {
  return {
    name,
    size,
    source,
    read: async (begin, end) => fromBase64((await native.readFile({ id, begin, end })).data),
  }
}

/** The bridge carries text, so a file reaches the native side's cache piece by piece. */
async function copyToNative(name: string, size: number, read: (begin: number, end: number) => Promise<Uint8Array>): Promise<void> {
  for (let begin = 0; begin < size || begin === 0; begin += SHARE_CHUNK_BYTES) {
    const data = toBase64(await read(begin, Math.min(begin + SHARE_CHUNK_BYTES, size)))
    await native.appendShareFile({ name, data, first: begin === 0 })
  }
}

/** Android gives other apps a file, so it is copied to the cache first. */
async function share(file: PdfFile, type: FileType = PDF_TYPE): Promise<void> {
  await copyToNative(file.name, file.size, file.read)
  await native.shareFile({ name: file.name, type: type.mime })
}

/** The system's own "save" screen makes a new file; it never writes over the open one. */
async function saveFile(name: string, data: Uint8Array, _original?: PdfFile, type: FileType = PDF_TYPE): Promise<string | null> {
  await copyToNative(name, data.length, async (begin, end) => data.subarray(begin, end))
  return (await native.saveFile({ name, type: type.mime })).name ?? null
}

export function androidPlatform(): Platform {
  const listeners = new Set<() => void>()
  let isFullscreen = false
  const browser = browserPlatform()
  return {
    ...browser,
    singleDocument: true,
    pickFile: () => { void native.pickFile().catch(console.error) },
    reopen: async source => {
      const file = await native.reopenFile({ source })
      return file.size > 0 ? pdfFileFromNative(file) : null
    },
    onFile: listener => {
      void native.addListener('fileOpened', file => listener(pdfFileFromNative(file)))
    },
    // The WebView hands a page it may not open itself over to the system.
    openExternal: url => { window.location.href = url },
    print: () => { void native.print({ name: 'awPDF' }).catch(console.error) },
    share,
    saveFile,
    setSystemBars: ({ color, dark }) => { void native.setSystemBars({ color: sixDigitHex(color), dark }).catch(console.error) },
    get isFullscreen() {
      return isFullscreen
    },
    toggleFullscreen: () => {
      isFullscreen = !isFullscreen
      void native.setFullscreen({ enabled: isFullscreen }).catch(console.error)
      for (const listener of listeners) listener()
    },
    onFullscreenChange: listener => { listeners.add(listener) },
    onBack: listener => {
      void native.addListener('backButton', () => {
        if (!listener()) void native.leaveApp().catch(console.error)
      })
    },
  }
}
