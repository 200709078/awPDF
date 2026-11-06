import { pdfFileFromBlob, type PdfFile } from '../core/pdf-file'
import { findHandle, keepHandle } from './file-handles'
import { PDF_TYPE, SameFileError, type FileType, type Platform } from './platform'

const DROPPING_CLASS = 'is-dropping'

/** Files from the picker and from a drop anywhere on the window. */
export function onPickedFile(listener: (file: File) => void): void {
  const input = document.querySelector<HTMLInputElement>('#pdfInput')!
  input.addEventListener('change', () => {
    const files = [...input.files ?? []]
    // Cleared so that choosing the same file again fires `change` again.
    input.value = ''
    for (const file of files) listener(file)
  })
  const carriesFiles = ({ dataTransfer }: DragEvent) => dataTransfer?.types.includes('Files') ?? false
  const setDropping = (dropping: boolean) => document.body.classList.toggle(DROPPING_CLASS, dropping)
  window.addEventListener('dragover', event => {
    if (!carriesFiles(event)) return
    event.preventDefault()
    setDropping(true)
  })
  window.addEventListener('dragleave', event => {
    // Null only on leaving the window; moving between elements names the next one.
    if (event.relatedTarget === null) setDropping(false)
  })
  window.addEventListener('drop', event => {
    if (!carriesFiles(event)) return
    event.preventDefault()
    setDropping(false)
    for (const file of event.dataTransfer?.files ?? []) listener(file)
  })
}

export function showFileInput(): void {
  document.querySelector<HTMLInputElement>('#pdfInput')!.click()
}

/** Long enough for the browser to have taken the download. */
const DOWNLOAD_URL_LIFETIME_MS = 60_000
const PDF_PICKER_TYPES = [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }]

async function pdfFileFromHandle(handle: FileSystemFileHandle): Promise<PdfFile> {
  const file = await handle.getFile()
  const source = `${file.name}/${file.size}/${file.lastModified}`
  await keepHandle(source, handle)
  return { ...pdfFileFromBlob(file), source }
}

/** Chromium on a computer asks where to save; elsewhere the file goes to the downloads. */
async function saveFile(name: string, data: Uint8Array, original?: PdfFile, type: FileType = PDF_TYPE): Promise<string | null> {
  if (!window.showSaveFilePicker) {
    const url = URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type: type.mime }))
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS)
    return name
  }
  let handle: FileSystemFileHandle
  try {
    handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: type.description, accept: { [type.mime]: [`.${type.extension}`] } }] })
  } catch (error) {
    if ((error as DOMException).name === 'AbortError') return null
    throw error
  }
  const open = original?.source ? await findHandle(original.source) : undefined
  if (open && await handle.isSameEntry(open)) throw new SameFileError()
  const writable = await handle.createWritable()
  await writable.write(data as Uint8Array<ArrayBuffer>)
  await writable.close()
  return handle.name
}

export function browserPlatform(): Platform {
  const listeners = new Set<(file: PdfFile) => void>()
  return {
    // Only the picker's handle can lead back to a file later; not every browser has it.
    pickFile: () => {
      if (!window.showOpenFilePicker) {
        showFileInput()
        return
      }
      window.showOpenFilePicker({ types: PDF_PICKER_TYPES, multiple: true }).then(async handles => {
        const files = await Promise.all(handles.map(pdfFileFromHandle))
        for (const file of files) for (const listener of listeners) listener(file)
      }).catch((error: unknown) => {
        if ((error as DOMException).name !== 'AbortError') console.error(error)
      })
    },
    reopen: async source => {
      const handle = await findHandle(source)
      if (!handle || await handle.requestPermission({ mode: 'read' }) !== 'granted') return null
      return pdfFileFromHandle(handle)
    },
    onFile: listener => {
      listeners.add(listener)
      onPickedFile(file => listener(pdfFileFromBlob(file)))
    },
    openExternal: url => { window.open(url, '_blank', 'noopener,noreferrer') },
    print: () => window.print(),
    saveFile,
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
