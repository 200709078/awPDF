import { pdfFileFromBlob, type PdfFile } from '../core/pdf-file'
import { browserPlatform, onPickedFile, showFileInput } from './browser'
import type { Platform } from './platform'

function pdfFileFromDisk(files: DesktopFiles, { id, name, size, source }: DesktopOpenedFile): PdfFile {
  return { name, size, source, read: (begin, end) => files.read(id, begin, end), close: () => files.close(id) }
}

/**
 * The Electron window: full screen belongs to the window and files come from the shell, which
 * remembers where they are. The rest works as in a browser.
 */
export function desktopPlatform(controls: DesktopWindowControls, files: DesktopFiles, screenKeyboard?: DesktopScreenKeyboard): Platform {
  const listeners = new Set<() => void>()
  let isFullscreen = false
  const show = (enabled: boolean) => {
    isFullscreen = enabled
    for (const listener of listeners) listener()
  }
  controls.onFullscreenChanged(show)
  void controls.isFullscreen().then(show).catch(() => undefined)
  return {
    ...browserPlatform(),
    screenKeyboard,
    pickFile: showFileInput,
    reopen: async source => {
      const file = await files.reopen(source)
      return file && pdfFileFromDisk(files, file)
    },
    onFile: listener => {
      files.onOpened(file => listener(pdfFileFromDisk(files, file)))
      onPickedFile(file => {
        void files.adopt(file).catch(() => null).then(opened => {
          listener(opened ? pdfFileFromDisk(files, opened) : pdfFileFromBlob(file))
        })
      })
    },
    get isFullscreen() {
      return isFullscreen
    },
    toggleFullscreen: () => controls.toggleFullscreen(),
    onFullscreenChange: listener => { listeners.add(listener) },
  }
}
