/**
 * Turns pages of a PDF that pdf.js has just written, by an incremental update: each turned page
 * object is written again under its own number with a new /Rotate, followed by a cross-reference
 * section of the same kind as the last one. Numbers are never encrypted and every object keeps its
 * number, so an encrypted file stays valid under its password. `turns` holds, in page order, the
 * degrees to add to each page.
 */
export function rotatePages(bytes: Uint8Array, turns: readonly number[]): Uint8Array {
  const text = latin1(bytes)
  const startxref = /startxref\s+(\d+)\s*%%EOF\s*$/.exec(text)
  if (!startxref) throw new Error('PDF sonu okunamadı.')
  const previous = Number(startxref[1])
  const isTable = text.startsWith('xref', previous)
  const trailer = isTable ? text.slice(text.indexOf('trailer', previous), text.indexOf('startxref', previous)) : dictionaryOf(text, previous)
  const size = Number(/\/Size\s+(\d+)/.exec(trailer)?.[1])
  const root = refAfter(trailer, 'Root')
  if (!size || root === null) throw new Error('PDF sözlüğü okunamadı.')

  const pages = leafPages(text, refAfter(objectText(text, root), 'Pages'))
  if (pages.length !== turns.length) throw new Error('Sayfa sayısı tutmuyor.')

  const parts: string[] = ['\n']
  let offset = bytes.length + 1
  const offsets = new Map<number, number>()
  pages.forEach((page, index) => {
    const turn = ((turns[index] % 360) + 360) % 360
    if (turn === 0) return
    const body = objectText(text, page)
    const rotate = /\/Rotate\s+(-?\d+)/.exec(body)
    const angle = (((rotate ? Number(rotate[1]) : 0) + turn) % 360 + 360) % 360
    const changed = rotate ? body.replace(rotate[0], `/Rotate ${angle}`) : body.replace('<<', `<< /Rotate ${angle}`)
    const object = `${page} 0 obj\n${changed}\nendobj\n`
    offsets.set(page, offset)
    parts.push(object)
    offset += object.length
  })
  if (offsets.size === 0) return bytes

  const kept = ['Root', 'Info', 'Encrypt'].flatMap(key => {
    const ref = refAfter(trailer, key)
    return ref === null ? [] : [`/${key} ${ref} 0 R`]
  })
  const id = arrayAfter(trailer, 'ID')
  if (id) kept.push(`/ID ${id}`)
  const numbers = [...offsets.keys()].sort((a, b) => a - b)
  if (isTable) {
    const rows = numbers.map(number => `${number} 1\n${String(offsets.get(number)).padStart(10, '0')} 00000 n \n`).join('')
    parts.push(`xref\n${rows}trailer\n<< /Size ${size} ${kept.join(' ')} /Prev ${previous} >>\nstartxref\n${offset}\n%%EOF\n`)
  } else {
    // The cross-reference stream is a new object of its own, the last number of the file.
    offsets.set(size, offset)
    numbers.push(size)
    const entries = numbers.map(number => [1, ...bigEndian(offsets.get(number)!, 4), 0, 0])
    const data = String.fromCharCode(...entries.flat())
    const index = numbers.map(number => `${number} 1`).join(' ')
    parts.push(`${size} 0 obj\n<< /Type /XRef /Size ${size + 1} ${kept.join(' ')} /Prev ${previous} /Index [${index}] /W [1 4 2] /Length ${data.length} >>\nstream\n${data}\nendstream\nendobj\nstartxref\n${offset}\n%%EOF\n`)
  }
  const tail = parts.join('')
  const result = new Uint8Array(bytes.length + tail.length)
  result.set(bytes)
  for (let index = 0; index < tail.length; index += 1) result[bytes.length + index] = tail.charCodeAt(index)
  return result
}

function latin1(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes)
}

function bigEndian(value: number, length: number): number[] {
  return Array.from({ length }, (_, index) => Math.floor(value / 256 ** (length - 1 - index)) % 256)
}

/** The dictionary of the object that starts at `offset`. */
function dictionaryOf(text: string, offset: number): string {
  const start = text.indexOf('<<', offset)
  const end = text.indexOf('stream', start)
  if (start === -1 || end === -1) throw new Error('PDF sözlüğü okunamadı.')
  return text.slice(start, end)
}

/** The body of a plain object, as pdf.js writes them: at the start of a line, not in a stream. */
function objectText(text: string, number: number): string {
  const header = `\n${number} 0 obj`
  const start = text.lastIndexOf(header)
  if (start === -1) throw new Error(`Nesne ${number} bulunamadı.`)
  const end = text.indexOf('endobj', start)
  const body = text.slice(start + header.length, end).trim()
  if (!body.startsWith('<<') || /\bstream\b/.test(body)) throw new Error(`Nesne ${number} düz bir sözlük değil.`)
  return body
}

function refAfter(dictionary: string, key: string): number | null {
  const match = new RegExp(`/${key}\\s+(\\d+)\\s+0\\s+R`).exec(dictionary)
  return match ? Number(match[1]) : null
}

/** The page objects in order, following the page tree. */
function leafPages(text: string, node: number | null, seen = new Set<number>()): number[] {
  if (node === null || seen.has(node)) throw new Error('Sayfa ağacı okunamadı.')
  seen.add(node)
  const body = objectText(text, node)
  if (!/\/Type\s*\/Pages\b/.test(body)) return [node]
  const kids = /\/Kids\s*\[([^\]]*)\]/.exec(body)?.[1] ?? ''
  return [...kids.matchAll(/(\d+)\s+0\s+R/g)].flatMap(([, kid]) => leafPages(text, Number(kid), seen))
}

/** An array value as written, strings with brackets in them included. */
function arrayAfter(dictionary: string, key: string): string | null {
  const keyAt = dictionary.search(new RegExp(`/${key}\\s*\\[`))
  if (keyAt === -1) return null
  const start = dictionary.indexOf('[', keyAt)
  let depth = 0
  for (let index = start; index < dictionary.length; index += 1) {
    const char = dictionary[index]
    if (char === '\\') index += 1
    else if (char === '(') depth += 1
    else if (char === ')') depth -= 1
    else if (char === ']' && depth === 0) return dictionary.slice(start, index + 1)
  }
  return null
}
