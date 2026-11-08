import { cpSync, mkdirSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'

/**
 * pdf.js reads these at run time; they ship with the app so nothing needs the network. Copied in
 * `config`, before the dev server lists `public/`: a file put there later is not served (it was
 * on CI, where the folder is new each time, and the page got index.html instead).
 */
function pdfjsAssets(): Plugin {
  return {
    name: 'pdfjs-assets',
    config() {
      for (const folder of ['cmaps', 'iccs', 'standard_fonts', 'wasm']) {
        cpSync(`node_modules/pdfjs-dist/${folder}`, `public/pdfjs/${folder}`, { recursive: true })
      }
    },
  }
}

/**
 * Text recognition (OCR) runs on the device too: tesseract.js's worker, its WebAssembly core (the
 * SIMD build only, 4 MB; one per CPU feature set would be 12) and the Turkish model (best_int, 2 MB).
 */
function ocrAssets(): Plugin {
  return {
    name: 'ocr-assets',
    config() {
      mkdirSync('public/ocr', { recursive: true })
      cpSync('node_modules/tesseract.js/dist/worker.min.js', 'public/ocr/worker.min.js')
      cpSync('node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'public/ocr/tesseract-core-simd-lstm.wasm.js')
      cpSync('node_modules/@tesseract.js-data/tur/4.0.0_best_int/tur.traineddata.gz', 'public/ocr/tur.traineddata.gz')
    },
  }
}

export default defineConfig({
  // The same output runs on a static web server, in Electron and in the Android WebView.
  base: './',
  plugins: [pdfjsAssets(), ocrAssets()],
  build: {
    rolldownOptions: {
      output: {
        // pdf.js is its own chunk: the browser cache keeps it when only the app code changes.
        codeSplitting: {
          groups: [{ name: 'pdfjs', test: /node_modules[\\/]pdfjs-dist/ }],
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    watch: {
      ignored: ['**/dist-electron/**', '**/release/**', '**/public/pdfjs/**', '**/public/ocr/**'],
    },
  },
  preview: {
    host: '127.0.0.1',
  },
})
