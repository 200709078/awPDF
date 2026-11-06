import { pdfFileFromBlob, type PdfFile } from '../core/pdf-file'
import { browserPlatform, onPickedFile, showFileInput } from './browser'
import { PDF_TYPE, SameFileError, type Platform } from './platform'

/** The shell's number for each file it opened; a save dialog starts in that file's folder. */
const diskIds = new WeakMap<PdfFile, number>()

function pdfFileFromDisk(files: DesktopFiles, { id, name, size, source }: DesktopOpenedFile): PdfFile {
  const file: PdfFile = { name, size, source, read: (begin, end) => files.read(id, begin, end), close: () => files.close(id) }
  diskIds.set(file, id)
  return file
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
    saveFile: async (name, data, original, type = PDF_TYPE) => {
      const saved = await files.save(name, data, original && diskIds.get(original), type)
      if (saved && 'refused' in saved) throw new SameFileError()
      return saved?.name ?? null
    },
    get isFullscreen() {
      return isFullscreen
    },
    toggleFullscreen: () => controls.toggleFullscreen(),
    onFullscreenChange: listener => { listeners.add(listener) },
  }
}
