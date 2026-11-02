// Küçük, gerçek bir PDF üretir; testler ikili dosya taşımaz.
// `padding`: hiçbir sayfanın başvurmadığı, o kadar baytlık bir nesne (büyük dosya denemesi için).
export function makePdf({ pages = 3, padding = 0 } = {}) {
  const pageId = index => 4 + index * 2
  const paddingId = pageId(pages)
  const kids = Array.from({ length: pages }, (_, index) => `${pageId(index)} 0 R`).join(' ')
  const objects = new Map([
    [1, '<< /Type /Catalog /Pages 2 0 R >>'],
    [2, `<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`],
    [3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'],
  ])
  for (let index = 0; index < pages; index += 1) {
    const content = `BT /F1 28 Tf 72 720 Td (awPDF sayfa ${index + 1}) Tj ET`
    objects.set(pageId(index), '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
      + `/Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId(index) + 1} 0 R >>`)
    objects.set(pageId(index) + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
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
  const entries = Array.from({ length: size - 1 }, (_, index) =>
    `${String(offsets.get(index + 1)).padStart(10, '0')} 00000 n \n`).join('')
  add(Buffer.from(`xref\n0 ${size}\n0000000000 65535 f \n${entries}`
    + `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`, 'latin1'))
  return Buffer.concat(chunks)
}
