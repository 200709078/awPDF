import { imagesToPdf, type JpegImage } from '../core/images-to-pdf'
import type { Platform } from '../platform/platform'
import { cssWithFallbacks, cssWithWordLines, isSymbolFont, plainBullets, symbolText, withFallback, wordLineHeight } from '../core/word-fonts'
import { canvasBytes } from './images'

/** Sharp enough to print and to read when zoomed; a page is some 200-400 KB. */
const DPI = 150
const CSS_PIXELS_PER_INCH = 96
const JPEG_QUALITY = 0.9
/**
 * Our fonts are not Word's, so a page often comes out a little longer than Word made it. Up to
 * this much it is made smaller to fit its page; beyond it the rest goes on to a next page.
 */
const SHRINK_LIMIT = 1.12
const XHTML = 'http://www.w3.org/1999/xhtml'
/**
 * The same starting point where the page is measured and where its picture is painted: the app's
 * own styles (border-box everywhere, its font and colours) must not reach the document, or the cut
 * points would not match the picture. No specificity, so docx-preview's rules still win.
 */
const BASE_CSS = ':where(.word-render, .word-render *) { box-sizing: content-box; }\n'
  + '.word-render { font-family: serif; font-size: 16px; line-height: normal; color: #000000; text-align: left; }\n'

export const WORD_ACCEPT = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const OLD_WORD_ACCEPT = '.doc,application/msword'

export function isWordFile(name: string): boolean {
  return /\.docx$/i.test(name)
}

/** The old binary `.doc`, which docx-preview cannot read. */
export function isOldWordFile(name: string): boolean {
  return /\.doc$/i.test(name)
}

export interface WordProgress {
  readonly cancelled: boolean
  progress(text: string): void
}

/** The old `.doc` where no office program reads it. */
export class OldWordError extends Error {}

/**
 * A Word document as a PDF. Where the device has an office program (LibreOffice on the desktop),
 * it writes the PDF: the layout is Word's, the text stays text and `.doc` works too. Elsewhere,
 * or if it fails, the pages are drawn here as pictures (`wordPages`). Null when cancelled.
 */
export async function wordToPdf(file: File, platform: Pick<Platform, 'wordToPdf'>, work: WordProgress): Promise<Uint8Array | null> {
  if (platform.wordToPdf && (isWordFile(file.name) || isOldWordFile(file.name))) {
    try {
      work.progress('LibreOffice ile dönüştürülüyor…')
      const made = await platform.wordToPdf(file.name, new Uint8Array(await file.arrayBuffer()))
      if (work.cancelled) return null
      if (made) return made
    } catch (error) {
      // A .docx is still drawn here; a .doc has no other way.
      console.error(error)
      if (isOldWordFile(file.name)) throw error
    }
  }
  if (isOldWordFile(file.name)) throw new OldWordError()
  const pages = await wordPages(file, work)
  if (!pages) return null
  if (pages.length === 0) throw new Error('Word belgesinde sayfa yok.')
  return imagesToPdf(pages, 'image')
}

/**
 * A Word document as pictures of its pages, ready for `imagesToPdf`. docx-preview lays the document
 * out as HTML, a page per `<section>` (it breaks pages where Word last did); each page is then
 * drawn into a canvas through an SVG `<foreignObject>`, which the browser paints as it would the
 * page itself. Returns null when cancelled.
 */
export async function wordPages(file: Blob, work: WordProgress): Promise<JpegImage[] | null> {
  const { renderAsync } = await import('docx-preview')
  const host = document.createElement('div')
  // Laid out, so it can be measured, but off screen and out of the way of taps.
  host.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;'
  host.className = 'word-render'
  const base = document.createElement('style')
  base.textContent = BASE_CSS
  const styles = document.createElement('div')
  const body = document.createElement('div')
  host.append(base, styles, body)
  document.body.append(host)
  try {
    await renderAsync(file, body, styles, {
      inWrapper: false,
      useBase64URL: true,
      renderComments: false,
      renderChanges: false,
      // The fonts a document carries arrive as blob URLs, which a picture of the page cannot load.
      ignoreFonts: true,
      experimental: true,
    })
    for (const style of styles.querySelectorAll('style')) style.textContent = cssWithWordLines(cssWithFallbacks(plainBullets(style.textContent ?? '')))
    deviceFonts(body)
    await document.fonts.ready
    await Promise.all([...body.querySelectorAll('img')].map(image => image.decode().catch(() => undefined)))
    const css = [...styles.querySelectorAll('style')].map(style => style.textContent).join('\n')
    const sections = [...body.querySelectorAll<HTMLElement>(':scope > section')]
    const pages: JpegImage[] = []
    for (const [index, section] of sections.entries()) {
      if (work.cancelled) return null
      work.progress(`${index + 1} / ${sections.length}`)
      pages.push(...await sectionPages(section, css))
    }
    return pages
  } finally {
    host.remove()
  }
}

