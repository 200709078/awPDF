/**
 * A PDF page's layout read back as a document: what is running text (lines, paragraphs, columns)
 * and what is better kept as a picture (photos, drawings, tables, formulas). Pure geometry on
 * what pdf.js gives, in the page's view space at scale 1: points, origin top left, y down.
 */

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface TextStyle {
  family: string
  bold: boolean
  italic: boolean
  /** Signs of a formula font (MathType, Symbol, MathMagic…), often coded oddly: kept as a picture. */
  math: boolean
}

/** One run of text as pdf.js gives it: horizontal, left to right. */
export interface Glyphs {
  text: string
  /** Start of the baseline. */
  x: number
  y: number
  size: number
  width: number
  style: TextStyle
  underline?: boolean
}

export interface Graphic {
  box: Box
  kind: 'image' | 'path'
}

export interface Region {
  box: Box
  /** A photo or a scan: JPEG suits it; drawings and formulas stay sharp as PNG. */
  photo: boolean
}

export interface Run {
  text: string
  style: TextStyle
  size: number
  position: 'normal' | 'super' | 'sub'
  underline: boolean
}

export type LinePart = { kind: 'text'; run: Run } | { kind: 'picture'; region: Region }

export interface Line {
  x0: number
  x1: number
  /** Baseline. */
  y: number
  size: number
  parts: LinePart[]
}

export type Block =
  | { kind: 'paragraph'; top: number; bottom: number; lines: Line[]; left: number; firstLine: number; align: 'left' | 'center' | 'right' | 'justify'; lineGap: number }
  | { kind: 'pictures'; top: number; bottom: number; left: number; regions: Region[] }

export interface PageLayout {
  width: number
  height: number
  /** Full-width blocks above the columns, the columns (one or two), and full-width blocks below. */
  before: Block[]
  columns: Block[][]
  after: Block[]
  /** The columns' horizontal extents, for the gap between them. */
  columnBoxes: Box[]
  content: Box
}

const width = (box: Box) => box.x1 - box.x0
const height = (box: Box) => box.y1 - box.y0
const union = (a: Box, b: Box): Box => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) })
const gapBetween = (a: Box, b: Box) => Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1, 0)
const centerInside = (inner: Box, outer: Box, margin = 1) => {
  const x = (inner.x0 + inner.x1) / 2
  const y = (inner.y0 + inner.y1) / 2
  return x >= outer.x0 - margin && x <= outer.x1 + margin && y >= outer.y0 - margin && y <= outer.y1 + margin
}

/** The box of a run: from the descent to the ascent. */
export function glyphBox(glyphs: Glyphs): Box {
  return { x0: glyphs.x, x1: glyphs.x + glyphs.width, y0: glyphs.y - glyphs.size * 0.8, y1: glyphs.y + glyphs.size * 0.22 }
}

/** Private-use characters (a symbol font pdf.js could not name) and formula signs. */
const FORMULA_SIGNS = /[-∫∑∏√∞∂∆∇≈≠≤≥±∓×÷∈∉⊂⊃∪∩→⇒⇔∀∃]/

const THIN = 1.6

interface Piece {
  box: Box
  kind: 'image' | 'path' | 'math'
}

/**
 * Pictures of the page: images, drawings and formulas, each with what lies close to it gathered
 * into one, and with the plain text inside (a table's cells, a figure's labels). A lone thin line
 * (a rule, a border) is no picture; a grid of them is a table. A picture covering most of a page
 * that has text is its background (or the scan under recognised text) and is left out.
 */
