import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { fromBase64, toBase64 } from '../core/base64'
import type { PdfFile } from '../core/pdf-file'
import { browserPlatform } from './browser'
import type { Platform } from './platform'

/** A file from the system's "open with". Size 0 means it could not be opened. */
interface OpenedFile {
  id: number
  name: string
  size: number
}

/** The Android app's own plugin (android/…/AwPdfNativePlugin.java). */
interface AwPdfNative {
  addListener(event: 'fileOpened', listener: (file: OpenedFile) => void): Promise<PluginListenerHandle>
  readFile(options: { id: number; begin: number; end: number }): Promise<{ data: string }>
  print(options: { name: string }): Promise<void>
  setFullscreen(options: { enabled: boolean }): Promise<void>
  /** Adds base64 data to the copy kept for sharing; `first` starts a new copy. */
  appendShareFile(options: { name: string; data: string; first: boolean }): Promise<void>
  shareFile(options: { name: string }): Promise<void>
}

const native = registerPlugin<AwPdfNative>('AwPdfNative')

/** A multiple of 3: the chunks' base64 joins up without padding in the middle of the file. */
const SHARE_CHUNK_BYTES = 3 * 256 * 1024

function pdfFileFromNative({ id, name, size }: OpenedFile): PdfFile {
  return {
    name,
    size,
    read: async (begin, end) => fromBase64((await native.readFile({ id, begin, end })).data),
  }
}

/** Android gives other apps a file, so the PDF is copied to the cache piece by piece first. */
async function share(file: PdfFile): Promise<void> {
  for (let begin = 0; begin < file.size; begin += SHARE_CHUNK_BYTES) {
    const data = toBase64(await file.read(begin, Math.min(begin + SHARE_CHUNK_BYTES, file.size)))
    await native.appendShareFile({ name: file.name, data, first: begin === 0 })
  }
  await native.shareFile({ name: file.name })
}

export function androidPlatform(): Platform {
  const listeners = new Set<() => void>()
  let isFullscreen = false
  const browser = browserPlatform()
  return {
    ...browser,
    onFile: listener => {
      browser.onFile(listener)
      void native.addListener('fileOpened', file => listener(pdfFileFromNative(file)))
    },
    // The WebView hands a page it may not open itself over to the system.
    openExternal: url => { window.location.href = url },
    print: () => { void native.print({ name: 'awPDF' }).catch(console.error) },
    share,
    get isFullscreen() {
      return isFullscreen
    },
    toggleFullscreen: () => {
      isFullscreen = !isFullscreen
      void native.setFullscreen({ enabled: isFullscreen }).catch(console.error)
      for (const listener of listeners) listener()
    },
    onFullscreenChange: listener => { listeners.add(listener) },
  }
}
