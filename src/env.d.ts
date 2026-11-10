/** The app's version from package.json (vite.config.ts `define`), shown in Hakkında. */
declare const __APP_VERSION__: string

/** Window controls exposed by the Electron preload; absent in the browser. */
interface DesktopWindowControls {
  minimize(): void
  toggleMaximize(): void
  toggleFullscreen(): void
  setFullscreen(enabled: boolean): void
  close(): void
  isMaximized(): Promise<boolean>
  isFullscreen(): Promise<boolean>
  onMaximizeChanged(callback: (maximized: boolean) => void): void
  onFullscreenChanged(callback: (fullscreen: boolean) => void): void
}

/** A file on disk, opened by the Electron shell; `source` finds it again later. */
interface DesktopOpenedFile {
  id: number
  name: string
  size: number
  source: string
}

/** The disk as the page may see it: only files the user gave the app, and only by number. */
interface DesktopFiles {
  onOpened(callback: (file: DesktopOpenedFile) => void): void
  adopt(file: File): Promise<DesktopOpenedFile | null>
  read(id: number, begin: number, end: number): Promise<Uint8Array>
  close(id: number): void
  reopen(source: string): Promise<DesktopOpenedFile | null>
  /** Asks where to save, next to the file `nearId` when given; `refused` means an open file was chosen. */
  save(name: string, data: Uint8Array, nearId: number | undefined, type: { extension: string; description: string }): Promise<{ name: string } | { refused: true } | null>
}

/** Opens the system's on-screen keyboard for a text field. */
interface DesktopOffice {
  available(): Promise<boolean>
  /** Null without LibreOffice. */
  toPdf(extension: 'docx' | 'doc', data: Uint8Array): Promise<Uint8Array | null>
}

interface DesktopScreenKeyboard {
  show(requestId: string): Promise<'shown' | 'unavailable' | 'cancelled'>
  hide(requestId: string): void
}

interface FileSystemFileHandle {
  requestPermission(options: { mode: 'read' }): Promise<PermissionState>
}

interface Window {
  /** Chromium browsers on computers only. */
  showSaveFilePicker?(options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }): Promise<FileSystemFileHandle>
  showOpenFilePicker?(options: { types: { description: string; accept: Record<string, string[]> }[]; multiple: boolean }): Promise<FileSystemFileHandle[]>
  awPDFDesktop?: {
    windowControls?: DesktopWindowControls
    files?: DesktopFiles
    screenKeyboard?: DesktopScreenKeyboard
    office?: DesktopOffice
  }
}
