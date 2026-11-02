import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { Platform } from '../platform/platform'

const PRINT_DPI = 150
const PDF_POINTS_PER_INCH = 72

function clearPages(root: HTMLElement): void {
  for (const image of root.querySelectorAll('img')) URL.revokeObjectURL(image.src)
  root.replaceChildren()
}

async function printedPage(pdf: PDFDocumentProxy, number: number, canvas: HTMLCanvasElement): Promise<HTMLElement> {
  const page = await pdf.getPage(number)
  const viewport = page.getViewport({ scale: PRINT_DPI / PDF_POINTS_PER_INCH })
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  await page.render({ canvas, viewport, intent: 'print' }).promise
  page.cleanup()
  const blob = await new Promise<Blob | null>(resolve => { canvas.toBlob(resolve) })
  if (!blob) throw new Error(`Sayfa ${number} yazdırmaya hazırlanamadı.`)
  // Loaded but not decoded: a decoded page takes some 8 MB, which a long book cannot afford.
  const image = new Image()
  await new Promise((resolve, reject) => {
    image.onload = resolve
    image.onerror = reject
    image.src = URL.createObjectURL(blob)
  })
  const wrapper = document.createElement('div')
  wrapper.className = 'print-page'
  wrapper.append(image)
  return wrapper
}

/**
 * Printing paper gets the file as it is: the view's rotation and zoom do not apply. Pages become
 * images one at a time so the dialog can show progress and a long print can be cancelled.
 */
export async function printDocument(pdf: PDFDocumentProxy, platform: Platform): Promise<void> {
  const root = document.querySelector<HTMLElement>('#printContainer')!
  const dialog = document.querySelector<HTMLDialogElement>('#printDialog')!
  const progress = document.querySelector('#printProgress')!
  clearPages(root)

  const first = (await pdf.getPage(1)).getViewport({ scale: 1 })
  document.querySelector('#printPageSize')!.textContent = `@page { size: ${first.width}pt ${first.height}pt; margin: 0 }`

  // One canvas for all pages: a new one for each piles up faster than memory is reclaimed.
  const canvas = document.createElement('canvas')
  let isFinished = false
  let isCancelled = false
  dialog.addEventListener('close', () => { isCancelled = !isFinished }, { once: true })
  dialog.showModal()
  try {
    for (let number = 1; number <= pdf.numPages && !isCancelled; number += 1) {
      progress.textContent = `${number} / ${pdf.numPages}`
      root.append(await printedPage(pdf, number, canvas))
    }
  } finally {
    canvas.width = 0
    isFinished = true
    dialog.close()
  }
  if (isCancelled) {
    clearPages(root)
    return
  }
  // Android's print service reads the page later; there it waits for the next print instead.
  window.addEventListener('afterprint', () => clearPages(root), { once: true })
  platform.print()
}
