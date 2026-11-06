import { fromBase64 } from '../core/base64'
import type { JpegImage } from '../core/images-to-pdf'

/** Enough for an A4 page at 300 DPI; a phone's 12-megapixel photo is made smaller. */
const MAX_SIDE = 3508
const JPEG_QUALITY = 0.9

/** Files the browser can draw: photos, screenshots and pictures from the web. */
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/bmp,.jpg,.jpeg,.png,.webp,.gif,.bmp'

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name)
}

/**
 * A picture as a JPEG for a PDF page. A phone stores a photo as it was taken and only notes which
 * way is up; the browser turns it upright here, which a JPEG put in a PDF as it is would not.
 * Transparent parts become white.
 */
export async function jpegFromFile(file: Blob): Promise<JpegImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')!
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const data = canvasBytes(canvas, 'image/jpeg', JPEG_QUALITY)
    const { width, height } = canvas
    canvas.width = 0
    return { data, width, height }
  } finally {
    bitmap.close()
  }
}

/**
 * The canvas as an image file. Not `toBlob`: it waits for idle time, which an Android WebView
 * gives only some four seconds later, for each page; `toDataURL` encodes at once (0.1-0.2 s for a
 * page on a phone, measured 2026-11-06).
 */
export function canvasBytes(canvas: HTMLCanvasElement, type: string, quality?: number): Uint8Array {
  const url = canvas.toDataURL(type, quality)
  // A browser that cannot write the type gives a PNG instead.
  if (!url.startsWith(`data:${type};base64,`)) throw new Error('Görsel oluşturulamadı.')
  return fromBase64(url.slice(url.indexOf(',') + 1))
}
