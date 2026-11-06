import { PDFDocument, StandardFonts } from 'pdf-lib'

// Doldurulabilir alanları olan bir PDF: tek satırlık metin "ad", çok satırlık "not", onay kutusu
// "onay" ve açılır liste "sinif". `pages` kadar sayfa; alanlar ilk sayfadadır.
export async function makeFormPdf({ pages = 1 } = {}) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const form = pdf.getForm()
  for (let index = 0; index < pages; index += 1) {
    const page = pdf.addPage([612, 792])
    page.drawText(`Form sayfa ${index + 1}`, { x: 72, y: 720, size: 24, font })
  }
  const first = pdf.getPage(0)
  const name = form.createTextField('ad')
  name.addToPage(first, { x: 72, y: 600, width: 300, height: 30 })
  const note = form.createTextField('not')
  note.enableMultiline()
  note.addToPage(first, { x: 72, y: 450, width: 300, height: 100 })
  form.createCheckBox('onay').addToPage(first, { x: 72, y: 380, width: 24, height: 24 })
  const grade = form.createDropdown('sinif')
  grade.addOptions(['9-A', '10-B', '11-C'])
  grade.addToPage(first, { x: 72, y: 300, width: 150, height: 30 })
  form.updateFieldAppearances(font)
  return Buffer.from(await pdf.save())
}

/** Fields of a saved PDF, read back with pdf-lib. */
export async function readForm(bytes) {
  const form = (await PDFDocument.load(bytes)).getForm()
  return {
    ad: form.getTextField('ad').getText() ?? '',
    not: form.getTextField('not').getText() ?? '',
    onay: form.getCheckBox('onay').isChecked(),
    sinif: form.getDropdown('sinif').getSelected()[0] ?? '',
  }
}
