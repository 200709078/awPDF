/** How a picture sits on its page: on A4 with a 1 cm margin, on A4 edge to edge, or on a page of its own size. */
export type ImagePageSize = 'a4' | 'a4-full' | 'image'

/** A JPEG as the PDF takes it: the file itself, which the PDF carries unchanged. */
export interface JpegImage {
  readonly data: Uint8Array
  readonly width: number
  readonly height: number
  /** For a page of the picture's own size: its resolution, 96 when not given (a screen's). */
  readonly dpi?: number
}

const A4 = { short: 595.28, long: 841.89 }
const MARGIN = 28.35
/** A picture of its own size is laid out as a screen shows it, 96 pixels to the inch. */
const POINTS_PER_PIXEL = 72 / 96
/** PDF readers refuse pages longer than 200 inches. */
const MAX_PAGE_SIDE = 14400

/**
 * A PDF with one picture on each page. On A4 the page turns sideways for a wide picture, and the
 * picture is made as large as fits and centred. The JPEG goes in as it is (`DCTDecode`).
 */
export function imagesToPdf(images: readonly JpegImage[], size: ImagePageSize): Uint8Array {
  if (images.length === 0) throw new Error('Görsel yok.')
  const writer = new PdfWriter()
  const pagesId = 2
  const pageIds: number[] = []
  let nextId = 3
  for (const [index, image] of images.entries()) {
    const [pageId, contentId, imageId] = [nextId, nextId + 1, nextId + 2]
    nextId += 3
    pageIds.push(pageId)
    const { pageWidth, pageHeight, x, y, width, height } = layout(image, size)
    const content = `q ${num(width)} 0 0 ${num(height)} ${num(x)} ${num(y)} cm /Im${index} Do Q`
    writer.object(pageId, `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(pageWidth)} ${num(pageHeight)}] `
      + `/Resources << /XObject << /Im${index} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`)
    writer.stream(contentId, '', ascii(content))
    writer.stream(imageId, `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} `
      + '/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode', image.data)
  }
  writer.object(1, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`)
  writer.object(pagesId, `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`)
  return writer.finish(1)
}

function layout({ width, height, dpi }: JpegImage, size: ImagePageSize) {
  if (size === 'image') {
    const scale = Math.min(dpi ? 72 / dpi : POINTS_PER_PIXEL, MAX_PAGE_SIDE / Math.max(width, height))
    const [pageWidth, pageHeight] = [width * scale, height * scale]
    return { pageWidth, pageHeight, x: 0, y: 0, width: pageWidth, height: pageHeight }
  }
  const wide = width > height
  const [pageWidth, pageHeight] = wide ? [A4.long, A4.short] : [A4.short, A4.long]
  const margin = size === 'a4' ? MARGIN : 0
  const scale = Math.min((pageWidth - 2 * margin) / width, (pageHeight - 2 * margin) / height)
  const [drawnWidth, drawnHeight] = [width * scale, height * scale]
  return { pageWidth, pageHeight, x: (pageWidth - drawnWidth) / 2, y: (pageHeight - drawnHeight) / 2, width: drawnWidth, height: drawnHeight }
}

const num = (value: number) => String(Math.round(value * 100) / 100)
const ascii = (text: string) => new TextEncoder().encode(text)

/** Writes objects in any order and the cross-reference table at the end. */
class PdfWriter {
  private readonly parts: Uint8Array[] = [ascii('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')]
  private length = this.parts[0].length
  private readonly offsets = new Map<number, number>()

  object(id: number, body: string): void {
    this.offsets.set(id, this.length)
    this.add(ascii(`${id} 0 obj\n${body}\nendobj\n`))
  }

  stream(id: number, dictionary: string, data: Uint8Array): void {
    this.offsets.set(id, this.length)
    this.add(ascii(`${id} 0 obj\n<< ${dictionary} /Length ${data.length} >>\nstream\n`))
    this.add(data)
    this.add(ascii('\nendstream\nendobj\n'))
  }

  finish(rootId: number): Uint8Array {
    const size = Math.max(...this.offsets.keys()) + 1
    const rows = Array.from({ length: size - 1 }, (_, index) => {
      const offset = this.offsets.get(index + 1)
      return offset === undefined ? '0000000000 65535 f \n' : `${String(offset).padStart(10, '0')} 00000 n \n`
    }).join('')
    const start = this.length
    this.add(ascii(`xref\n0 ${size}\n0000000000 65535 f \n${rows}trailer\n<< /Size ${size} /Root ${rootId} 0 R >>\nstartxref\n${start}\n%%EOF\n`))
    const result = new Uint8Array(this.length)
    let offset = 0
    for (const part of this.parts) {
      result.set(part, offset)
      offset += part.length
    }
    return result
  }

  private add(part: Uint8Array): void {
    this.parts.push(part)
    this.length += part.length
  }
}
