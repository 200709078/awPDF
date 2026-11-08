import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { open, readFile, writeFile, type FileHandle } from 'node:fs/promises'
import path from 'node:path'

const MAX_SOURCES = 100
/** What the page may save; anything else becomes a PDF. */
const SAVE_EXTENSIONS: ReadonlySet<string> = new Set(['pdf', 'png', 'jpg', 'zip', 'docx'])

interface SaveType {
  extension: string
  description: string
}

export interface OpenedFile {
  id: number
  name: string
  size: number
  /** Stands for the path, which the page never learns; `files:reopen` accepts only these. */
  source: string
}

/**
 * The page has no access to the disk. It reads the files the user gave the app (a double click,
 * a picker, a drop) through here, piece by piece and only by the numbers handed out.
 */
export class DesktopFiles {
  private readonly handles = new Map<number, FileHandle>()
  /** Where each open file is; never sent to the page. */
  private readonly paths = new Map<number, string>()
  private lastId = 0
  private sources: Record<string, string> = {}
  private readonly sourcesPath = path.join(app.getPath('userData'), 'dosyalar.json')
  private readonly loaded = readFile(this.sourcesPath, 'utf8').then(
    text => { this.sources = JSON.parse(text) as Record<string, string> },
    () => undefined,
  )

  async open(filePath: string): Promise<OpenedFile> {
    await this.loaded
    const handle = await open(filePath, 'r')
    const { size } = await handle.stat()
    const id = ++this.lastId
    this.handles.set(id, handle)
    this.paths.set(id, filePath)
    return { id, name: path.basename(filePath), size, source: await this.sourceOf(filePath) }
  }

  register(): void {
    ipcMain.handle('files:adopt', (_event, filePath: unknown) => {
      return typeof filePath === 'string' ? this.open(filePath) : null
    })
    ipcMain.handle('files:read', async (_event, id: unknown, begin: unknown, end: unknown) => {
      const handle = this.handles.get(id as number)
      if (!handle || typeof begin !== 'number' || typeof end !== 'number') throw new Error('Dosya açık değil.')
      const buffer = new Uint8Array(end - begin)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, begin)
      return buffer.subarray(0, bytesRead)
    })
    ipcMain.on('files:close', (_event, id: unknown) => {
      void this.handles.get(id as number)?.close().catch(console.error)
      this.handles.delete(id as number)
      this.paths.delete(id as number)
    })
    ipcMain.handle('files:save', (event, name: unknown, data: unknown, nearId: unknown, type: unknown) => {
      if (typeof name !== 'string' || !(data instanceof Uint8Array)) throw new Error('Kaydedilecek dosya yok.')
      const { extension, description } = (type ?? {}) as Partial<SaveType>
      const known = typeof extension === 'string' && SAVE_EXTENSIONS.has(extension) && typeof description === 'string'
      return this.save(BrowserWindow.fromWebContents(event.sender), name, data, nearId, known ? { extension, description } : { extension: 'pdf', description: 'PDF' })
    })
    ipcMain.handle('files:reopen', async (_event, source: unknown) => {
      await this.loaded
      const filePath = typeof source === 'string' ? this.sources[source] : undefined
      if (!filePath) return null
      return this.open(filePath).catch(() => null)
    })
  }

  /**
   * A new file where the user chooses. A file the page is reading is never written over: it would
   * change under the open document.
   */
  private async save(window: BrowserWindow | null, name: string, data: Uint8Array, nearId: unknown, type: SaveType): Promise<{ name: string } | { refused: true } | null> {
    const near = this.paths.get(nearId as number)
    const options = {
      defaultPath: path.join(near ? path.dirname(near) : app.getPath('documents'), path.basename(name)),
      filters: [{ name: type.description, extensions: [type.extension] }],
    }
    const { canceled, filePath } = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
    if (canceled || !filePath) return null
    const target = filePath.toLowerCase().endsWith(`.${type.extension}`) ? filePath : `${filePath}.${type.extension}`
    if ([...this.paths.values()].some(open => path.resolve(open) === path.resolve(target))) return { refused: true }
    await writeFile(target, data)
    return { name: path.basename(target) }
  }

  private async sourceOf(filePath: string): Promise<string> {
    const known = Object.keys(this.sources).find(source => this.sources[source] === filePath)
    if (known) return known
    const source = randomUUID()
    this.sources[source] = filePath
    for (const oldest of Object.keys(this.sources).slice(0, -MAX_SOURCES)) delete this.sources[oldest]
    await writeFile(this.sourcesPath, JSON.stringify(this.sources)).catch(console.error)
    return source
  }
}
