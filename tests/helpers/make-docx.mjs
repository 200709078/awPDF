import { Document, Packer, PageBreak, Paragraph, SymbolRun, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';

/**
 * A Word document written in memory (the `docx` library, a dev dependency only), so no binary
 * fixtures are committed. A4 pages: a title page, a page with a table after a page break, then
 * `lines` numbered lines with no break, which run on over several pages, as in a document that no
 * Word has laid out (no "last rendered page break" marks).
 */
export async function makeDocx({ lines = 0 } = {}) {
  const children = [
    new Paragraph({ children: [new TextRun({ text: 'Birinci sayfa: Işık, ağaç, şeker, İğne', size: 48, bold: true })] }),
    new Paragraph({ children: [new TextRun({ text: 'Çalışma kâğıdı; öğrenci adı ve sınıfı.', size: 24 })] }),
    // Signs as old documents write them: letters in the Symbol font, and Word's symbols (w:sym).
    new Paragraph({ children: [
      new TextRun({ text: 'İşaretler: ', size: 24 }),
      new TextRun({ text: 'a \u00b3 b, p r\u00b2', size: 24, font: 'Symbol' }),
      new TextRun({ text: ' kutu ', size: 24 }),
      new SymbolRun({ char: 'F0FE', symbolfont: 'Wingdings', size: 24 }),
      new SymbolRun({ char: 'F0B9', symbolfont: 'Symbol', size: 24 }),
    ] }),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ children: [new TextRun({ text: 'İkinci sayfa: tablo', size: 32 })] }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [['Ad', 'Not'], ['Ayşe', '90'], ['Ömer', '85']].map(cells => new TableRow({
        children: cells.map(text => new TableCell({ children: [new Paragraph(text)] })),
      })),
    }),
  ];
  if (lines > 0) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    for (let line = 1; line <= lines; line += 1) {
      children.push(new Paragraph({ children: [new TextRun({ text: `Satır ${line}: uzun belgenin bir satırı.`, size: 24 })] }));
    }
  }
  const document = new Document({
    sections: [{
      // A4 with 2.5 cm margins, in twentieths of a point.
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1417, bottom: 1417, left: 1417, right: 1417 } } },
      children,
    }],
  });
  return Buffer.from(await Packer.toBuffer(document));
}
