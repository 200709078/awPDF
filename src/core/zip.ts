/** A file to put in a ZIP archive. */
export interface ZipEntry {
  readonly name: string
  readonly data: Uint8Array
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * A ZIP archive with the files stored as they are: pictures are compressed already, and every
 * system opens such an archive. Names are UTF-8, so Turkish letters keep.
 */
export function zip(entries: readonly ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder()
  const local: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const { name, data } of entries) {
    const nameBytes = encoder.encode(name)
    const crc = crc32(data)
    // Version 2.0, flag 0x0800 (UTF-8 names), stored, no time.
    const common = [[20, 2], [0x0800, 2], [0, 2], [0, 2], [0x21, 2], [crc, 4], [data.length, 4], [data.length, 4], [nameBytes.length, 2], [0, 2]] as const
    const header = bytes([[0x04034b50, 4], ...common])
    local.push(header, nameBytes, data)
    central.push(bytes([[0x02014b50, 4], [20, 2], ...common, [0, 2], [0, 2], [0, 2], [0, 4], [offset, 4]]), nameBytes)
    offset += header.length + nameBytes.length + data.length
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0)
  const end = bytes([[0x06054b50, 4], [0, 2], [0, 2], [entries.length, 2], [entries.length, 2], [centralSize, 4], [offset, 4], [0, 2]])
  return concat([...local, ...central, end])
}

/** Little-endian fields of the given byte widths. */
function bytes(fields: readonly (readonly [number, number])[]): Uint8Array {
  const result = new Uint8Array(fields.reduce((sum, [, width]) => sum + width, 0))
  const view = new DataView(result.buffer)
  let offset = 0
  for (const [value, width] of fields) {
    if (width === 2) view.setUint16(offset, value, true)
    else view.setUint32(offset, value, true)
    offset += width
  }
  return result
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}
