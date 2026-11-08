import { app, type IpcMain } from 'electron'
import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/** A large document takes LibreOffice some seconds; a stuck one is stopped. */
const TIMEOUT_MS = 180_000
/** Only Word documents; anything else is refused before LibreOffice sees it. */
const EXTENSIONS: ReadonlySet<string> = new Set(['docx', 'doc'])
const MAX_BYTES = 200 * 1024 * 1024

const WINDOWS_PLACES = [
  path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'LibreOffice', 'program', 'soffice.exe'),
  path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'LibreOffice', 'program', 'soffice.exe'),
]

async function isExecutable(file: string): Promise<boolean> {
  return access(file, constants.X_OK).then(() => true, () => false)
}

/** LibreOffice's command, from PATH (Pardus, other Linux) or its usual Windows folders; null without it. */
async function findLibreOffice(): Promise<string | null> {
  const names = process.platform === 'win32' ? ['soffice.exe'] : ['soffice', 'libreoffice']
  const folders = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)
  for (const folder of folders) {
    for (const name of names) {
      const candidate = path.join(folder, name)
      if (await isExecutable(candidate)) return candidate
    }
  }
  if (process.platform === 'win32') {
    for (const candidate of WINDOWS_PLACES) if (await isExecutable(candidate)) return candidate
  }
  return null
}

function run(command: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: TIMEOUT_MS, windowsHide: true }, error => error ? reject(error) : resolve())
  })
}

/**
 * Word documents as PDFs through LibreOffice, where it is installed (Pardus and the class boards
 * have it): it lays a document out as Word does, keeps the text as text and reads the old `.doc`
 * too. It runs with its own profile, so a LibreOffice the user has open neither takes the job
 * nor holds it up, and works in a fresh temporary folder that is removed afterwards.
 */
export class OfficeService {
  private readonly command = findLibreOffice()
  private readonly profile = pathToFileURL(path.join(app.getPath('userData'), 'libreoffice')).href
  /** One at a time: LibreOffice locks its profile. */
  private queue: Promise<unknown> = Promise.resolve()

  register(ipc: IpcMain): void {
    ipc.handle('office:available', async () => (await this.command) !== null)
    ipc.handle('office:to-pdf', (_event, extension: unknown, data: unknown) => {
      const job = this.queue.then(() => this.toPdf(extension, data))
      this.queue = job.catch(() => undefined)
      return job
    })
  }

  private async toPdf(extension: unknown, data: unknown): Promise<Uint8Array | null> {
    const command = await this.command
    if (!command) return null
    if (typeof extension !== 'string' || !EXTENSIONS.has(extension) || !(data instanceof Uint8Array) || data.length > MAX_BYTES) {
      throw new Error('Desteklenmeyen dosya.')
    }
    const folder = await mkdtemp(path.join(os.tmpdir(), 'awpdf-word-'))
    try {
      // A fixed name: the user's file name never reaches the command line.
      const input = path.join(folder, `belge.${extension}`)
      await writeFile(input, data)
      await run(command, [`-env:UserInstallation=${this.profile}`, '--headless', '--norestore', '--nologo', '--nolockcheck',
        '--convert-to', 'pdf', '--outdir', folder, input])
      return new Uint8Array(await readFile(path.join(folder, 'belge.pdf')))
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  }
}
