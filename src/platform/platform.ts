import { Capacitor } from '@capacitor/core'
import type { PdfFile } from '../core/pdf-file'
import { androidPlatform } from './android'
import { browserPlatform } from './browser'
import { desktopPlatform } from './desktop'

/**
 * Everything that differs between Electron, Android and the web. The rest of the app talks only
 * to this. Files arrive through `onFile` because they do not always come from the picker: the
 * system's "open with" hands the app a file too.
 */
export interface Platform {
  /** Shows the file picker; a chosen file arrives through `onFile`. */
  pickFile(): void
  onFile(listener: (file: PdfFile) => void): void
  /** Hands a link to the system's browser or mail app. */
  openExternal(url: string): void
  /** Prints what the `@media print` styles show. */
  print(): void
  /** Sends the file to another app; absent where that means nothing. */
  share?(file: PdfFile): Promise<void>
  readonly isFullscreen: boolean
  toggleFullscreen(): void
  onFullscreenChange(listener: () => void): void
  /**
   * The device's back button, where it has one. The listener answers whether it closed something;
   * when it did not, the platform leaves the app.
   */
  onBack?(listener: () => boolean): void
}

export function currentPlatform(): Platform {
  if (Capacitor.getPlatform() === 'android') return androidPlatform()
  const controls = window.awPDFDesktop?.windowControls
  return controls ? desktopPlatform(controls) : browserPlatform()
}