/**
 * Fonts the device may lack get a look-alike; text in Symbol or Wingdings becomes the signs it
 * shows; lines are spaced as Word spaces them.
 */
function deviceFonts(root: HTMLElement): void {
  for (const element of root.querySelectorAll<HTMLElement>('[style*="line-height"]')) {
    element.style.lineHeight = wordLineHeight(element.style.lineHeight)
  }
  for (const element of root.querySelectorAll<HTMLElement>('[style*="font-family"]')) {
    const family = element.style.fontFamily
    const first = family.split(',')[0]
    if (!isSymbolFont(first)) {
      element.style.fontFamily = withFallback(family)
      continue
    }
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) node.nodeValue = symbolText(node.nodeValue ?? '', first)
    element.style.fontFamily = 'sans-serif'
  }
}

/** One section as one page, or as several when it runs well past its page (a document no Word paged). */
async function sectionPages(section: HTMLElement, css: string): Promise<JpegImage[]> {
  const style = getComputedStyle(section)
  // Not offsetWidth: it rounds, and an A4 page would come out a point too wide.
  const { width, height } = section.getBoundingClientRect()
  // docx-preview gives a page its height as a minimum; a section without one is cut at A4.
  const pageHeight = parseFloat(style.minHeight) || width * Math.SQRT2
  const top = parseFloat(style.paddingTop) || 0
  const bottom = parseFloat(style.paddingBottom) || 0
  if (height <= pageHeight * SHRINK_LIMIT) {
    return [drawPage(await sectionPicture(section, css, width, height), width, pageHeight, [{ from: 0, to: height, at: 0 }])]
  }
  const flowed = await flowedPages(section, css, width, height, pageHeight)
  if (flowed) return flowed
  const picture = await sectionPicture(section, css, width, height)
  const pages: JpegImage[] = []
  for (const [index, slice] of slices(section, height, pageHeight, top, bottom).entries()) {
    pages.push(drawPage(picture, width, pageHeight, [{ ...slice, at: index === 0 ? 0 : top }]))
  }
  return pages
}

/**
 * A long section with one text flow, paged as Word does: the text is given a page's height and
 * fills its columns one after the other (`column-fill: auto`), so the browser breaks lines, rows
 * and pictures itself and a two-column page reads down the left column first. Columns past the
 * first page overflow to the right; page k shows the k-th group of them under the same header and
 * footer. Null for a section of several flows (one column, then two), which is cut instead.
 */
async function flowedPages(section: HTMLElement, css: string, width: number, height: number, pageHeight: number): Promise<JpegImage[] | null> {
  const articles = section.querySelectorAll<HTMLElement>(':scope > article')
  if (articles.length !== 1) return null
  const article = articles[0]
  // Everything else on the page (margins, header, footer, footnotes) keeps its place.
  const columnHeight = pageHeight - (height - article.getBoundingClientRect().height)
  if (columnHeight < pageHeight / 4) return null
  const style = getComputedStyle(article)
  const gap = style.columnGap === 'normal' ? parseFloat(style.fontSize) : parseFloat(style.columnGap) || 0
  article.style.height = `${columnHeight}px`
  article.style.columnFill = 'auto'
  if (style.columnCount === 'auto') article.style.columnCount = '1'
  const box = article.getBoundingClientRect()
  const step = box.width + gap
  const range = document.createRange()
  range.selectNodeContents(article)
  let right = box.left
  for (const rect of range.getClientRects()) if (rect.width > 0 && rect.height > 0) right = Math.max(right, rect.right)
  const count = Math.max(1, Math.ceil((right - box.left + gap - 0.5) / step))
  const pageWidth = section.getBoundingClientRect().width
  const pages: JpegImage[] = []
  for (let index = 0; index < count; index += 1) {
    const page = section.cloneNode(true) as HTMLElement
    const flow = page.querySelector<HTMLElement>(':scope > article')!
    if (index > 0) {
      // Moved by a margin, not a transform, which would change where positioned pictures sit.
      const offset = index * step
      Object.assign(flow.style, { width: `${box.width}px`, flexShrink: '0', marginLeft: `${-offset}px` })
      flow.style.clipPath = `polygon(${offset}px -100000px, ${offset + box.width}px -100000px, ${offset + box.width}px 100000px, ${offset}px 100000px)`
    }
    pages.push(drawPage(await sectionPicture(page, css, pageWidth, pageHeight), pageWidth, pageHeight, [{ from: 0, to: pageHeight, at: 0 }]))
  }
  return pages
}