export function findRegions(glyphs: readonly Glyphs[], graphics: readonly Graphic[], page: Box): { regions: Region[]; absorbed: Set<Glyphs> } {
  const pageArea = width(page) * height(page)
  const textLength = glyphs.reduce((sum, item) => sum + item.text.trim().length, 0)
  const pieces: Piece[] = []
  for (const graphic of graphics) {
    const area = width(graphic.box) * height(graphic.box)
    if (area > pageArea * 0.7 && (textLength > 20 || graphic.kind === 'path')) continue
    if (width(graphic.box) < 0.5 && height(graphic.box) < 0.5) continue
    pieces.push({ box: graphic.box, kind: graphic.kind })
  }
  for (const item of glyphs) {
    if (item.style.math || FORMULA_SIGNS.test(item.text)) pieces.push({ box: glyphBox(item), kind: 'math' })
  }
  // Gathered with what is near: a few points apart is one figure or one formula.
  const groups = pieces.map(piece => ({ box: piece.box, pieces: [piece] }))
  for (let merged = true; merged;) {
    merged = false
    for (let first = 0; first < groups.length; first += 1) {
      for (let second = first + 1; second < groups.length; second += 1) {
        const reach = groups[first].pieces.some(piece => piece.kind === 'math') || groups[second].pieces.some(piece => piece.kind === 'math') ? 3 : 2
        if (gapBetween(groups[first].box, groups[second].box) > reach) continue
        groups[first].box = union(groups[first].box, groups[second].box)
        groups[first].pieces.push(...groups[second].pieces)
        groups.splice(second, 1)
        second -= 1
        merged = true
      }
    }
  }
  const regions: Region[] = []
  for (const group of groups) {
    const thin = group.pieces.filter(piece => piece.kind === 'path' && (height(piece.box) <= THIN || width(piece.box) <= THIN))
    const across = thin.filter(piece => height(piece.box) <= THIN).length
    const down = thin.length - across
    const solid = group.pieces.some(piece => piece.kind !== 'path' || (height(piece.box) > THIN && width(piece.box) > THIN))
    const grid = (across >= 2 && down >= 2) || (across >= 3 && width(group.box) > 50)
    if (!solid && !grid) continue
    if (width(group.box) < 3 && height(group.box) < 3) continue
    const photo = group.pieces.some(piece => piece.kind === 'image') && width(group.box) * height(group.box) > 5000
    regions.push({ box: group.box, photo })
  }
  // The text inside a picture belongs to it.
  const absorbed = new Set<Glyphs>()
  for (const item of glyphs) {
    const box = glyphBox(item)
    const region = regions.find(candidate => centerInside(box, candidate.box))
    if (!region) continue
    absorbed.add(item)
    region.box = union(region.box, box)
  }
  return { regions, absorbed }
}

/**
 * A gap down the middle that no text crosses: two columns. Titles and pictures wider than half
 * the page do not count; they go above or below the columns.
 */
function findGutter(boxes: readonly Box[], content: Box): { x0: number; x1: number } | null {
  const span = Math.ceil(width(content))
  if (span < 200 || boxes.length < 6) return null
  const covered = new Uint8Array(span + 1)
  const narrow = boxes.filter(box => width(box) < width(content) * 0.55)
  for (const box of narrow) {
    for (let x = Math.max(0, Math.floor(box.x0 - content.x0)); x <= Math.min(span, Math.ceil(box.x1 - content.x0)); x += 1) covered[x] = 1
  }
  let best: { x0: number; x1: number } | null = null
  for (let x = Math.floor(span * 0.3); x <= span * 0.7; x += 1) {
    if (covered[x]) continue
    let end = x
    while (end + 1 <= span * 0.7 && !covered[end + 1]) end += 1
    if (end - x + 1 >= 8 && (!best || end - x > best.x1 - best.x0)) best = { x0: content.x0 + x, x1: content.x0 + end + 1 }
    x = end
  }
  if (!best) return null
  const gutter = best
  const left = narrow.filter(box => box.x1 <= gutter.x0)
  const right = narrow.filter(box => box.x0 >= gutter.x1)
  if (left.length < Math.max(3, narrow.length * 0.2) || right.length < Math.max(3, narrow.length * 0.2)) return null
  // The two sides run side by side, and nothing crosses the gap between them there.
  const top = Math.max(Math.min(...left.map(box => box.y0)), Math.min(...right.map(box => box.y0)))
  const bottom = Math.min(Math.max(...left.map(box => box.y1)), Math.max(...right.map(box => box.y1)))
  const shorter = Math.min(Math.max(...left.map(box => box.y1)) - Math.min(...left.map(box => box.y0)),
    Math.max(...right.map(box => box.y1)) - Math.min(...right.map(box => box.y0)))
  if (bottom - top < shorter * 0.5) return null
  const crossing = boxes.some(box => box.x0 < gutter.x0 && box.x1 > gutter.x1 && box.y1 > top + 2 && box.y0 < bottom - 2)
  return crossing ? null : best
}

const LIST_START = /^\s*(\d{1,3}[.)]|[a-eA-E][.)]|[•●▪◦–-])\s/

