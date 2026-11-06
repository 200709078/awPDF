import { crc32, deflateSync } from 'node:zlib'

// Tek renkli, gerçek bir PNG: `width` × `height`, `color` [r, g, b]. Üst yarısı bu renk, alt yarısı
// beyazdır; böylece görselin dik mi döndürülmüş mü durduğu sonradan anlaşılır.
export function makePng({ width = 40, height = 30, color = [220, 30, 30] } = {}) {
  const row = width * 3 + 1
  const pixels = Buffer.alloc(row * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const rgb = y < height / 2 ? color : [255, 255, 255]
      pixels.set(rgb, y * row + 1 + x * 3)
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Width and height written in a PNG's header. */
export function pngSize(bytes) {
  const buffer = Buffer.from(bytes)
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}
