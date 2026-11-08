import { SignatureExtractor } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { Store } from './recent-files'

/**
 * A signature as pdf.js's signature editor takes it: lines in a box of `width` × `height`
 * (a drawing's strokes), or the outlines of filled shapes (`areContours`: typed text or a
 * picture of a signature, traced). It becomes a vector drawing on the page, not a picture.
 */
export interface SignatureShape {
  /** Each curve as x, y, x, y, … in the box. */
  curves: number[][]
  areContours: boolean
  /** A drawn line's width, in the box's units; 0 for outlines. */
  thickness: number
  width: number
  height: number
}

export interface SavedSignature {
  id: string
  /** The name shown for it, also its description in the PDF. */
  description: string
  shape: SignatureShape
}

const STORAGE_KEY = 'awpdf.imzalar'
/** As pdf.js's own viewer: a few, so the bar stays one row. */
export const MAX_SAVED_SIGNATURES = 5

/** Points to two decimals: the box is some hundreds wide, so this is far below a pixel. */
function rounded(shape: SignatureShape): SignatureShape {
  return { ...shape, curves: shape.curves.map(curve => curve.map(value => Math.round(value * 100) / 100)) }
}

function isShape(value: unknown): value is SignatureShape {
  const shape = value as SignatureShape
  return typeof shape === 'object' && shape !== null && Array.isArray(shape.curves)
    && shape.curves.every(curve => Array.isArray(curve) && curve.every(Number.isFinite))
    && typeof shape.areContours === 'boolean' && Number.isFinite(shape.thickness)
    && shape.width > 0 && shape.height > 0
}

/** The user's signatures, kept on this device only (like the recent files). */
export class SignatureStore {
  constructor(private readonly store: Store) {}

  list(): SavedSignature[] {
    try {
      const items: unknown = JSON.parse(this.store.getItem(STORAGE_KEY) ?? '[]')
      if (!Array.isArray(items)) return []
      return items.filter((item): item is SavedSignature => typeof item?.id === 'string'
        && typeof item.description === 'string' && isShape(item.shape)).slice(0, MAX_SAVED_SIGNATURES)
    } catch {
      return []
    }
  }

  get isFull(): boolean {
    return this.list().length >= MAX_SAVED_SIGNATURES
  }

  /** Keeps a signature first in the list; false when there is no room or the device refuses. */
  add(description: string, shape: SignatureShape): SavedSignature | null {
    const items = this.list()
    if (items.length >= MAX_SAVED_SIGNATURES) return null
    const saved: SavedSignature = { id: crypto.randomUUID(), description, shape: rounded(shape) }
    return this.write([saved, ...items]) ? saved : null
  }

  remove(id: string): void {
    this.write(this.list().filter(item => item.id !== id))
  }

  private write(items: SavedSignature[]): boolean {
    try {
      this.store.setItem(STORAGE_KEY, JSON.stringify(items))
      return true
    } catch {
      return false
    }
  }
}

/** Strokes drawn in a box, each as x, y, x, y, … */
export function drawnShape(strokes: readonly number[][], width: number, height: number, thickness: number): SignatureShape | null {
  const curves = strokes.filter(stroke => stroke.length >= 2)
  return curves.length > 0 ? { curves, areContours: false, thickness, width, height } : null
}

type Traced = { newCurves: number[][]; areContours: boolean; thickness: number; width: number; height: number } | null

function traced(result: Traced): SignatureShape | null {
  if (!result || result.newCurves.length === 0) return null
  const { newCurves, areContours, thickness, width, height } = result
  return { curves: newCurves.map(curve => Array.from(curve)), areContours, thickness, width, height }
}

/**
 * Typed text traced into outlines in a handwriting-like font where the device has one. The page
 * size pdf.js asks for only scales its own preview; the shape keeps the text's box.
 */
export function textShape(text: string, font: { fontFamily: string; fontStyle: string; fontWeight: string }): SignatureShape | null {
  if (!text.trim()) return null
  return traced(SignatureExtractor.extractContoursFromText(text.trim(), font, 1, 1, 0, 0) as Traced)
}

/** A picture of a signature (on paper, photographed) traced into outlines. */
export function imageShape(bitmap: ImageBitmap): SignatureShape | null {
  return traced(SignatureExtractor.process(bitmap, 1, 1, 0, 0) as Traced)
}

/** The shape as an SVG path inside its box, for previews. */
export function shapePath(shape: SignatureShape): string {
  return shape.curves.map(curve => {
    const points: string[] = []
    for (let index = 0; index + 1 < curve.length; index += 2) points.push(`${curve[index].toFixed(1)} ${curve[index + 1].toFixed(1)}`)
    return `M${points.join('L')}${shape.areContours ? 'Z' : ''}`
  }).join('')
}

/** A small picture of the signature, for buttons and the dialog's preview. */
export function shapeSvg(shape: SignatureShape, label: string): string {
  const paint = shape.areContours
    ? 'fill="currentColor" fill-rule="evenodd" stroke="none"'
    // Thicker than on the page: the picture is small.
    : `fill="none" stroke="currentColor" stroke-width="${Math.max(shape.thickness * 2, shape.width / 60)}" stroke-linecap="round" stroke-linejoin="round"`
  const title = label.replace(/[<>&"]/g, character => `&#${character.charCodeAt(0)};`)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${shape.width} ${shape.height}" role="img" aria-label="${title}"`
    + ` preserveAspectRatio="xMidYMid meet"><path d="${shapePath(shape)}" ${paint}/></svg>`
}
