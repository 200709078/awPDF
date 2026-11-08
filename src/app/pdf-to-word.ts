import { AnnotationMode, getDocument, OPS, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { Paragraph as DocxParagraph } from 'docx'
import { fontStyle, glyphBox, layoutPage, type Block, type Box, type Glyphs, type Graphic, type Line, type PageLayout, type Region, type Run, type TextStyle } from '../core/page-layout'
import { pdfAssets } from '../core/pdf-document'
import { canvasBytes } from './images'

/**
 * PDF → Word, on the device: the text becomes editable text (lines into paragraphs, bold, italic,
 * size, raised and lowered, two columns), and what is not plain text (photos, drawings, tables,
 * formulas) is cut from the page as a picture and put where it was. The `docx` library writes
 * the file. A scan without a text layer becomes pictures only.
 */

export class WordCancelled extends Error {}

/** Pictures are cut from the page drawn at this many pixels per point (144 DPI). */
const PICTURE_SCALE = 2
const PHOTO_QUALITY = 0.85

type Matrix = [number, number, number, number, number, number]

const multiply = (m: Matrix, n: ArrayLike<number>): Matrix => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
]

function boxOf(m: Matrix, x0: number, y0: number, x1: number, y1: number): Box {
  const xs: number[] = []
  const ys: number[] = []
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
    xs.push(m[0] * x + m[2] * y + m[4])
    ys.push(m[1] * x + m[3] * y + m[5])
  }
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

interface DrawState {
  ctm: Matrix
  fill: string
  lineWidth: number
}

const IMAGE_OPS: ReadonlySet<number> = new Set([
  OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject,
  OPS.paintImageXObjectRepeat, OPS.paintImageMaskXObjectRepeat, OPS.paintSolidColorImageMask,
].filter(op => op !== undefined))
const STROKE_ONLY: ReadonlySet<number> = new Set([OPS.stroke, OPS.closeStroke])
const FILL_AND_STROKE: ReadonlySet<number> = new Set([OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke])

/** Where the page draws pictures and shapes, from pdf.js's list of drawing operations. */
function graphicsOf(fnArray: number[], argsArray: unknown[][], view: Matrix): Graphic[] {
  const graphics: Graphic[] = []
  let state: DrawState = { ctm: view, fill: '#000000', lineWidth: 1 }
  const stack: DrawState[] = []
  const push = () => stack.push({ ...state })
  const pop = () => { state = stack.pop() ?? state }
  for (let index = 0; index < fnArray.length; index += 1) {
    const op = fnArray[index]
    const args = argsArray[index] ?? []
    if (op === OPS.save) push()
    else if (op === OPS.restore) pop()
    else if (op === OPS.transform) state.ctm = multiply(state.ctm, args as number[])
    else if (op === OPS.paintFormXObjectBegin) {
      push()
      const matrix = args[0] as ArrayLike<number> | null
      if (matrix && matrix.length === 6) state.ctm = multiply(state.ctm, matrix)
    } else if (op === OPS.paintFormXObjectEnd) pop()
    else if (op === OPS.beginGroup) {
      push()
      const matrix = (args[0] as { matrix?: ArrayLike<number> } | undefined)?.matrix
      if (matrix && matrix.length === 6) state.ctm = multiply(state.ctm, matrix)
    } else if (op === OPS.endGroup) pop()
    else if (op === OPS.setFillRGBColor) state.fill = String(args[0])
    else if (op === OPS.setLineWidth) state.lineWidth = Number(args[0]) || 0
    else if (op === OPS.constructPath) {
      const [paint, , minMax] = args as [number, unknown, ArrayLike<number> | null]
      if (paint === OPS.endPath || !minMax || minMax.length < 4) continue
      const strokes = STROKE_ONLY.has(paint) || FILL_AND_STROKE.has(paint)
      // White fills cover; they are backgrounds and masks, not drawings.
      if (!strokes && /^#f{6}$/i.test(state.fill)) continue
      const pad = strokes ? state.lineWidth / 2 : 0
      graphics.push({ kind: 'path', box: boxOf(state.ctm, minMax[0] - pad, minMax[1] - pad, minMax[2] + pad, minMax[3] + pad) })
    } else if (IMAGE_OPS.has(op)) {
      graphics.push({ kind: 'image', box: boxOf(state.ctm, 0, 0, 1, 1) })
    }
  }
  return graphics
}

interface TextItemLike {
  str: string
  transform: number[]
  width: number
  height: number
  fontName: string
}

/** The page's text runs, and the box of each that is not horizontal (it goes into a picture). */
function glyphsOf(page: PDFPageProxy, items: readonly TextItemLike[], view: Matrix): { glyphs: Glyphs[]; turned: Graphic[] } {
  const styles = new Map<string, TextStyle>()
  const styleOf = (fontName: string): TextStyle => {
    let style = styles.get(fontName)
    if (!style) {
      const font = page.commonObjs.has(fontName) ? page.commonObjs.get(fontName) as { name?: string; fallbackName?: string } : null
      style = fontStyle(font?.name, font?.fallbackName ?? 'sans-serif')
      styles.set(fontName, style)
    }
    return style
  }
  const glyphs: Glyphs[] = []
  const turned: Graphic[] = []
  for (const item of items) {
    if (!item.str || !item.transform) continue
    const m = multiply(view, item.transform)
    const size = Math.hypot(m[2], m[3])
    if (size <= 0) continue
    const flat = Math.abs(m[1]) < Math.abs(m[0]) * 0.01 && Math.abs(m[2]) < Math.abs(m[3]) * 0.01 && m[0] > 0 && m[3] < 0
    if (flat) {
      glyphs.push({ text: item.str, x: m[4], y: m[5], size, width: item.width, style: styleOf(item.fontName) })
    } else if (item.str.trim()) {
      // Text set at an angle (a stamp, a margin note) is kept as it looks.
      const [a, b, c, d, e, f] = item.transform
      const along = Math.hypot(a, b) || 1
      const up = Math.hypot(c, d) || 1
      const corners = [[0, 0], [item.width, 0], [0, item.height], [item.width, item.height]]
        .map(([u, v]) => [e + (a / along) * u + (c / up) * v, f + (b / along) * u + (d / up) * v])
      const xs = corners.map(([x, y]) => view[0] * x + view[2] * y + view[4])
      const ys = corners.map(([x, y]) => view[1] * x + view[3] * y + view[5])
      turned.push({ kind: 'path', box: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) } })
    }
  }
  return { glyphs, turned }
}

