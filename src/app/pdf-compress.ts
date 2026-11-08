import type { PDFDict, PDFObject, PDFRawStream, PDFRef } from 'pdf-lib'
import { canvasBytes } from './images'

/**
 * How much a PDF is made smaller: pictures larger than `maxSide` pixels are scaled down to it and
 * written again as JPEG at `quality`. A4's long side is 3508 px at 300 DPI, 1754 at 150, 1170 at 100.
 */
export interface CompressLevel {
  readonly maxSide: number
  readonly quality: number
}

export const COMPRESS_LEVELS = {
  light: { maxSide: 2480, quality: 0.8 },
  medium: { maxSide: 1754, quality: 0.7 },
  strong: { maxSide: 1170, quality: 0.55 },
} as const satisfies Record<string, CompressLevel>

export type CompressLevelName = keyof typeof COMPRESS_LEVELS

export interface CompressResult {
  data: Uint8Array
  /** Pictures in the file, and how many of them were written smaller. */
  images: number
  changed: number
}

/** Pictures smaller than this are left alone: icons and logos gain nothing. */
const MIN_SIDE = 96
const MIN_BYTES = 16 * 1024
/** A new picture must save at least this share of the old one's bytes, or the old one stays. */
const MIN_GAIN = 0.1

export class CompressCancelled extends Error {}

type PdfLib = typeof import('pdf-lib')

interface Picture {
  width: number
  height: number
  /** Gray or colour; other colour spaces are left alone. */
  components: 1 | 3
  /** JPEG bytes, or 8-bit samples to be inflated. */
  kind: 'jpeg' | 'flate'
  hasSoftMask: boolean
}

/** The filters as a list of names, such as ["/DCTDecode"]. */
function filters(lib: PdfLib, dict: PDFDict): string[] {
  const filter = dict.lookup(lib.PDFName.of('Filter'))
  if (filter instanceof lib.PDFName) return [filter.toString()]
  if (filter instanceof lib.PDFArray) return filter.asArray().map(item => String(item))
  return []
}

/** Gray (1) or RGB (3), directly or through an ICC profile; null for anything else. */
function components(lib: PdfLib, dict: PDFDict): 1 | 3 | null {
  const space = dict.lookup(lib.PDFName.of('ColorSpace'))
  const name = space instanceof lib.PDFName ? space.toString()
    : space instanceof lib.PDFArray && space.size() === 2 ? String(space.lookup(0)) : null
  if (name === '/DeviceGray' || name === '/CalGray') return 1
  if (name === '/DeviceRGB' || name === '/CalRGB') return 3
  if (name === '/ICCBased' && space instanceof lib.PDFArray) {
    const profile = space.lookup(1)
    const count = profile instanceof lib.PDFRawStream ? profile.dict.lookup(lib.PDFName.of('N')) : null
    const value = count instanceof lib.PDFNumber ? count.asNumber() : 0
    return value === 1 || value === 3 ? value : null
  }
  return null
}

/**
 * What can be written again safely: a JPEG, or plain 8-bit samples in one Flate stream, gray or
 * RGB, with no colour-key mask, no decode array and no predictor. Masks, CMYK, 16-bit, JBIG2,
 * JPEG 2000 and the rest stay exactly as they are.
 */