/**
 * Lines of text: runs on (nearly) one baseline, raised or lowered smaller ones with them, and
 * small pictures that sit in a line (a formula in a sentence) in their place among the words.
 */
function buildLines(glyphs: readonly Glyphs[], inline: readonly Region[]): Line[] {
  const sorted = [...glyphs].sort((a, b) => a.y - b.y || a.x - b.x)
  const rows: { y: number; size: number; items: Glyphs[]; pictures: Region[] }[] = []
  for (const item of sorted) {
    const row = rows.find(candidate => Math.abs(candidate.y - item.y) <= 0.55 * Math.max(candidate.size, item.size)
      && !candidate.items.some(other => item.x < other.x + other.width - 1 && other.x < item.x + item.width - 1))
    if (row) {
      row.items.push(item)
      if (item.size > row.size * 1.05 && item.text.trim().length > 1) {
        row.size = item.size
        row.y = item.y
      }
    } else rows.push({ y: item.y, size: item.size, items: [item], pictures: [] })
  }
  for (const region of inline) {
    const row = rows.find(candidate => region.box.y0 < candidate.y + candidate.size * 0.3 && region.box.y1 > candidate.y - candidate.size * 0.9)
    if (row) row.pictures.push(region)
    else rows.push({ y: region.box.y1, size: height(region.box), items: [], pictures: [region] })
  }
  return rows.map(row => {
    type Placed = { x: number; end: number; item?: Glyphs; region?: Region }
    const placed: Placed[] = [
      ...row.items.map(item => ({ x: item.x, end: item.x + item.width, item })),
      ...row.pictures.map(region => ({ x: region.box.x0, end: region.box.x1, region })),
    ].sort((a, b) => a.x - b.x)
    const parts: LinePart[] = []
    let end = -Infinity
    for (const { x, end: right, item, region } of placed) {
      if (region) {
        parts.push({ kind: 'picture', region })
        end = right
        continue
      }
      const glyphs = item!
      const small = glyphs.size < row.size * 0.85
      const position: Run['position'] = small && glyphs.y < row.y - row.size * 0.15 ? 'super' : small && glyphs.y > row.y + row.size * 0.08 ? 'sub' : 'normal'
      const gap = x - end
      const previous = parts.at(-1)
      let text = glyphs.text
      if (previous && gap > glyphs.size * 0.18 && !(previous.kind === 'text' && previous.run.text.endsWith(' ')) && !text.startsWith(' ')) {
        // A wide gap (a header spread across the page) is kept as so many spaces.
        text = ' '.repeat(Math.min(60, Math.max(1, Math.round(gap / (glyphs.size * 0.28))))) + text
      }
      const last = previous?.kind === 'text' ? previous.run : null
      if (last && last.style === glyphs.style && last.size === glyphs.size && last.position === position && last.underline === Boolean(glyphs.underline)) {
        last.text += text
      } else {
        parts.push({ kind: 'text', run: { text, style: glyphs.style, size: glyphs.size, position, underline: Boolean(glyphs.underline) } })
      }
      end = right
    }
    return { x0: placed[0].x, x1: end, y: row.y, size: row.size, parts }
  }).sort((a, b) => a.y - b.y)
}

/** Lines into paragraphs and pictures into rows, top to bottom, within one column. */
function buildBlocks(lines: Line[], pictures: Region[], column: Box): Block[] {
  type Item = { kind: 'line'; line: Line; top: number } | { kind: 'picture'; region: Region; top: number }
  const items: Item[] = [
    ...lines.map(line => ({ kind: 'line' as const, line, top: line.y - line.size })),
    ...pictures.map(region => ({ kind: 'picture' as const, region, top: region.box.y0 })),
  ].sort((a, b) => a.top - b.top)
  const blocks: Block[] = []
  for (const item of items) {
    const last = blocks.at(-1)
    if (item.kind === 'picture') {
      const box = item.region.box
      // Pictures side by side make one row.
      if (last?.kind === 'pictures' && box.y0 < last.bottom - Math.min(height(box), last.bottom - last.top) * 0.5) {
        last.regions.push(item.region)
        last.regions.sort((a, b) => a.box.x0 - b.box.x0)
        last.bottom = Math.max(last.bottom, box.y1)
        last.left = Math.min(last.left, box.x0)
      } else blocks.push({ kind: 'pictures', top: box.y0, bottom: box.y1, left: box.x0, regions: [item.region] })
      continue
    }
    const { line } = item
    if (last?.kind === 'paragraph' && continues(last, line, column)) {
      last.lines.push(line)
      last.bottom = line.y + line.size * 0.25
      if (last.lines.length === 2) last.left = line.x0
      else last.left = Math.min(last.left, line.x0)
    } else {
      blocks.push({ kind: 'paragraph', top: line.y - line.size, bottom: line.y + line.size * 0.25, lines: [line], left: line.x0, firstLine: line.x0, align: 'left', lineGap: line.size * 1.15 })
    }
  }
  for (const block of blocks) {
    if (block.kind !== 'paragraph') continue
    const { lines: rows } = block
    if (rows.length > 1) block.lineGap = (rows.at(-1)!.y - rows[0].y) / (rows.length - 1)
    block.align = alignment(block, column)
  }
  return blocks
}