/** A thin line just under a run is its underline: the run is underlined and the line goes. */
function takeUnderlines(glyphs: Glyphs[], graphics: Graphic[]): Graphic[] {
  return graphics.filter(graphic => {
    const { box } = graphic
    if (graphic.kind !== 'path' || box.y1 - box.y0 > 1.6 || box.x1 - box.x0 < 4) return true
    const under = glyphs.find(item => box.y0 >= item.y - 1 && box.y0 <= item.y + item.size * 0.35
      && box.x0 >= item.x - 2 && box.x1 <= item.x + item.width + 2)
    if (!under) return true
    under.underline = true
    return false
  })
}

export interface WordPage {
  layout: PageLayout
  /** Each region's picture, cut from the page. */
  pictures: Map<Region, { data: Uint8Array; type: 'png' | 'jpg' }>
}

/** The page drawn at the pictures' resolution; without its text when `textless` (for a background). */
async function drawPage(page: PDFPageProxy, textless = false): Promise<HTMLCanvasElement> {
  const drawn = page.getViewport({ scale: PICTURE_SCALE })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(drawn.width)
  canvas.height = Math.ceil(drawn.height)
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  // pdf.js draws the PDF's own fonts with fillText; without it the page is its pictures and shapes.
  if (textless) context.fillText = context.strokeText = () => undefined
  await page.render({ canvas, canvasContext: context, viewport: drawn, annotationMode: AnnotationMode.ENABLE }).promise
  return canvas
}

/**
 * A run's colour as drawn: within its box, the colour farthest from the box's most common one
 * (the ground). Near-black is left as the default.
 */
