import { AnnotationMode, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { Platform } from '../platform/platform'
import { canvasBytes } from './images'

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
  // Filled-in form fields go on paper as they are on screen.
  await page.render({
    canvas,
    viewport,
    intent: 'print',
    annotationMode: AnnotationMode.ENABLE_STORAGE,
    printAnnotationStorage: pdf.annotationStorage.print,
  }).promise
  page.cleanup()
  // Encoded at once: `toBlob` would wait some four seconds a page in an Android WebView.
  const blob = new Blob([canvasBytes(canvas, 'image/png') as Uint8Array<ArrayBuffer>], { type: 'image/png' })
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
 * Printing paper gets the file as it is: the view's rotation and zoom do not apply. The chosen
 * `pages` become images one at a time, so the dialog can show progress and a long print can be
 * cancelled.
 */
export async function printDocument(pdf: PDFDocumentProxy, platform: Platform, pages: readonly number[]): Promise<void> {
  const root = document.querySelector<HTMLElement>('#printContainer')!
  const dialog = document.querySelector<HTMLDialogElement>('#printDialog')!
  const progress = document.querySelector('#printProgress')!
  clearPages(root)

  const first = (await pdf.getPage(pages[0])).getViewport({ scale: 1 })
  document.querySelector('#printPageSize')!.textContent = `@page { size: ${first.width}pt ${first.height}pt; margin: 0 }`

  // One canvas for all pages: a new one for each piles up faster than memory is reclaimed.
  const canvas = document.createElement('canvas')
  let isFinished = false
  let isCancelled = false
  dialog.addEventListener('close', () => { isCancelled = !isFinished }, { once: true })
  dialog.showModal()
  try {
    for (const [done, number] of pages.entries()) {
      if (isCancelled) break
      progress.textContent = `${done + 1} / ${pages.length}`
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
  // Android's WebView fires `afterprint` after each pass, the preview's too, and reads the page
  // again for the printer: cleared then, the paper came out blank (2026-11-12). There the pages
  // wait for the next print, which clears them first.
  if (!platform.printReadsLater) window.addEventListener('afterprint', () => clearPages(root), { once: true })
  platform.print()
}
