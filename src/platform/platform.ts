import { Capacitor } from '@capacitor/core'
import type { PdfFile } from '../core/pdf-file'
import { androidPlatform } from './android'
import { browserPlatform } from './browser'
import { desktopPlatform } from './desktop'
import { isSmartBoard } from './smart-board'

/**
 * Everything that differs between Electron, Android and the web. The rest of the app talks only
 * to this. Files arrive through `onFile` because they do not always come from the picker: the
 * system's "open with" hands the app a file too.
 */
export interface Platform {
  /** Shows the file picker; a chosen file arrives through `onFile`. */
  pickFile(): void
  onFile(listener: (file: PdfFile) => void): void
  /** Opens a file again by its `source`; null when it is gone or may no longer be read. */
  reopen?(source: string): Promise<PdfFile | null>
  /** Hands a link to the system's browser or mail app. */
  openExternal(url: string): void
  /** Prints what the `@media print` styles show. */
  print(): void
  /** A new document takes the place of the open one: no room for tabs on a phone. */
  readonly singleDocument?: boolean
  /** A smart board has no keys; absent everywhere else, where the system sees to its own keyboard. */
  readonly screenKeyboard?: DesktopScreenKeyboard
  /** Sends the file to another app; absent where that means nothing. */
  share?(file: PdfFile): Promise<void>
  /** The system's own bars around the app take the interface's colour; absent where it has none. */
  setSystemBars?(bars: { color: string; dark: boolean }): void
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
  const { windowControls, files, screenKeyboard } = window.awPDFDesktop ?? {}
  if (!windowControls || !files) return browserPlatform()
  return desktopPlatform(windowControls, files, isSmartBoard() ? screenKeyboard : undefined)
}
