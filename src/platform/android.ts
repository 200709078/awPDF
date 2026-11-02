import { registerPlugin } from '@capacitor/core'
import type { PdfFile } from '../core/pdf-file'
import { browserPlatform } from './browser'
import type { Platform } from './platform'

/** The Android app's own plugin (android/…/AwPdfNativePlugin.java). */
interface AwPdfNative {
  print(options: { name: string }): Promise<void>
  setFullscreen(options: { enabled: boolean }): Promise<void>
  /** Adds base64 data to the copy kept for sharing; `first` starts a new copy. */
  appendShareFile(options: { name: string; data: string; first: boolean }): Promise<void>
  shareFile(options: { name: string }): Promise<void>
}

const native = registerPlugin<AwPdfNative>('AwPdfNative')

/** A multiple of 3: the chunks' base64 joins up without padding in the middle of the file. */
const SHARE_CHUNK_BYTES = 3 * 256 * 1024
const BINARY_STRING_BYTES = 0x8000

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += BINARY_STRING_BYTES) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BINARY_STRING_BYTES))
  }
  return btoa(binary)
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
  return {
    ...browserPlatform(),
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