function pictureOf(lib: PdfLib, stream: PDFRawStream): Picture | null {
  const { dict } = stream
  const { PDFName, PDFNumber, PDFBool } = lib
  if (dict.lookup(PDFName.of('Subtype')) !== PDFName.of('Image')) return null
  if (dict.lookup(PDFName.of('ImageMask')) === PDFBool.True) return null
  if (dict.has(PDFName.of('Mask')) || dict.has(PDFName.of('Decode'))) return null
  const width = dict.lookup(PDFName.of('Width'))
  const height = dict.lookup(PDFName.of('Height'))
  if (!(width instanceof PDFNumber) || !(height instanceof PDFNumber)) return null
  const colours = components(lib, dict)
  if (!colours) return null
  const list = filters(lib, dict)
  const bits = dict.lookup(PDFName.of('BitsPerComponent'))
  let kind: Picture['kind']
  if (list.length === 1 && list[0] === '/DCTDecode') kind = 'jpeg'
  else if (list.length === 1 && list[0] === '/FlateDecode' && bits instanceof PDFNumber && bits.asNumber() === 8) {
    const parms = dict.lookup(PDFName.of('DecodeParms'))
    const predictor = parms instanceof lib.PDFDict ? parms.lookup(PDFName.of('Predictor')) : null
    if (predictor instanceof PDFNumber && predictor.asNumber() > 1) return null
    kind = 'flate'
  } else return null
  return { width: width.asNumber(), height: height.asNumber(), components: colours, kind, hasSoftMask: dict.has(PDFName.of('SMask')) }
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** The picture drawn at its new size on a canvas, or null when it cannot be read. */
async function drawn(picture: Picture, data: Uint8Array, width: number, height: number): Promise<HTMLCanvasElement | null> {
  let source: ImageBitmap
  if (picture.kind === 'jpeg') {
    source = await createImageBitmap(new Blob([data as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }))
  } else {
    if (typeof DecompressionStream === 'undefined') return null
    const samples = await inflate(data)
    const count = picture.width * picture.height
    if (samples.length < count * picture.components) return null
    const pixels = new ImageData(picture.width, picture.height)
    for (let index = 0, from = 0; index < count; index += 1, from += picture.components) {
      const to = index * 4
      pixels.data[to] = samples[from]
      pixels.data[to + 1] = samples[from + (picture.components === 3 ? 1 : 0)]
      pixels.data[to + 2] = samples[from + (picture.components === 3 ? 2 : 0)]
      pixels.data[to + 3] = 255
    }
    source = await createImageBitmap(pixels)
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')!
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, width, height)
  source.close()
  return canvas
}

/**
 * A smaller copy of a PDF: its pictures scaled down and written again as JPEG; text, drawings,
 * fonts, the outline and form fields stay as they are, so the text can still be selected and
 * searched. The PDF must have no password (pdf-lib cannot write encrypted files).
 */
export async function compressPdf(bytes: Uint8Array, level: CompressLevel, progress: (done: number, total: number) => void,
  isCancelled: () => boolean, { dropLastPage = false } = {}): Promise<CompressResult> {
  const lib = await import('pdf-lib')
  const { PDFName, PDFRawStream } = lib
  const document = await lib.PDFDocument.load(bytes, { updateMetadata: false })
  // The blank page joined to take a password off (`blankPdf`).
  if (dropLastPage) document.removePage(document.getPageCount() - 1)
  const pictures: [PDFRef, PDFRawStream, Picture][] = []
  for (const [ref, object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue
    const picture = pictureOf(lib, object)
    if (picture) pictures.push([ref, object, picture])
  }
  let changed = 0
  for (const [index, [ref, stream, picture]] of pictures.entries()) {
    if (isCancelled()) throw new CompressCancelled()
    progress(index, pictures.length)
    const longest = Math.max(picture.width, picture.height)
    if (longest < MIN_SIDE || stream.contents.length < MIN_BYTES) continue
    // A soft mask keeps its own size, so the picture under it does too.
    const scale = picture.hasSoftMask ? 1 : Math.min(1, level.maxSide / longest)
    const width = Math.max(1, Math.round(picture.width * scale))
    const height = Math.max(1, Math.round(picture.height * scale))
    try {
      const canvas = await drawn(picture, stream.contents, width, height)
      if (!canvas) continue
      const jpeg = canvasBytes(canvas, 'image/jpeg', level.quality)
      canvas.width = canvas.height = 0
      if (jpeg.length > stream.contents.length * (1 - MIN_GAIN)) continue
      const replacement = document.context.stream(jpeg, {
        Type: 'XObject',
        Subtype: 'Image',
        Width: width,
        Height: height,
        ColorSpace: 'DeviceRGB',
        BitsPerComponent: 8,
        Filter: 'DCTDecode',
      })
      for (const key of ['SMask', 'Intent', 'Interpolate', 'OC', 'Metadata', 'StructParent']) {
        const value: PDFObject | undefined = stream.dict.get(PDFName.of(key))
        if (value) replacement.dict.set(PDFName.of(key), value)
      }
      document.context.assign(ref, replacement)
      changed += 1
    } catch (error) {
      // One picture that cannot be read stays as it was.
      console.warn('Görsel küçültülemedi:', error)
    }
    // Lets the progress show and a cancel come in between pictures.
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  progress(pictures.length, pictures.length)
  const data = await document.save({ useObjectStreams: true, updateFieldAppearances: false })
  return { data, images: pictures.length, changed }
}

