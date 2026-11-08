/**
 * Word's fonts on a device that does not have them. A missing font falls back to the browser's
 * default, a serif, so each font list gets the generic family that looks like it. Symbol and
 * Wingdings put their signs at letters' or private code points, which other fonts draw as letters
 * or not at all; those become the ordinary characters they show (as LibreOffice does).
 */

const GENERIC = /(^|,)\s*(serif|sans-serif|monospace|cursive|fantasy|system-ui)\s*(,|$)/i
const SERIF = /times|cambria|georgia|garamond|book antiqua|palatino|century|bookman|caladea|liberation serif|noto serif|constantia/i
const MONOSPACE = /courier|consolas|lucida console|mono/i

/** The font list with the generic family after it: sans-serif unless the fonts are serif or fixed width. */
export function withFallback(family: string): string {
  const trimmed = family.trim()
  if (trimmed === '' || GENERIC.test(trimmed) || /^(inherit|initial|unset|revert)$/i.test(trimmed)) return trimmed
  const generic = MONOSPACE.test(trimmed) ? 'monospace' : SERIF.test(trimmed) ? 'serif' : 'sans-serif'
  return `${trimmed}, ${generic}`
}

/** Every `font-family` in a stylesheet, with its generic family. */
export function cssWithFallbacks(css: string): string {
  return css.replace(/font-family:\s*([^;}]+)/gi, (_, family: string) => `font-family: ${withFallback(family)}`)
}

/** Symbol's signs by their code (the low byte; Word also writes them at U+F020-U+F0FF). */
const SYMBOL: Readonly<Record<number, string>> = {
  0x22: '∀', 0x24: '∃', 0x27: '∋', 0x2a: '∗', 0x2d: '−', 0x40: '≅', 0x5c: '∴', 0x5e: '⊥', 0x60: '‾',
  0x41: 'Α', 0x42: 'Β', 0x43: 'Χ', 0x44: 'Δ', 0x45: 'Ε', 0x46: 'Φ', 0x47: 'Γ', 0x48: 'Η', 0x49: 'Ι', 0x4a: 'ϑ',
  0x4b: 'Κ', 0x4c: 'Λ', 0x4d: 'Μ', 0x4e: 'Ν', 0x4f: 'Ο', 0x50: 'Π', 0x51: 'Θ', 0x52: 'Ρ', 0x53: 'Σ', 0x54: 'Τ',
  0x55: 'Υ', 0x56: 'ς', 0x57: 'Ω', 0x58: 'Ξ', 0x59: 'Ψ', 0x5a: 'Ζ',
  0x61: 'α', 0x62: 'β', 0x63: 'χ', 0x64: 'δ', 0x65: 'ε', 0x66: 'φ', 0x67: 'γ', 0x68: 'η', 0x69: 'ι', 0x6a: 'ϕ',
  0x6b: 'κ', 0x6c: 'λ', 0x6d: 'μ', 0x6e: 'ν', 0x6f: 'ο', 0x70: 'π', 0x71: 'θ', 0x72: 'ρ', 0x73: 'σ', 0x74: 'τ',
  0x75: 'υ', 0x76: 'ϖ', 0x77: 'ω', 0x78: 'ξ', 0x79: 'ψ', 0x7a: 'ζ',
  0xa1: 'ϒ', 0xa2: '′', 0xa3: '≤', 0xa4: '⁄', 0xa5: '∞', 0xa6: 'ƒ', 0xa7: '♣', 0xa8: '♦', 0xa9: '♥', 0xaa: '♠',
  0xab: '↔', 0xac: '←', 0xad: '↑', 0xae: '→', 0xaf: '↓', 0xb0: '°', 0xb1: '±', 0xb2: '″', 0xb3: '≥', 0xb4: '×',
  0xb5: '∝', 0xb6: '∂', 0xb7: '•', 0xb8: '÷', 0xb9: '≠', 0xba: '≡', 0xbb: '≈', 0xbc: '…', 0xbf: '↵',
  0xc0: 'ℵ', 0xc1: 'ℑ', 0xc2: 'ℜ', 0xc3: '℘', 0xc4: '⊗', 0xc5: '⊕', 0xc6: '∅', 0xc7: '∩', 0xc8: '∪', 0xc9: '⊃',
  0xca: '⊇', 0xcb: '⊄', 0xcc: '⊂', 0xcd: '⊆', 0xce: '∈', 0xcf: '∉', 0xd0: '∠', 0xd1: '∇', 0xd5: '∏', 0xd6: '√',
  0xd7: '⋅', 0xd8: '¬', 0xd9: '∧', 0xda: '∨', 0xdb: '⇔', 0xdc: '⇐', 0xdd: '⇑', 0xde: '⇒', 0xdf: '⇓', 0xe0: '◊',
  0xe1: '〈', 0xe5: '∑', 0xf1: '〉', 0xf2: '∫',
}

