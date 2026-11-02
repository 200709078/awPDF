# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

awPDF is a PDF viewer in the spirit of Adobe Reader (pdf.js, TypeScript + Vite) shipped as a web app, an Electron desktop app (Linux AppImage/deb, Windows NSIS) and an Android app (Capacitor, APK). More PDF tools will be added later. It is meant for class smart boards (Pardus ETAP) as well as phones and PCs. The UI, test names, docs (README, `docs/yol-haritasi.md`) and messages are in **Turkish** — keep new user-facing strings and docs in Turkish.

Status: the web app is live at `madematik.com/awPDF/` (deploy with `npm run deploy`) and packages are on GitHub Releases since 0.0.2. What is done and what remains is in `docs/yol-haritasi.md`; record new requests there with a date and do not implement any item until the user explicitly asks.

## Decisions (2026-11-02, the user's)

- **Stack:** the drAW family's: TypeScript + Vite, Electron, Capacitor. **Engine:** pdf.js (`pdfjs-dist`), its `PDFViewer` components with our own UI; never its ready-made `viewer.html`.
- **Platforms:** Linux, Windows, Android, and the web at `madematik.com/awPDF/`. iOS waits (it needs a Mac and a paid Apple account).
- **Repository:** own public repository `github.com/200709078/awPDF`, MIT. **App ID** `com.madematik.awpdf` is permanent (Play Store).
- **Release files:** `.github/workflows/release.yml` and `scripts/release-assets.mjs` stay byte-identical with drAW, drAW2D and drAW3D. Android uses the family's shared signing key.
- **Class smart boards from the start:** touch comes first (large targets), then an on-screen keyboard and a presentation mode (roadmap).
- **Tabs:** tabs on desktop; a single document on Android.
- **Large files:** above 200 MB, on every platform, the user is warned and may still open the file (`core/open-policy.ts`). **Nothing is ever refused**, and there is no page limit: page count is known only after opening and says little about the load. Per-platform values may come later if tests call for them. The real protection is inside the app: partial reading, drawing only visible pages, on-demand cancellable search, a per-page pixel limit.
- **Dark theme** colours the interface only; PDF pages keep their own colours.
- **The first version never changes a PDF.** When editing tools come, the default is "Save as"; the original is never overwritten silently.
- **Local only:** a PDF never leaves the device and the app needs no network. No analytics, no remote fonts.
- **Goal limit:** editing a PDF's existing text like a word processor is not a goal.

## Commands

Node >= 22.13 (`.nvmrc`: 22).

```bash
npm ci
npm run dev              # Vite dev server
npm run typecheck        # tsc for src/ and for electron/ (tsconfig.electron.json)
npm run build            # typecheck + compile electron shell + vite build → dist/, dist-electron/
npm run deploy           # build + upload dist/ to public_html/public/awPDF over FTP (scripts/deploy-ftp.mjs, .env); add `-- --dry-run` to only list changes. Live site: the user runs it, never run it unasked
npm test                 # Playwright (Chromium); starts Vite dev server on 127.0.0.1:4175
TEST_PREVIEW=1 npm test  # same tests against built dist/ via vite preview (run build first, stop dev server)
npx playwright test tests/tools.spec.ts                   # single file
npx playwright test -g "büyük dosya"                      # single test by title
npm run electron:dev     # Electron against the Vite dev server
npm run test:electron    # build, then open the app and a PDF in Electron (needs a graphical session)
npx electron-builder --dir && AWPDF_ELECTRON_EXECUTABLE=$PWD/release/linux-unpacked/awpdf node scripts/test-electron.mjs   # the same check on the packaged app (asar)
npm run dist:linux | dist:win
npm run android:sync     # build + copy dist/ into android/ (Capacitor)
npm run android:apk      # release APK; signed when ANDROID_KEYSTORE, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD are set
bash scripts/icons.sh    # regenerate every icon from public/img/app-icon.svg (Inkscape + ImageMagick)
```

