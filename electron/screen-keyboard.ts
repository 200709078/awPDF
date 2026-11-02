import { execFile, spawn } from 'node:child_process'
import type { BrowserWindow, IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron'

export type ScreenKeyboardResult = 'shown' | 'unavailable' | 'cancelled'

type Keyboard = {
  name: string
  path: string
  show: string
  hide: string
  args: string[]
  command: string
}

// Use idempotent Show methods: Toggle would close an already visible keyboard.
// Interfaces: pardus/eta-keyboard src/adaptor.h, onboard-osk/onboard Onboard/OnboardGtk.py.
const keyboards: Keyboard[] = [
  { name: 'org.eta.virtualkeyboard', path: '/VirtualKeyboard',
    show: 'org.eta.virtualkeyboard.showForce', hide: 'org.eta.virtualkeyboard.hide',
    args: ['false'], command: 'eta-keyboard' },
  { name: 'org.onboard.Onboard', path: '/org/onboard/Onboard/Keyboard',
    show: 'org.onboard.Onboard.Keyboard.Show', hide: 'org.onboard.Onboard.Keyboard.Hide',
    args: [], command: 'onboard' }
]

export type KeyboardCommands = {
  call(name: string, path: string, method: string, args?: string[]): Promise<string | null>
  launch(command: string): Promise<{ stop(): void } | null>
  wait(): Promise<void>
}

const commands: KeyboardCommands = {
  call(name, path, method, args = []) {
    return new Promise((resolve) => {
      // No shell or renderer-provided commands. GLib's gdbus ships with Pardus.
      execFile('gdbus', ['call', '--session', '--dest', name, '--object-path', path,
        '--method', method, ...args], { timeout: 1500, maxBuffer: 64 * 1024 },
      (error, stdout) => resolve(error ? null : stdout))
    })
  },
  launch(command) {
    return new Promise((resolve) => {
      // ETA starts hidden; show only after its D-Bus service is ready.
      // Do not install packages, change keyboard settings or kill an existing keyboard.
      const child = spawn(command, [], { detached: true, stdio: 'ignore' })
      child.once('error', () => resolve(null))
      child.once('spawn', () => {
        child.unref()
        resolve({ stop: () => { child.kill(); } })
      })
    })
  },
  wait: () => new Promise((resolve) => setTimeout(resolve, 100))
}

type Request = { window: BrowserWindow; id: string }

export class ScreenKeyboardService {
  private readonly windows = new Set<BrowserWindow>()
  private readonly commands: KeyboardCommands
  private readonly platform: string
  private active: Request | null = null
  private shown: Keyboard | null = null
  private queue: Promise<unknown> = Promise.resolve()

  constructor(io: KeyboardCommands = commands, platform: string = process.platform) {
    this.commands = io
    this.platform = platform
  }

  public register(ipc: IpcMain): void {
    ipc.handle('screen-keyboard:show', (event, id: unknown) => {
      const window = this.senderWindow(event)
      if (!window || this.platform !== 'linux' || !this.validId(id) ||
        !window.isVisible() || window.isMinimized()) return 'unavailable'
      const request = { window, id }
      this.active = request
      const result = this.queue.then(async (): Promise<ScreenKeyboardResult> => {
        if (!this.isCurrent(request)) return 'cancelled'
        const keyboard = await this.open(() => this.isCurrent(request))
        if (keyboard) this.shown = keyboard
        if (!this.isCurrent(request)) return 'cancelled'
        return keyboard ? 'shown' : 'unavailable'
      }).catch((): ScreenKeyboardResult => 'unavailable')
      this.queue = result
      return result
    })
    ipc.on('screen-keyboard:hide', (event, id: unknown) => {
      const window = this.senderWindow(event)
      if (window && this.active?.window === window && this.active.id === id) this.clear()
    })
  }

  public allowWindow(window: BrowserWindow): void {
    this.windows.add(window)
    const cancel = (): void => {
      if (this.active?.window === window) this.clear()
    }
    window.on('closed', () => { cancel(); this.windows.delete(window); })
    window.on('hide', cancel)
    window.on('minimize', cancel)
    window.webContents.on('render-process-gone', cancel)
    window.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) cancel()
    })
  }

  private senderWindow(event: IpcMainEvent | IpcMainInvokeEvent): BrowserWindow | undefined {
    return [...this.windows].find((window) => !window.isDestroyed() &&
      window.webContents === event.sender && event.senderFrame === window.webContents.mainFrame)
  }

  private validId(id: unknown): id is string {
    return typeof id === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(id)
  }

  private isCurrent(request: Request): boolean {
    return this.active === request && !request.window.isDestroyed() && request.window.isVisible() &&
      !request.window.isMinimized()
  }

  private clear(): void {
    this.active = null
    // Serialize Hide with Show/startup, so a slow old request cannot hide a newer editor's keyboard.
    this.queue = this.queue.then(async () => {
      if (this.active || !this.shown) return
      const keyboard = this.shown
      this.shown = null
      await this.commands.call(keyboard.name, keyboard.path, keyboard.hide)
    }).catch(() => {})
  }

  private async open(isCurrent: () => boolean): Promise<Keyboard | null> {
    const names = await this.commands.call('org.freedesktop.DBus', '/org/freedesktop/DBus',
      'org.freedesktop.DBus.ListNames')
    if (names === null || !isCurrent()) return null
    const running = keyboards.filter((keyboard) => names.includes(`'${keyboard.name}'`))

    // A running alternative takes precedence over starting a different keyboard.
    for (const keyboard of running) {
      if (!isCurrent()) return null
      if (await this.commands.call(keyboard.name, keyboard.path, keyboard.show, keyboard.args) !== null) {
        return keyboard
      }
    }
    for (const keyboard of keyboards.filter((candidate) => !running.includes(candidate))) {
      if (!isCurrent()) return null
      const launched = await this.commands.launch(keyboard.command)
      if (!launched) continue
      // Startup must be confirmed by D-Bus; spawning a process alone is not success.
      // Keep waiting after cancellation to hide a late-starting keyboard.
      const deadline = Date.now() + 3000
      for (let attempt = 0; attempt < 30 && Date.now() < deadline; attempt++) {
        const owned = await this.commands.call('org.freedesktop.DBus', '/org/freedesktop/DBus',
          'org.freedesktop.DBus.NameHasOwner', [keyboard.name])
        if (owned === null) break
        if (owned.includes('true')) {
          if (!isCurrent()) {
            if (await this.commands.call(keyboard.name, keyboard.path, keyboard.hide) !== null) return null
          } else if (await this.commands.call(keyboard.name, keyboard.path, keyboard.show, keyboard.args) !== null) {
            return keyboard
          }
          // Onboard acquires the bus name before exporting its Keyboard object.
        }
        await this.commands.wait()
      }
      // Only stop the process we just launched and could not control. Otherwise a
      // failed/slow startup could show its UI after the user has left text editing.
      launched.stop()
      // Do not start a second keyboard while the first may still be initializing.
      return null
    }
    return null
  }
}
