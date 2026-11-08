import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { giveNewId } from '../core/pdf-encrypt'
import { pdfAssets } from '../core/pdf-document'

/**
 * Text recognition (OCR) for scanned pages, in Turkish, on the device: tesseract.js with its
 * WebAssembly core and the Turkish model shipped in the app (`public/ocr`, copied by
 * `vite.config.ts`), so no page leaves the device and nothing is downloaded. A page that is only
 * a picture gets an invisible text layer over it, where the words are: the copy can be searched,
 * and its text selected and copied. Pages that already have text are left as they are.
 */

export class OcrCancelled extends Error {}
/** The device's WebAssembly has no SIMD (WebViews older than Chrome 91), which the core needs. */
export class OcrUnsupported extends Error {}
/** The recognition engine did not start (its files missing or unreadable). */
export class OcrNotStarted extends Error {}

/**
 * The Turkish model as shipped: gzip-compressed, except in the Android app, whose build unpacks
 * every `.gz` asset and drops the extension (a phone, 2026-11-08: the .gz was not found and
 * tesseract waited for ever).
 */
async function modelIsCompressed(): Promise<boolean> {
  try {
    const response = await fetch(ocrUrl('tur.traineddata.gz'))
    void response.body?.cancel()
    return response.ok
  } catch {
    return false
  }
}

/** Recognition reads a page drawn at this resolution (the usual for OCR). */
const OCR_DPI = 300
/** And no larger than this on its long side (A4 at 300 DPI), for the memory of phones. */
const MAX_SIDE = 3508
/** A page with fewer characters than this has no text of its own. */
const TEXT_THRESHOLD = 10
/** Starting tesseract (loading its core and the model) takes some seconds; longer means it failed. */
const START_TIMEOUT_MS = 60_000

const ocrUrl = (file: string) => new URL(`ocr/${file}`, document.baseURI).href

/** wasm-feature-detect's test: a module with one SIMD instruction validates only where SIMD works. */
function supportsSimd(): boolean {
  try {
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]))
  } catch {
    return false
  }
}

export interface OcrResult {
  data: Uint8Array
  /** Pages that got a text layer, and those skipped because they had text already. */
  recognized: number
  skipped: number
}

/** The numbers of the pages that have no text of their own. */
export async function pagesWithoutText(pdf: PDFDocumentProxy, skipLast = false): Promise<number[]> {
  const pages: number[] = []
  for (let number = 1; number <= pdf.numPages - (skipLast ? 1 : 0); number += 1) {
    const page = await pdf.getPage(number)
    const text = await page.getTextContent()
    const length = text.items.reduce((sum, item) => sum + ('str' in item ? item.str.trim().length : 0), 0)
    if (length < TEXT_THRESHOLD) pages.push(number)
  }
  return pages
}

/**
 * A copy of the PDF with a text layer on its pages that have none. `bytes` is the PDF as it is
 * to be saved (without a password); `dropLastPage` drops a page joined only to take one off.
 */
export async function recognizePdf(bytes: Uint8Array, progress: (text: string) => void, isCancelled: () => boolean,
  { dropLastPage = false } = {}): Promise<OcrResult> {
  if (!supportsSimd()) throw new OcrUnsupported()
  const task = getDocument({ data: bytes.slice(), enableXfa: false, ...pdfAssets() })
  const pdf = await task.promise
  const lib = await import('pdf-lib')
  const tesseract = await import('tesseract.js')
  let worker: Awaited<ReturnType<typeof tesseract.createWorker>> | null = null
  try {
    const pages = await pagesWithoutText(pdf, dropLastPage)
    const output = await lib.PDFDocument.load(bytes, { updateMetadata: false })
    if (dropLastPage) output.removePage(output.getPageCount() - 1)
    if (pages.length === 0) return { data: new Uint8Array(0), recognized: 0, skipped: output.getPageCount() }
    progress('Türkçe tanıma hazırlanıyor')
    let pageShare = ''
    const starting = tesseract.createWorker('tur', tesseract.OEM.LSTM_ONLY, {
      workerPath: ocrUrl('worker.min.js'),
      corePath: ocrUrl('tesseract-core-simd-lstm.wasm.js'),
      langPath: ocrUrl('').replace(/\/$/, ''),
      gzip: await modelIsCompressed(),
      cacheMethod: 'none',
      workerBlobURL: false,
      logger: message => {
        if (message.status === 'recognizing text') progress(`${pageShare} %${Math.round(message.progress * 100)}`)
      },
    })
    // tesseract.js does not always report a file it could not load; it waits instead.
    let timer: ReturnType<typeof setTimeout> | undefined
    worker = await Promise.race([
      starting,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new OcrNotStarted()), START_TIMEOUT_MS) }),
    ]).finally(() => clearTimeout(timer))
      .catch(error => {
        // One that starts after all is not left running.
        void starting.then(late => late.terminate(), () => undefined)
        throw error
      })
    await worker.setParameters({ preserve_interword_spaces: '1' })
    for (const [index, number] of pages.entries()) {
      if (isCancelled()) throw new OcrCancelled()
      pageShare = `Sayfa ${index + 1} / ${pages.length}`
      progress(pageShare)
      const page = await pdf.getPage(number)
      const natural = page.getViewport({ scale: 1 })
      const scale = Math.min(OCR_DPI / 72, MAX_SIDE / Math.max(natural.width, natural.height))
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      const context = canvas.getContext('2d')!
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: context, viewport }).promise
      // Tesseract's own PDF of the page: the words alone, invisible, where they are on the picture;
      // told the picture's resolution, its page has the PDF page's size.
      await worker.setParameters({ user_defined_dpi: String(Math.round(scale * 72)) })
      const { data } = await worker.recognize(canvas, { pdfTextOnly: true }, { pdf: true, text: false, blocks: false })
      canvas.width = canvas.height = 0
      page.cleanup()
      if (!data.pdf) continue
      const [layer] = await output.embedPdf(new Uint8Array(data.pdf))
      // The picture's lower left corner and its x axis, back in the page's own space (it may be turned).
      const [originX, originY] = viewport.convertToPdfPoint(0, viewport.height)
      const [rightX, rightY] = viewport.convertToPdfPoint(viewport.width, viewport.height)
      const angle = Math.atan2(rightY - originY, rightX - originX) * 180 / Math.PI
      output.getPage(number - 1).drawPage(layer, {
        x: originX,
        y: originY,
        width: viewport.width / scale,
        height: viewport.height / scale,
        rotate: lib.degrees(angle),
      })
    }
    giveNewId(lib, output)
    const data = await output.save({ useObjectStreams: true, updateFieldAppearances: false })
    return { data, recognized: pages.length, skipped: output.getPageCount() - pages.length }
  } finally {
    await worker?.terminate()
    void task.destroy()
  }
}
