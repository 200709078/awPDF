import { pdfFileFromBlob } from '../core/pdf-file'
import type { Platform } from './platform'

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

export function browserPlatform(): Platform {
  const input = document.querySelector<HTMLInputElement>('#pdfInput')!
  return {
    pickFile: () => input.click(),
    onFile: listener => onPickedFile(file => listener(pdfFileFromBlob(file))),
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
