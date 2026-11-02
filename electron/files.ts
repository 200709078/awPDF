import { app, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { open, readFile, writeFile, type FileHandle } from 'node:fs/promises'
import path from 'node:path'

const MAX_SOURCES = 100

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
    })
    ipcMain.handle('files:reopen', async (_event, source: unknown) => {
      await this.loaded
      const filePath = typeof source === 'string' ? this.sources[source] : undefined
      if (!filePath) return null
      return this.open(filePath).catch(() => null)
    })
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