function colorOf(context: CanvasRenderingContext2D, glyphs: Glyphs): string | undefined {
  const box = glyphBox(glyphs)
  const x = Math.max(0, Math.floor(box.x0 * PICTURE_SCALE))
  const y = Math.max(0, Math.floor(box.y0 * PICTURE_SCALE))
  const w = Math.min(context.canvas.width - x, Math.ceil((box.x1 - box.x0) * PICTURE_SCALE))
  const h = Math.min(context.canvas.height - y, Math.ceil((box.y1 - box.y0) * PICTURE_SCALE))
  if (w < 1 || h < 1) return undefined
  const data = context.getImageData(x, y, w, h).data
  const counts = new Map<number, number>()
  for (let index = 0; index < data.length; index += 4) {
    const key = (data[index] >> 4) << 8 | (data[index + 1] >> 4) << 4 | data[index + 2] >> 4
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const ground = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const [gr, gg, gb] = [(ground >> 8) * 17, (ground >> 4 & 15) * 17, (ground & 15) * 17]
  let best = -1
  let color = [0, 0, 0]
  for (let index = 0; index < data.length; index += 4) {
    const distance = Math.abs(data[index] - gr) + Math.abs(data[index + 1] - gg) + Math.abs(data[index + 2] - gb)
    if (distance > best) {
      best = distance
      color = [data[index], data[index + 1], data[index + 2]]
    }
  }
  if (best < 90 || color.every(channel => channel < 70)) return undefined
  return `#${color.map(channel => channel.toString(16).padStart(2, '0')).join('')}`
}

function cutOut(canvas: HTMLCanvasElement, region: Region): { data: Uint8Array; type: 'png' | 'jpg' } | null {
  const x0 = Math.max(0, Math.floor((region.box.x0 - 1) * PICTURE_SCALE))
  const y0 = Math.max(0, Math.floor((region.box.y0 - 1) * PICTURE_SCALE))
  const x1 = Math.min(canvas.width, Math.ceil((region.box.x1 + 1) * PICTURE_SCALE))
  const y1 = Math.min(canvas.height, Math.ceil((region.box.y1 + 1) * PICTURE_SCALE))
  if (x1 - x0 < 2 || y1 - y0 < 2) return null
  const cut = document.createElement('canvas')
  cut.width = x1 - x0
  cut.height = y1 - y0
  cut.getContext('2d')!.drawImage(canvas, x0, y0, cut.width, cut.height, 0, 0, cut.width, cut.height)
  const type = region.photo ? 'jpg' : 'png'
  const data = canvasBytes(cut, type === 'jpg' ? 'image/jpeg' : 'image/png', PHOTO_QUALITY)
  cut.width = cut.height = 0
  return { data, type }
}

/** One page read: its layout (with the text's colours) and its pictures. */
async function readPage(page: PDFPageProxy): Promise<WordPage> {
  const viewport = page.getViewport({ scale: 1 })
  const view = viewport.transform as Matrix
  const operators = await page.getOperatorList()
  const text = await page.getTextContent()
  const { glyphs, turned } = glyphsOf(page, text.items as TextItemLike[], view)
  const graphics = takeUnderlines(glyphs, [...graphicsOf(operators.fnArray, operators.argsArray, view), ...turned])
  const canvas = await drawPage(page)
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  for (const item of glyphs) item.color = colorOf(context, item)
  const layout = layoutPage(glyphs, graphics, { width: viewport.width, height: viewport.height })
  const regions = layout.framed ? layout.framed.pictures
    : [...layout.before, ...layout.columns.flat(), ...layout.after].flatMap(regionsOf)
  const pictures = new Map<Region, { data: Uint8Array; type: 'png' | 'jpg' }>()
  for (const region of regions) {
    const made = cutOut(canvas, region)
    if (made) pictures.set(region, made)
  }
  // A background is cut from the page drawn without its text, which goes on top in frames.
  if (layout.framed && layout.framed.backgrounds.length > 0) {
    const bare = await drawPage(page, true)
    for (const region of layout.framed.backgrounds) {
      const made = cutOut(bare, region)
      if (made) pictures.set(region, made)
    }
    bare.width = bare.height = 0
  }
  canvas.width = canvas.height = 0
  page.cleanup()
  return { layout, pictures }
}

function regionsOf(block: Block): Region[] {
  if (block.kind === 'pictures') return block.regions
  return block.lines.flatMap(line => line.parts.flatMap(part => (part.kind === 'picture' ? [part.region] : [])))
}

/** Twentieths of a point, Word's unit for page and paragraph measures. */
const twips = (points: number) => Math.max(0, Math.round(points * 20))
/** docx sizes pictures in pixels at 96 per inch. */
const pixels = (points: number) => Math.max(1, Math.round(points * 96 / 72))

type Docx = typeof import('docx')

/** One page's blocks as Word paragraphs, measured from the column's left edge. */
function paragraphs(docx: Docx, blocks: readonly Block[], column: Box, page: WordPage, startAt: number): DocxParagraph[] {
  const { Paragraph, TextRun, ImageRun, AlignmentType, LineRuleType } = docx
  const result: DocxParagraph[] = []
  let bottom = startAt
  const picture = (region: Region) => {
    const made = page.pictures.get(region)
    if (!made) return null
    return new ImageRun({
      type: made.type,
      data: made.data,
      transformation: { width: pixels(region.box.x1 - region.box.x0 + 2), height: pixels(region.box.y1 - region.box.y0 + 2) },
    })
  }
  for (const block of blocks) {
    const before = Math.min(twips(block.top - bottom), 20 * 400)
    bottom = block.bottom
    if (block.kind === 'pictures') {
      const children = block.regions.flatMap((region, index) => {
        const image = picture(region)
        const gap = index > 0 ? [new TextRun({ text: '   ' })] : []
        return image ? [...gap, image] : []
      })
      if (children.length > 0) {
        result.push(new Paragraph({ children, spacing: { before, after: 0 }, indent: { left: twips(block.left - column.x0) } }))
      }
      continue
    }
    const children = runsOf(docx, block, picture)
    const first = block.lines[0]
    const indentLeft = block.left - column.x0
    const firstLine = block.lines.length > 1 ? first.x0 - block.left : 0
    result.push(new Paragraph({
      children,
      alignment: block.align === 'center' ? AlignmentType.CENTER : block.align === 'right' ? AlignmentType.RIGHT
        : block.align === 'justify' ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
      indent: block.align === 'center' || block.align === 'right' ? undefined
        : { left: twips(indentLeft), ...(firstLine >= 0 ? { firstLine: twips(firstLine) } : { hanging: twips(-firstLine) }) },
      spacing: { before, after: 0, line: twips(Math.max(block.lineGap, first.size)), lineRule: LineRuleType.AT_LEAST },
    }))
  }
  return result
}

/** A picture of the page as an inline Word picture, or null when it could not be cut out. */
function inlinePicture(docx: Docx, page: WordPage, region: Region) {
  const made = page.pictures.get(region)
  if (!made) return null
  return new docx.ImageRun({
    type: made.type,
    data: made.data,
    transformation: { width: pixels(region.box.x1 - region.box.x0 + 2), height: pixels(region.box.y1 - region.box.y0 + 2) },
  })
}

type ParagraphChildren = (InstanceType<Docx['TextRun']> | InstanceType<Docx['ImageRun']>)[]

/**
 * A paragraph's lines as Word runs. They are plain pieces first: a word broken with a hyphen at
 * the end of a line is made whole again, other lines join with a space.
 */
function runsOf(docx: Docx, block: Extract<Block, { kind: 'paragraph' }>, picture: (region: Region) => InstanceType<Docx['ImageRun']> | null): ParagraphChildren {
  type Piece = { text: string; run: Run; lineSize: number } | { region: Region }
  const pieces: Piece[] = []
  block.lines.forEach((line: Line, index) => {
    line.parts.forEach((part, partIndex) => {
      if (part.kind === 'picture') {
        pieces.push({ region: part.region })
        return
      }
      let { text } = part.run
      const previous = pieces.at(-1)
      if (index > 0 && partIndex === 0 && previous && 'text' in previous) {
        if (/\p{Ll}-$/u.test(previous.text) && /^\p{Ll}/u.test(text)) previous.text = previous.text.slice(0, -1)
        else if (!previous.text.endsWith(' ') && !text.startsWith(' ')) text = ` ${text}`
      }
      pieces.push({ text, run: part.run, lineSize: line.size })
    })
  })
  return pieces.flatMap((piece): ParagraphChildren => {
    if ('region' in piece) {
      const image = picture(piece.region)
      return image ? [image] : []
    }
    const { run } = piece
    const raised = run.position !== 'normal'
    return [new docx.TextRun({
      text: piece.text,
      bold: run.style.bold,
      italics: run.style.italic,
      font: run.style.family,
      size: Math.max(2, Math.round((raised ? piece.lineSize : run.size) * 2)),
      superScript: run.position === 'super',
      subScript: run.position === 'sub',
      underline: run.underline ? {} : undefined,
      color: run.color?.slice(1),
    })]
  })
}

const measure = document.createElement('canvas').getContext('2d')!

/**
 * A frame's text in the font this device would use for it (the PDF's own font is often missing
 * here and in Word too): when it comes out wider than in the PDF, its size is scaled down so the
 * lines fit their places, down to 40 % (a condensed display font is half as wide as Arial).
 */
function fitFonts(block: Extract<Block, { kind: 'paragraph' }>): void {
  let factor = 1
  for (const line of block.lines) {
    let wide = 0
    for (const part of line.parts) {
      if (part.kind !== 'text') continue
      const { run } = part
      measure.font = `${run.style.italic ? 'italic ' : ''}${run.style.bold ? 'bold ' : ''}${run.size}px "${run.style.family}", sans-serif`
      wide += measure.measureText(run.text).width
    }
    const room = line.x1 - line.x0
    if (wide > room * 1.02 && room > 0) factor = Math.min(factor, room / wide)
  }
  factor = Math.max(0.4, factor)
  if (factor >= 1) return
  for (const line of block.lines) {
    line.size *= factor
    for (const part of line.parts) if (part.kind === 'text') part.run.size *= factor
  }
}

/** EMUs, the unit of a floating picture's place: 12700 to a point. */
const emu = (points: number) => Math.round(points * 12700)

/**
 * A designed page as it looks: its background behind, its pictures where they are (floating,
 * anchored to the page), and each block of text in a frame at its place. The text stays text,
 * and the page stays one page.
 */
function framedPage(docx: Docx, page: WordPage): DocxParagraph[] {
  const { Paragraph, ImageRun, AlignmentType, LineRuleType, FrameAnchorType, HeightRule, HorizontalPositionRelativeFrom,
    VerticalPositionRelativeFrom, TextWrappingType } = docx
  const framed = page.layout.framed!
  const floating = (region: Region, behind: boolean) => {
    const made = page.pictures.get(region)
    if (!made) return []
    return [new ImageRun({
      type: made.type,
      data: made.data,
      transformation: { width: pixels(region.box.x1 - region.box.x0 + 2), height: pixels(region.box.y1 - region.box.y0 + 2) },
      floating: {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: emu(region.box.x0 - 1) },
        verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: emu(region.box.y0 - 1) },
        behindDocument: behind,
        allowOverlap: true,
        wrap: { type: TextWrappingType.NONE },
      },
    })]
  }
  const anchors = new Paragraph({
    children: [...framed.backgrounds.flatMap(region => floating(region, true)), ...framed.pictures.flatMap(region => floating(region, false))],
  })
  const texts = framed.blocks.flatMap(block => {
    if (block.kind !== 'paragraph') return []
    fitFonts(block)
    const right = Math.max(...block.lines.map(line => line.x1))
    const first = block.lines[0]
    // A little wider than in the PDF: Word's font may be a bit wider than the PDF's.
    const width = (right - block.left) * 1.08 + 4
    const firstLine = block.lines.length > 1 ? first.x0 - block.left : 0
    return [new Paragraph({
      children: runsOf(docx, block, region => inlinePicture(docx, page, region)),
      frame: {
        type: 'absolute',
        position: { x: twips(block.left - 1), y: twips(block.top) },
        width: twips(width),
        height: twips(block.bottom - block.top),
        rule: HeightRule.ATLEAST,
        anchor: { horizontal: FrameAnchorType.PAGE, vertical: FrameAnchorType.PAGE },
      },
      alignment: block.align === 'center' ? AlignmentType.CENTER : block.align === 'right' ? AlignmentType.RIGHT
        : block.align === 'justify' ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
      indent: firstLine > 0 ? { firstLine: twips(firstLine) } : undefined,
      spacing: { before: 0, after: 0, line: twips(Math.max(block.lineGap, first.size)), lineRule: LineRuleType.AT_LEAST },
    })]
  })
  // The section's page break goes in a plain paragraph: put in a frame's, Word and LibreOffice
  // carried the frames to the wrong pages.
  return [anchors, ...texts, new Paragraph({})]
}

