import { AnnotationMode, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PdfFile } from '../core/pdf-file'
import { zip, type ZipEntry } from '../core/zip'
import { JPEG_TYPE, PNG_TYPE, SameFileError, ZIP_TYPE, type Platform } from '../platform/platform'
import { askImageExport, showToast, startWork } from '../ui/messages'
import { canvasBytes } from './images'

const PDF_POINTS_PER_INCH = 72
const JPEG_QUALITY = 0.92
/** Browsers refuse larger canvases; a huge page is drawn at a lower resolution instead. */
const MAX_CANVAS_SIDE = 8192

export type ImageFormat = 'png' | 'jpg'

/** Where a part of a page is, as fractions of the page as it is shown. */
export interface PageRegion {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

const WHOLE_PAGE: PageRegion = { left: 0, top: 0, right: 1, bottom: 1 }

/**
 * A page, or a part of it, as a picture at `dpi`, with filled-in form fields. `rotation` is added
 * to the page's own, as the view's is.
 */
export async function renderPageImage(pdf: PDFDocumentProxy, number: number, { dpi, format, rotation = 0, region = WHOLE_PAGE }: {
  dpi: number
  format: ImageFormat
  rotation?: number
  region?: PageRegion
}): Promise<{ data: Uint8Array; width: number; height: number }> {
  const page = await pdf.getPage(number)
  const angle = (page.rotate + rotation) % 360
  const unit = page.getViewport({ scale: 1, rotation: angle })
  const partWidth = unit.width * (region.right - region.left)
  const partHeight = unit.height * (region.bottom - region.top)
  const scale = Math.min(dpi / PDF_POINTS_PER_INCH, MAX_CANVAS_SIDE / Math.max(partWidth, partHeight))
  const viewport = page.getViewport({ scale, rotation: angle })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(partWidth * scale))
  canvas.height = Math.max(1, Math.round(partHeight * scale))
  try {
    await page.render({
      canvas,
      viewport,
      transform: [1, 0, 0, 1, -region.left * viewport.width, -region.top * viewport.height],
      background: '#ffffff',
      annotationMode: AnnotationMode.ENABLE_STORAGE,
      printAnnotationStorage: pdf.annotationStorage.print,
    }).promise
    const data = canvasBytes(canvas, format === 'png' ? 'image/png' : 'image/jpeg', JPEG_QUALITY)
    return { data, width: canvas.width, height: canvas.height }
  } finally {
    canvas.width = 0
    page.cleanup()
  }
}

/**
 * Asks which pages, then saves them as pictures: one page as a picture file, several in one ZIP,
 * which a phone's save screen and a school computer both take as a single file.
 */
export async function savePagesAsImages(pdf: PDFDocumentProxy, file: PdfFile, current: number, platform: Platform): Promise<void> {
  const choice = await askImageExport(current, pdf.numPages)
  if (!choice) return
  const { pages, format, dpi } = choice
  const base = file.name.replace(/\.pdf$/i, '')
  const work = startWork('Görseller hazırlanıyor')
  const entries: ZipEntry[] = []
  try {
    for (const [done, number] of pages.entries()) {
      if (work.cancelled) return
      work.progress(`${done + 1} / ${pages.length}`)
      const { data } = await renderPageImage(pdf, number, { dpi, format })
      entries.push({ name: `${base} - sayfa ${number}.${format}`, data })
    }
  } catch (error) {
    console.error(error)
    showToast('Görseller hazırlanamadı.')
    return
  } finally {
    work.done()
  }
  try {
    const saved = entries.length === 1
      ? await platform.saveFile(entries[0].name, entries[0].data, file, format === 'png' ? PNG_TYPE : JPEG_TYPE)
      : await platform.saveFile(`${base} (görseller).zip`, zip(entries), file, ZIP_TYPE)
    if (saved !== null) showToast(`Kaydedildi: ${saved}`)
  } catch (error) {
    if (error instanceof SameFileError) showToast('Açık bir belgenin üzerine kaydedilemez; başka bir ad seçin.')
    else {
      console.error(error)
      showToast('Kaydedilemedi.')
    }
  }
}
