import { pdfFileFromBlob } from '../core/pdf-file'
import type { Platform } from './platform'

export function browserPlatform(): Platform {
  const input = document.querySelector<HTMLInputElement>('#pdfInput')!
  return {
    pickFile: () => input.click(),
    onFile: listener => {
      input.addEventListener('change', () => {
        const file = input.files?.[0]
        // Cleared so that choosing the same file again fires `change` again.
        input.value = ''
        if (file) listener(pdfFileFromBlob(file))
      })
    },
    openExternal: url => { window.open(url, '_blank', 'noopener,noreferrer') },
    print: () => window.print(),
    get isFullscreen() {
      return document.fullscreenElement !== null
    },
    toggleFullscreen: () => {
      const change = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()
      void change.catch(console.error)
    },
    onFullscreenChange: listener => { document.addEventListener('fullscreenchange', listener) },
  }
}