Playwright uses `/usr/bin/chromium` if present, otherwise `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, otherwise its own Chromium. Port 4175 keeps these tests from colliding with drAW2D and drAW3D (both 4173), so they may run at the same time.

## Architecture

- `src/main.ts` mounts the desktop title bar and calls `startApp`; `src/app/app.ts` is the composition root connecting the platform, the document view and the tools, and owns the open flow (large file warning, load, errors).
- **Platform layer** (`src/platform/`): `Platform` is everything that differs between Electron, Android and the web; the rest of the app talks only to it. `core/recent-files.ts` keeps the recent list and the page each document was left on, keyed by pdf.js's fingerprint, in `localStorage`; the way back to a file is the platform's `PdfFile.source` + `reopen`: a file handle in IndexedDB on Chromium, an opaque id on the desktop, a persisted content URI on Android (from its own picker). Without a source the user picks the file again. Files arrive through `onFile`, not as the picker's return value, because the system's "open with" and drag and drop deliver files too. `browser.ts` is the base; `desktop.ts` and `android.ts` override only what differs (full screen, print, share, opening links). All three use the browser's file picker and take dropped files where the system allows it; on Android and the desktop "open with" delivers files as well.
- **Partial reading** (`src/core/`): `PdfFile` (`name`, `size`, `read(begin, end)`) is how every platform hands over a file. `pdf-document.ts` feeds it to pdf.js through a `PDFDataRangeTransport` with `disableAutoFetch` and `disableStream`, so a file is never read whole (`tests/viewer-integration.spec.ts` "büyük dosya bütünüyle okunmaz" measures this). `enableXfa` is off and the viewer gets no scripting manager, so a PDF's own scripts never run.
- **pdf.js import order:** `pdf_viewer.mjs` reads `globalThis.pdfjsLib` while loading, so `core/pdfjs-global.ts` must be imported first. The **legacy** build is deliberate: it also runs in the older WebViews of school tablets. The version is pinned; read its changelog before bumping (6.x removed `PDFDocumentProxy.destroy` and `isEvalSupported`).
- **pdf.js assets:** `cmaps`, `iccs`, `standard_fonts`, `wasm` are copied from `node_modules` into `public/pdfjs/` by the plugin in `vite.config.ts` (gitignored) and so ship with every build. `public/.htaccess` gives `.mjs` a JavaScript type, without which the web host would break the worker.
- **Tools** (`src/tools/`): a `Tool` declares its label, icon, shortcuts, availability (`needsDocument`, `isAvailable`), an on/off state (`isActive`), platform support (`isSupported`), whether it has a button (`inToolbar`) and `run(context)`; `tools/index.ts` is the single list, and `ui/toolbar.ts` builds the buttons (ID `tool-<id>`) and the shortcuts from it. The row never scrolls: by width, not by device, the buttons that do not fit move from the last one back into the `#toolbarMenu` menu, the same elements, shown there with their names. A new feature is a new file there, plus panels when they are needed; the core stays untouched. Tools reach the document and the platform only through `ToolContext`.
- `src/app/document-view.ts`: wraps `PDFViewer`, `EventBus` and `PDFLinkService`. pdf.js draws only visible pages and keeps its own per-page pixel limit (lower on phones), so we set none. Fit-width and fit-height are reapplied when the container resizes; a zoom the user chose is kept. Two-page view pairs 1-2, 3-4 (`SpreadMode.ODD`); pdf.js resets it with each document, so `pagesinit` reapplies the choice. Outside links go through `ConfirmingLinkService` → `confirmExternalLink`, showing the whole address; only `core/links.ts` protocols leave the app, checked again in `electron/main.ts`. Search uses `TurkishFindController`: pdf.js's `match` receives text folded by `core/turkish-search.ts` (same length, so positions hold), because case-insensitive regexes do not know I/ı and İ/i. Closing the search detaches the finder (after a microtask, or `findbarclose` never clears the highlights), which stops its page-by-page reading.
- `src/ui/side-panel.ts` is the panel beside the document (a drawer over it below 700px, where a choice closes it); it starts closed and is toggled by the `sidePanel` tool. It slides in pure CSS (`@starting-style`, `transition-behavior: allow-discrete`) on the `hidden` attribute, so older browsers just skip the animation; `DocumentView` refits only after the size settles, so the slide does not redraw the page each frame. The contents of the roadmap (içindekiler) become a tab here. `src/ui/thumbnails.ts` fills it: pdf.js does not export its thumbnail viewer, so this is ours. Thumbnails are drawn one at a time through an `IntersectionObserver` and released when they leave the view margin, so a closed panel draws nothing and a long book stays cheap.
- `src/app/gestures.ts`: pinch and ctrl+wheel call `zoomAt` (`updateScale` with a `drawingDelay`, so a pinch stretches the page and redraws after it stops); in single page view a swipe or the wheel at the edge turns the page. With nothing to scroll sideways it cancels horizontal `touchmove`s, because otherwise Chromium takes them as the back gesture and leaves the app; `overscroll-behavior` does not help on a non-scrolling viewport.
- `src/app/print.ts`: pdf.js does not export its print service. Pages become 150 DPI images in `#printContainer`, which the `@media print` styles show alone; the view's rotation does not apply. Android prints the WebView through `AwPdfNativePlugin`, and keeps the images until the next print, since the print service reads them later.
- `electron/main.ts`: shell only. Production loads `awpdf://app/` (a privileged custom scheme, served from `dist/` with a CSP), **not `file://` as the siblings do**: documents are untrusted, and this way a page can neither read the disk nor reach the network. `nodeIntegration: false`, `contextIsolation`, `sandbox`; navigation and new windows are denied. The window is frameless: `electron/preload.cts` (compiled to `dist-electron/preload.cjs`) exposes only `window.awPDFDesktop` (`windowControls`, `files`), and `src/ui/title-bar.ts` draws the bar only when that API exists. `electron/files.ts` reads files for the page, in parts, by number; the page never learns a path (`adopt` takes a real `File`, `reopen` an opaque `source` kept in `dosyalar.json`). One instance only: a second start hands its files over. `.pdf` is registered through `build.fileAssociations`.
- `android/`: the Capacitor 8 project, taken from drAW2D (committed; `android/app/src/main/assets/public` is generated by `cap sync`). `app/build.gradle` reads `versionName` from `package.json` and `versionCode = major·10000 + minor·100 + patch` (minor, patch < 100), and signs release builds from the `ANDROID_KEYSTORE*` environment. `MainActivity` fixes the WebView `textZoom` at 100. `AwPdfNativePlugin.java` prints, shares (the PDF is copied in chunks to the cache, then offered through `FileProvider`), hides the system bars and takes the back button: `app/back.ts` closes the topmost thing on screen, and with nothing left to close the app goes behind the others. `<input type=file>` is the picker. A PDF from "open with" (intent filters in the manifest) reaches `handleOnNewIntent`, which Capacitor also calls for the launch intent, and then the page through the retained `fileOpened` event; `readFile` serves ranges from its descriptor, so it too is read in parts, and a pipe (no size, no seeking) is copied to the cache first. The signing key never enters the repository.
- Icons: the source is `public/img/app-icon.svg` (the family style: a blue A and a red W, here on a page with a folded corner); `scripts/icons.sh` generates the rest.
- Stylesheets are linked from `index.html`, not imported in TS, so the first paint is styled. Vite `base: './'`.

