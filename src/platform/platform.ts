import type { PdfFile } from '../core/pdf-file'
import { browserPlatform } from './browser'

/**
 * Everything that differs between Electron, Android and the web. The rest of the app talks only
 * to this. Files arrive through `onFile` because they do not always come from the picker: the
 * system's "open with" hands the app a file too.
 */
export interface Platform {
  /** Shows the file picker; a chosen file arrives through `onFile`. */
  pickFile(): void
  onFile(listener: (file: PdfFile) => void): void
}

/** All three platforms use the browser's picker for now; the roadmap adds their own. */
export function currentPlatform(): Platform {
  return browserPlatform()
}