const firstText = (line: Line) => line.parts.map(part => (part.kind === 'text' ? part.run.text : '')).join('')

function continues(paragraph: Extract<Block, { kind: 'paragraph' }>, line: Line, column: Box): boolean {
  const previous = paragraph.lines.at(-1)!
  const step = line.y - previous.y
  if (step > Math.max(previous.size, line.size) * 1.7 || step <= 0) return false
  if (Math.abs(line.size - previous.size) > previous.size * 0.15) return false
  if (LIST_START.test(firstText(line))) return false
  // A centred title and the text under it, a bold heading and its paragraph, are apart.
  if (isCentered(previous, column) !== isCentered(line, column)) return false
  if (allBold(previous) !== allBold(line)) return false
  // Lines that start far from the left (a signature, an address set right) each stand alone.
  if (previous.x0 - column.x0 > width(column) * 0.25 && Math.abs(line.x0 - previous.x0) > line.size) return false
  // The previous line stopped well before the column's edge, or where the next line's first word
  // would still have fitted: it ended its paragraph (a wrapped line breaks only when it must).
  if (previous.x1 < column.x1 - Math.max(previous.size * 3, width(column) * 0.15) && !isCentered(previous, column)) return false
  const words = firstText(line).trimStart()
  const charWidth = (line.x1 - line.x0) / Math.max(1, firstText(line).length)
  const firstWord = (words.split(/\s/)[0]?.length ?? 0) * charWidth
  if (!isCentered(previous, column) && previous.x1 + charWidth + firstWord < column.x1 - 1) return false
  const left = paragraph.lines.length === 1 ? null : paragraph.left
  if (left !== null && Math.abs(line.x0 - left) > line.size * 0.6) return false
  // A second line further right than the first is a new paragraph (a hanging layout is rare).
  if (left === null && line.x0 > previous.x0 + line.size * 0.6) return false
  return true
}

function allBold(line: Line): boolean {
  const runs = line.parts.flatMap(part => (part.kind === 'text' && part.run.text.trim() ? [part.run] : []))
  return runs.length > 0 && runs.every(run => run.style.bold)
}

function isCentered(line: Line, column: Box): boolean {
  const before = line.x0 - column.x0
  const after = column.x1 - line.x1
  return before > 18 && after > 18 && Math.abs(before - after) < Math.max(10, width(column) * 0.05)
}

function alignment(paragraph: Extract<Block, { kind: 'paragraph' }>, column: Box): 'left' | 'center' | 'right' | 'justify' {
  const { lines } = paragraph
  if (lines.every(line => isCentered(line, column))) return 'center'
  if (lines.every(line => column.x1 - line.x1 < 6 && line.x0 - column.x0 > width(column) * 0.3)) return 'right'
  if (lines.length > 2 && lines.slice(0, -1).every(line => column.x1 - line.x1 < line.size)) return 'justify'
  return 'left'
}

/**
 * A page number at the very top or bottom ("3", "- 3 -", "Sayfa 3"): left out, for in Word the
 * pages break elsewhere and a number of the PDF's would be wrong; Word numbers pages itself.
 */
function isPageNumber(item: Glyphs, pageHeight: number): boolean {
  return (item.y > pageHeight * 0.93 || item.y < pageHeight * 0.06) && /^\s*(sayfa\s*)?[-–—(]?\s*\d{1,4}\s*[-–—)]?\s*$/i.test(item.text)
}

