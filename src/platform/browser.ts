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
  }
}
