import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

// pdf_viewer.mjs takes pdf.js from this global while it loads, so this module must be imported
// first. The legacy build also runs in the older WebViews of school tablets.
;(globalThis as { pdfjsLib?: typeof pdfjs }).pdfjsLib = pdfjs
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
