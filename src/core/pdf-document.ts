import './pdfjs-global'
import { getDocument, PasswordResponses, PDFDataRangeTransport, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
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

/** Where pdf.js finds its character maps, colour profiles, standard fonts and decoders (in the app). */
export function pdfAssets() {
  return {
    cMapUrl: assetUrl('cmaps'),
    iccUrl: assetUrl('iccs'),
    standardFontDataUrl: assetUrl('standard_fonts'),
    wasmUrl: assetUrl('wasm'),
  }
}

/** The reader declined to give a password; there is nothing to report. */
export class OpenCancelled extends Error {}

/**
 * Opens a PDF without reading it whole. A PDF's own scripts and XFA forms never run. `askPassword`
 * answers null to give up; the password goes to pdf.js and is kept nowhere else.
 */
export async function loadPdf(file: PdfFile, askPassword: (wasWrong: boolean) => Promise<string | null>): Promise<PDFDocumentProxy> {
  let reject: (reason: unknown) => void = () => undefined
  const failed = new Promise<never>((_, fail) => { reject = fail })
  const task = getDocument({
    range: new FileRangeTransport(file, reason => reject(reason)),
    disableAutoFetch: true,
    disableStream: true,
    enableXfa: false,
    ...pdfAssets(),
  })
  task.onPassword = (answer: (password: string) => void, reason: number) => {
    void askPassword(reason === PasswordResponses.INCORRECT_PASSWORD).then(password => {
      if (password === null) reject(new OpenCancelled())
      else answer(password)
    })
  }
  try {
    return await Promise.race([task.promise, failed])
  } catch (error) {
    void task.destroy()
    throw error
  }
}