/** Wingdings' signs most used in documents: bullets, boxes and ticks. */
const WINGDINGS: Readonly<Record<number, string>> = {
  0x4a: '☺', 0x4c: '☹', 0x6c: '●', 0x6e: '■', 0x6f: '□', 0x70: '◻', 0x71: '❑', 0x72: '❒', 0x73: '⬧',
  0x74: '⧫', 0x75: '◆', 0x76: '❖', 0x77: '⬥', 0x9f: '•', 0xa7: '▪', 0xa8: '□', 0xd8: '➢', 0xe0: '➔', 0xe8: '➔',
  0xef: '⇦', 0xf0: '⇨', 0xfb: '✗', 0xfc: '✓', 0xfd: '☒', 0xfe: '☑',
}

/** Bullets in a stylesheet: Word's lists name their font apart, so only the bullets' own code points are known. */
const LIST_BULLETS: Readonly<Record<number, string>> = { ...WINGDINGS, 0xb7: '•', 0x2d: '–', 0xbe: '–' }

function signs(font: string): Readonly<Record<number, string>> | null {
  const name = font.replace(/["']/g, '').trim()
  if (/^symbol\b/i.test(name)) return SYMBOL
  if (/^wingdings\b/i.test(name)) return WINGDINGS
  return null
}

/** Whether text in this font is signs rather than letters. */
export function isSymbolFont(font: string): boolean {
  return signs(font) !== null
}

/** Text written in Symbol or Wingdings as the signs it shows; other fonts' text as it is. */
export function symbolText(text: string, font: string): string {
  const table = signs(font)
  if (!table) return text
  return text.replace(/[ -ÿ-]/g, character => table[character.charCodeAt(0) & 0xff] ?? character)
}

/** List bullets in docx-preview's stylesheet, which are private code points of Symbol or Wingdings. */
export function plainBullets(css: string): string {
  return css.replace(/[-]/g, character => LIST_BULLETS[character.charCodeAt(0) & 0xff] ?? '•')
}

/**
 * Word's "single" line is the font's own line height, some 1.15 times its size; docx-preview
 * writes it as `line-height: 1`, which packs lines closer than Word (measured: a page of text 14 %
 * shorter than LibreOffice's with the same fonts). Multiples of a line become multiples of that.
 */
const WORD_SINGLE_LINE = 1.15

export function wordLineHeight(value: string): string {
  const trimmed = value.trim()
  return /^\d+(\.\d+)?$/.test(trimmed) ? String(Math.round(Number(trimmed) * WORD_SINGLE_LINE * 1000) / 1000) : value
}

/** Every unitless `line-height` in a stylesheet as Word spaces lines. */
export function cssWithWordLines(css: string): string {
  return css.replace(/line-height:\s*([\d.]+)\s*(?=[;}])/gi, (_, value: string) => `line-height: ${wordLineHeight(value)}`)
}
