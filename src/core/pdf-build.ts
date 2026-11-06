import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PlannedPage } from './page-plan'
import { rotatePages } from './pdf-rotate'

/**
 * Writes a new PDF from planned pages. pdf.js copies the pages, with the open document's filled
 * form fields; it cannot turn them, so `rotatePages` sets the rotations afterwards. pdf.js keeps
 * the open document's password when only its pages are used and writes a joined file without
 * one. `others` are the added files, unencrypted, by source number - 1.
 */
export async function buildPdf(primary: PDFDocumentProxy, others: readonly Uint8Array[], pages: readonly PlannedPage[]): Promise<Uint8Array> {
  if (pages.length === 0) throw new Error('Boş belge kaydedilemez.')
  const sources = [...new Set(pages.map(page => page.source))]
  // pdf.js keeps a source's pages in their own order and places them by `pageIndices`.
  const bytes = await primary.extractPages(sources.map(source => {
    const indices = [...new Set(pages.filter(page => page.source === source).map(page => page.index))].sort((a, b) => a - b)
    return {
      document: source === 0 ? null : others[source - 1],
      includePages: indices,
      pageIndices: indices.map(index => pages.findIndex(page => page.source === source && page.index === index)),
    }
  }))
  return pages.some(page => page.rotation !== 0) ? rotatePages(bytes, pages.map(page => page.rotation)) : bytes
}

/** Whether the file has a password. */
export async function isEncrypted(pdf: PDFDocumentProxy): Promise<boolean> {
  const { info } = await pdf.getMetadata()
  return Boolean((info as { EncryptFilterName?: string }).EncryptFilterName)
}

/** "ders.pdf" with " (düzenlendi)" becomes "ders (düzenlendi).pdf". */
export function nameWithSuffix(name: string, suffix: string): string {
  const base = name.replace(/\.pdf$/i, '')
  return `${base} (${suffix}).pdf`
}

/**
 * A one-page PDF with nothing on it. Joined after a file's own pages it makes pdf.js write that
 * file without its password; the extra page is never used.
 */
export function blankPdf(): Uint8Array {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>',
  ]
  let text = '%PDF-1.7\n'
  const offsets = objects.map((body, index) => {
    const offset = text.length
    text += `${index + 1} 0 obj\n${body}\nendobj\n`
    return offset
  })
  const rows = offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  text += `xref\n0 4\n0000000000 65535 f \n${rows}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${text.length}\n%%EOF\n`
  return new TextEncoder().encode(text)
}