/** The Word document of the pages read. */
async function writeDocx(pages: readonly WordPage[], title: string): Promise<Uint8Array> {
  const docx = await import('docx')
  const { Document, Packer, Paragraph, ColumnBreak, SectionType, PageOrientation } = docx
  const sizes = new Map<string, number>()
  for (const { layout } of pages) {
    for (const block of [...layout.before, ...layout.columns.flat(), ...layout.after]) {
      if (block.kind !== 'paragraph') continue
      for (const line of block.lines) {
        for (const part of line.parts) {
          if (part.kind !== 'text') continue
          const key = `${part.run.style.family}|${Math.round(part.run.size * 2)}`
          sizes.set(key, (sizes.get(key) ?? 0) + part.run.text.length)
        }
      }
    }
  }
  const [common] = [...sizes.entries()].sort((a, b) => b[1] - a[1])
  const [font, halfPoints] = common ? [common[0].split('|')[0], Number(common[0].split('|')[1])] : ['Arial', 24]
  const sections: ConstructorParameters<typeof Document>[0]['sections'][number][] = []
  for (const page of pages) {
    const { layout } = page
    const { content } = layout
    const properties = {
      page: {
        size: { width: twips(layout.width), height: twips(layout.height), orientation: layout.width > layout.height ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
        margin: {
          top: twips(Math.max(14, content.y0 - 2)),
          bottom: twips(14),
          left: twips(Math.max(14, content.x0)),
          right: twips(Math.max(14, layout.width - content.x1)),
        },
      },
    }
    const pageStart = Math.max(14, content.y0 - 2)
    if (layout.framed) {
      sections.push({
        properties: { ...properties, type: SectionType.NEXT_PAGE, page: { ...properties.page, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
        children: framedPage(docx, page),
      })
      continue
    }
    if (layout.columns.length === 1) {
      sections.push({ properties: { ...properties, type: SectionType.NEXT_PAGE }, children: paragraphs(docx, layout.columns[0], content, page, pageStart) })
      continue
    }
    const [left, right] = layout.columnBoxes
    let started = false
    let bottom = pageStart
    if (layout.before.length > 0) {
      sections.push({ properties: { ...properties, type: SectionType.NEXT_PAGE }, children: paragraphs(docx, layout.before, content, page, bottom) })
      bottom = layout.before.at(-1)!.bottom
      started = true
    }
    const leftBlocks = paragraphs(docx, layout.columns[0], left, page, bottom)
    const rightBlocks = paragraphs(docx, layout.columns[1], right, page, bottom)
    sections.push({
      properties: {
        ...properties,
        type: started ? SectionType.CONTINUOUS : SectionType.NEXT_PAGE,
        column: { count: 2, space: twips(right.x0 - left.x1), equalWidth: true },
      },
      children: [...leftBlocks, new Paragraph({ children: [new ColumnBreak()] }), ...rightBlocks],
    })
    if (layout.after.length > 0) {
      // Word's columns come out a little taller than the PDF's: a small gap keeps a footer on its page.
      const columnsEnd = Math.max(...layout.columns.flat().map(block => block.bottom), bottom, layout.after[0].top - 6)
      sections.push({ properties: { ...properties, type: SectionType.CONTINUOUS }, children: paragraphs(docx, layout.after, content, page, columnsEnd) })
    }
  }
  const document = new Document({
    creator: 'awPDF',
    title,
    styles: { default: { document: { run: { font, size: halfPoints } } } },
    sections: sections.length > 0 ? sections : [{ children: [new Paragraph('')] }],
  })
  return new Uint8Array(await (await Packer.toBlob(document)).arrayBuffer())
}

/**
 * The PDF's pages as a Word document. `bytes` is the PDF as it is to be converted (with its marks
 * and filled fields, without a password); `skipLast` leaves out a last page that was joined only
 * to take a password off.
 */
export async function pdfToWord(bytes: Uint8Array, title: string, progress: (done: number, total: number) => void,
  isCancelled: () => boolean, { skipLast = false } = {}): Promise<Uint8Array> {
  // Opened again with the fonts' names, which tell bold and italic.
  const task = getDocument({ data: bytes, fontExtraProperties: true, enableXfa: false, ...pdfAssets() })
  let pdf: PDFDocumentProxy | null = null
  try {
    pdf = await task.promise
    const count = pdf.numPages - (skipLast ? 1 : 0)
    const pages: WordPage[] = []
    for (let number = 1; number <= count; number += 1) {
      if (isCancelled()) throw new WordCancelled()
      progress(number - 1, count)
      pages.push(await readPage(await pdf.getPage(number)))
    }
    progress(count, count)
    return await writeDocx(pages, title)
  } finally {
    void task.destroy()
  }
}