## Releases

GitHub Releases is the only place packages are published. Same as the siblings:

- **Build:** `.github/workflows/release.yml` builds Linux on `ubuntu-latest`, Windows on `windows-latest` and the signed APK (secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`; missing secrets fail the job, so nothing is published). Never cross-build Windows from Linux and never upload release assets by hand.
- **Version:** `package.json` is the single source. New release: `npm version patch`, then `git push --follow-tags`; ask the user first. The workflow fails if the tag differs from `package.json`.
- **Build only, nothing published:** `gh workflow run release.yml -f yayinla=false`.
- **Asset names have no version:** `awPDF-linux-amd64.deb`, `awPDF-linux-x86_64.AppImage`, `awPDF-win-x64.exe`, `awPDF-android.apk`.
- **Shared files:** the workflow and `scripts/release-assets.mjs` are identical copies in drAW, drAW2D, drAW3D and awPDF — change all four together. Change release notes in the script, not on GitHub.
- **Trigger quirk:** push a new or changed workflow file before the tag.
- **Metadata:** license MIT (same text in all four repos), deb `Section: education`, `.desktop` categories `Office;Viewer;Education`.

## Tests

Playwright specs in `tests/`: `tools.spec.ts` imports `src/` modules directly; `viewer-integration.spec.ts` and `reading.spec.ts` drive the UI through `#pdfInput`. Touch is real: CDP `Input.dispatchTouchEvent` with `hasTouch`. `tests/helpers/make-pdf.mjs` writes real PDFs in memory, so no binary fixtures are committed; `scripts/test-electron.mjs` uses it too. Android cannot be run here (no device or emulator): `tests/helpers/android-bridge.ts` stands in for Capacitor's native side, so the Android platform's TypeScript runs in Chromium (`tests/android.spec.ts`); `assembleDebug` checks the Java, which must be tried on a device.

`dist/`, `dist-electron/`, `release/`, `public/pdfjs/` are build outputs and not committed.
