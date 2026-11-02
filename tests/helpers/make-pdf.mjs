import { createHash } from 'node:crypto'

// Küçük, gerçek bir PDF üretir; testler ikili dosya taşımaz.
// `padding`: hiçbir sayfanın başvurmadığı, o kadar baytlık bir nesne (büyük dosya denemesi için).
// `text`: sayfa sırasından o sayfanın metnini verir; WinAnsi dışında yalnız ı ve İ yazılabilir.
// `links`: { page, toPage } belge içi, { page, url } dış bağlantı (0'dan sayılır); sıraları
// satırlarını belirler, `linkTop` birincisinin yüksekliğidir.
// `outline`: içindekiler, { title, page, open, items } ya da { title, url } öğeleri.
// `password`: belgeyi bu parolayla şifreler (RC4, 40 bit).
export const linkTop = 640

const PASSWORD_PADDING = Buffer.from('28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A', 'hex')
const PERMISSIONS = Buffer.from([0xd4, 0xff, 0xff, 0xff])
const FILE_ID = Buffer.from('617750444664656e656d6531323334', 'hex')
const md5 = (...parts) => createHash('md5').update(Buffer.concat(parts)).digest()

function rc4(key, data) {
  const state = Array.from({ length: 256 }, (_, index) => index)
  for (let index = 0, mixed = 0; index < 256; index += 1) {
    mixed = (mixed + state[index] + key[index % key.length]) % 256
    ;[state[index], state[mixed]] = [state[mixed], state[index]]
  }
  let first = 0
  let second = 0
  return data.map(byte => {
    first = (first + 1) % 256
    second = (second + state[first]) % 256
    ;[state[first], state[second]] = [state[second], state[first]]
    return byte ^ state[(state[first] + state[second]) % 256]
  })
}

function encryption(password) {
  const padded = Buffer.concat([Buffer.from(password, 'latin1'), PASSWORD_PADDING]).subarray(0, 32)
  const owner = rc4(md5(padded).subarray(0, 5), padded)
  const key = md5(padded, owner, PERMISSIONS, FILE_ID).subarray(0, 5)
  const hex = bytes => Buffer.from(bytes).toString('hex')
  return {
    dictionary: `<< /Filter /Standard /V 1 /R 2 /O <${hex(owner)}> /U <${hex(rc4(key, PASSWORD_PADDING))}> /P -44 >>`,
    trailer: ` /ID [<${hex(FILE_ID)}> <${hex(FILE_ID)}>]`,
    stream: (id, text) => {
      const objectKey = md5(key, Buffer.from([id & 255, id >> 8, 0, 0, 0])).subarray(0, 10)
      return Buffer.from(rc4(objectKey, Buffer.from(text, 'latin1'))).toString('latin1')
    },
  }
}
const encoded = text => text.replaceAll('ı', '\xfd').replaceAll('İ', '\xdd')
export function makePdf({ pages = 3, padding = 0, text = index => `awPDF sayfa ${index + 1}`, links = [], outline = [], password } = {}) {
  const pageId = index => 4 + index * 2
  const paddingId = pageId(pages)
  const encryptId = paddingId + 1
  const secret = password === undefined ? null : encryption(password)
  const kids = Array.from({ length: pages }, (_, index) => `${pageId(index)} 0 R`).join(' ')
  const objects = new Map([
    [1, `<< /Type /Catalog /Pages 2 0 R ${outline.length > 0 ? `/Outlines ${encryptId + 1} 0 R` : ''} >>`],
    [2, `<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`],
    [3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding << /Type /Encoding '
      + '/BaseEncoding /WinAnsiEncoding /Differences [221 /Idotaccent 253 /dotlessi] >> >>'],
  ])
  for (let index = 0; index < pages; index += 1) {
    const content = `BT /F1 28 Tf 72 720 Td (${encoded(text(index))}) Tj ET`
    const annotations = links.flatMap((link, row) => {
      if (link.page !== index) return []
      const target = link.url ? `/A << /S /URI /URI (${link.url}) >>` : `/Dest [${pageId(link.toPage)} 0 R /Fit]`
      return `<< /Type /Annot /Subtype /Link /Rect [72 ${linkTop - 60 * row - 40} 372 ${linkTop - 60 * row}] /Border [0 0 0] ${target} >>`
    }).join(' ')
    objects.set(pageId(index), '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
      + `/Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId(index) + 1} 0 R /Annots [${annotations}] >>`)
    const stored = secret ? secret.stream(pageId(index) + 1, content) : content
    objects.set(pageId(index) + 1, `<< /Length ${stored.length} >>\nstream\n${stored}\nendstream`)
  }
  if (secret) objects.set(encryptId, secret.dictionary)
  if (outline.length > 0) {
    let nextId = encryptId + 2
    const addItems = (items, parentId) => {
      const ids = items.map(() => nextId++)
      items.forEach((item, index) => {
        const target = item.url ? `/A << /S /URI /URI (${item.url}) >>` : `/Dest [${pageId(item.page)} 0 R /Fit]`
        const siblings = `${index > 0 ? `/Prev ${ids[index - 1]} 0 R` : ''} ${index < ids.length - 1 ? `/Next ${ids[index + 1]} 0 R` : ''}`
        const children = item.items ? addItems(item.items, ids[index]) : []
        const family = children.length > 0
          ? `/First ${children[0]} 0 R /Last ${children.at(-1)} 0 R /Count ${item.open ? children.length : -children.length}`
          : ''
        objects.set(ids[index], `<< /Title (${encoded(item.title)}) /Parent ${parentId} 0 R ${siblings} ${family} ${target} >>`)
      })
      return ids
    }
    const top = addItems(outline, encryptId + 1)
    objects.set(encryptId + 1, `<< /Type /Outlines /First ${top[0]} 0 R /Last ${top.at(-1)} 0 R /Count ${top.length} >>`)
  }

  const chunks = [Buffer.from('%PDF-1.7\n', 'latin1')]
  const offsets = new Map()
  let offset = chunks[0].length
  const add = chunk => {
    chunks.push(chunk)
    offset += chunk.length
  }
  for (const [id, body] of objects) {
    offsets.set(id, offset)
    add(Buffer.from(`${id} 0 obj\n${body}\nendobj\n`, 'latin1'))
  }
  if (padding > 0) {
    offsets.set(paddingId, offset)
    add(Buffer.from(`${paddingId} 0 obj\n<< /Length ${padding} >>\nstream\n`, 'latin1'))
    add(Buffer.alloc(padding, 0x20))
    add(Buffer.from('\nendstream\nendobj\n', 'latin1'))
  }

  const size = Math.max(...offsets.keys()) + 1
  const entries = Array.from({ length: size - 1 }, (_, index) => (offsets.has(index + 1)
    ? `${String(offsets.get(index + 1)).padStart(10, '0')} 00000 n \n`
    : '0000000000 00000 f \n')).join('')
  const encrypted = secret ? ` /Encrypt ${encryptId} 0 R${secret.trailer}` : ''
  add(Buffer.from(`xref\n0 ${size}\n0000000000 65535 f \n${entries}`
    + `trailer\n<< /Size ${size} /Root 1 0 R${encrypted} >>\nstartxref\n${offset}\n%%EOF\n`, 'latin1'))
  return Buffer.concat(chunks)
}