interface Slice {
  readonly from: number
  readonly to: number
}

/**
 * Where a long section is cut: under a line, a table row or a picture, as low as the page allows;
 * only a block taller than a page is cut through. Every page after the first keeps the top margin.
 */
function slices(section: HTMLElement, height: number, pageHeight: number, top: number, bottom: number): Slice[] {
  const origin = section.getBoundingClientRect().top
  const cuts = new Set<number>()
  for (const element of section.querySelectorAll('p, tr, li, img, svg, table, h1, h2, h3, h4, h5, h6')) {
    const box = element.getBoundingClientRect()
    if (box.height > 0) cuts.add(Math.round(box.bottom - origin))
  }
  // Lines inside one paragraph are cut points too.
  for (const paragraph of section.querySelectorAll('p')) {
    const range = document.createRange()
    range.selectNodeContents(paragraph)
    for (const line of range.getClientRects()) cuts.add(Math.round(line.bottom - origin))
  }
  const sorted = [...cuts].filter(cut => cut > 0 && cut < height).sort((a, b) => a - b)
  // Below the text there is only the bottom margin and the footer: no page of their own.
  const text = [...section.querySelectorAll(':scope > article')].map(article => article.getBoundingClientRect().bottom - origin)
  const lastLine = Math.round(Math.max(1, ...text))
  const result: Slice[] = []
  let from = 0
  while (from < lastLine) {
    const room = pageHeight - bottom - (result.length === 0 ? 0 : top)
    const limit = from + room
    if (limit >= height) {
      result.push({ from, to: height })
      break
    }
    const cut = sorted.filter(value => value > from && value <= limit).pop() ?? limit
    result.push({ from, to: cut })
    from = cut
  }
  return result
}

/** The section painted by the browser, as a picture at the output resolution. */
async function sectionPicture(section: HTMLElement, css: string, width: number, height: number): Promise<HTMLImageElement> {
  const wrapper = document.createElementNS(XHTML, 'div') as HTMLElement
  wrapper.setAttribute('class', 'word-render')
  const sheet = document.createElementNS(XHTML, 'style')
  sheet.textContent = `${BASE_CSS}${css}`
  wrapper.append(sheet, section.cloneNode(true))
  const markup = new XMLSerializer().serializeToString(wrapper)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
    + `<foreignObject x="0" y="0" width="${width}" height="${height}">${markup}</foreignObject></svg>`
  const image = new Image()
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await image.decode()
  return image
}

/** A page: white paper with parts of the picture laid on it, `at` CSS pixels from its top. */
function drawPage(picture: HTMLImageElement, width: number, pageHeight: number, parts: readonly (Slice & { at: number })[]): JpegImage {
  const scale = DPI / CSS_PIXELS_PER_INCH
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(pageHeight * scale)
  const context = canvas.getContext('2d')!
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  for (const { from, to, at } of parts) {
    const partHeight = to - from
    // A page only a little too long is made smaller, kept centred across.
    const fit = Math.min(1, (pageHeight - at) / partHeight)
    const left = (width - width * fit) / 2
    // The source is in the picture's own units, CSS pixels; an SVG is drawn sharp at any scale.
    context.drawImage(picture, 0, from, width, partHeight,
      left * scale, at * scale, width * fit * scale, partHeight * fit * scale)
  }
  const data = canvasBytes(canvas, 'image/jpeg', JPEG_QUALITY)
  const page = { data, width: canvas.width, height: canvas.height, dpi: DPI }
  canvas.width = 0
  return page
}
