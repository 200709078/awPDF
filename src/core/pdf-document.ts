import './pdfjs-global'
import { getDocument, PasswordException, PDFDataRangeTransport, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PdfFile } from './pdf-file'

class FileRangeTransport extends PDFDataRangeTransport {
  constructor(private readonly file: PdfFile, private readonly fail: (reason: unknown) => void) {
    super(file.size, new Uint8Array())
  }

  override requestDataRange(begin: number, end: number): void {
    this.file.read(begin, end).then(chunk => this.onDataRange(begin, chunk), this.fail)
  }
}

const assetUrl = (folder: string) => new URL(`pdfjs/${folder}/`, document.baseURI).href

export { PasswordException }

/** Opens a PDF without reading it whole. A PDF's own scripts and XFA forms never run. */
export async function loadPdf(file: PdfFile): Promise<PDFDocumentProxy> {
  let reject: (reason: unknown) => void = () => undefined
  const failed = new Promise<never>((_, fail) => { reject = fail })
  const task = getDocument({
    range: new FileRangeTransport(file, reason => reject(reason)),
    disableAutoFetch: true,
    disableStream: true,
    enableXfa: false,
    cMapUrl: assetUrl('cmaps'),
    iccUrl: assetUrl('iccs'),
    standardFontDataUrl: assetUrl('standard_fonts'),
    wasmUrl: assetUrl('wasm'),
  })
  try {
    return await Promise.race([task.promise, failed])
  } catch (error) {
    void task.destroy()
    throw error
  }
}