/** The page read as a document. */
export function layoutPage(glyphs: readonly Glyphs[], graphics: readonly Graphic[], page: { width: number; height: number }): PageLayout {
  const pageBox = { x0: 0, y0: 0, x1: page.width, y1: page.height }
  const { regions, absorbed } = findRegions(glyphs, graphics, pageBox)
  const text = glyphs.filter(item => !absorbed.has(item) && item.text.trim() !== '' && !isPageNumber(item, page.height))
  const boxes = [...text.map(glyphBox), ...regions.map(region => region.box)]
  const content = boxes.length > 0 ? boxes.reduce(union) : { x0: 36, y0: 36, x1: page.width - 36, y1: page.height - 36 }

  // Regions as tall as a line or two go into a line when they sit in one; the rest are blocks.
  const lineBands = text.map(item => ({ y0: item.y - item.size * 0.9, y1: item.y + item.size * 0.3, size: item.size }))
  const inline = regions.filter(region => height(region.box) <= 36 && lineBands.some(band => region.box.y0 < band.y1 && region.box.y1 > band.y0 && height(region.box) <= band.size * 3))
  const blocksOnly = regions.filter(region => !inline.includes(region))

  const gutter = findGutter(boxes, content)
  if (!gutter) {
    const lines = buildLines(text, inline)
    return { width: page.width, height: page.height, before: [], columns: [buildBlocks(lines, blocksOnly, content)], after: [], columnBoxes: [content], content }
  }
  const side = (box: Box): 'left' | 'right' | 'wide' => box.x1 <= gutter.x0 + 1 ? 'left' : box.x0 >= gutter.x1 - 1 ? 'right' : 'wide'
  const columnTop = Math.min(...boxes.filter(box => side(box) !== 'wide').map(box => box.y0))
  const leftBox = { ...content, x1: gutter.x0 }
  const rightBox = { ...content, x0: gutter.x1 }
  const pick = (where: 'left' | 'right' | 'above' | 'below') => {
    const chosen = (box: Box) => {
      const placed = side(box)
      if (placed !== 'wide') return placed === where
      return (box.y1 <= columnTop + 2 ? 'above' : 'below') === where
    }
    const items = text.filter(item => chosen(glyphBox(item)))
    return { items, pictures: blocksOnly.filter(region => chosen(region.box)), inline: inline.filter(region => chosen(region.box)) }
  }
  const make = (where: 'left' | 'right' | 'above' | 'below', column: Box) => {
    const { items, pictures, inline: small } = pick(where)
    return buildBlocks(buildLines(items, small), pictures, column)
  }
  return {
    width: page.width,
    height: page.height,
    before: make('above', content),
    columns: [make('left', leftBox), make('right', rightBox)],
    after: make('below', content),
    columnBoxes: [leftBox, rightBox],
    content,
  }
}

/** "BAAAAA+LiberationSerif-Bold" as a font Word has: "Times New Roman", bold. */
export function fontStyle(name: string | undefined, fallback: string): TextStyle {
  const plain = (name ?? '').replace(/^[A-Z]{6}\+/, '')
  const bold = /bold|black|heavy|semibold|demi/i.test(plain)
  const italic = /italic|oblique|-it\b|kursiv/i.test(plain)
  const math = /symbol|mt\s*extra|math|^mm|euclid|cmsy|cmmi|cmex|stix|wingding|dingbat|mtsy|mtmi/i.test(plain)
  let family = plain.split(/[-,]/)[0].replace(/(PS)?MT$|PSMT$/, '').replace(/PS$/, '')
  const known: Record<string, string> = {
    LiberationSerif: 'Times New Roman', LiberationSans: 'Arial', LiberationMono: 'Courier New', Carlito: 'Calibri',
    Caladea: 'Cambria', DejaVuSans: 'DejaVu Sans', Helvetica: 'Arial', Times: 'Times New Roman', TimesRoman: 'Times New Roman',
    Courier: 'Courier New', ArialNarrow: 'Arial Narrow',
  }
  family = known[family] ?? family.replace(/([a-z])([A-Z])/g, '$1 $2').trim()
  if (!family) family = fallback === 'serif' ? 'Times New Roman' : fallback === 'monospace' ? 'Courier New' : 'Arial'
  return { family, bold, italic, math }
}
