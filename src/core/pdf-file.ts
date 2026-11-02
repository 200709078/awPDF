/**
 * A PDF the app can read piece by piece, wherever it lives. Files are never loaded whole, so a
 * large book costs only the parts on screen; each platform supplies its own `read`.
 */
export interface PdfFile {
  readonly name: string
  readonly size: number
  /** Bytes from `begin` up to, not including, `end`. */
  read(begin: number, end: number): Promise<Uint8Array>
  /** How the platform finds this file again; absent where it cannot. */
  readonly source?: string
  /** Lets go of the file when its document closes. */
  close?(): void
}

export function pdfFileFromBlob(file: File): PdfFile {
  return {
    name: file.name,
    size: file.size,
    read: async (begin, end) => new Uint8Array(await file.slice(begin, end).arrayBuffer()),
  }
}
