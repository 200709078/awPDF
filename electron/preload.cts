// Sandboxed preloads run as CommonJS and may only load Electron's renderer modules.
const { contextBridge, ipcRenderer, webUtils } = require('electron') as typeof import('electron')

contextBridge.exposeInMainWorld('awPDFDesktop', {
  files: {
    onOpened: (callback: (file: unknown) => void): void => {
      ipcRenderer.on('files:opened', (_event, file: unknown) => callback(file))
      ipcRenderer.send('files:ready')
    },
    // Takes a File, not a path, so the page can only ask for what the user gave it.
    adopt: (file: File): Promise<unknown> => {
      const path = webUtils.getPathForFile(file)
      return path ? ipcRenderer.invoke('files:adopt', path) : Promise.resolve(null)
    },
    read: (id: number, begin: number, end: number): Promise<Uint8Array> => ipcRenderer.invoke('files:read', id, begin, end),
    close: (id: number): void => ipcRenderer.send('files:close', id),
    reopen: (source: string): Promise<unknown> => ipcRenderer.invoke('files:reopen', source),
  },
  windowControls: {
    minimize: (): void => ipcRenderer.send('window:minimize'),
    toggleMaximize: (): void => ipcRenderer.send('window:toggle-maximize'),
    toggleFullscreen: (): void => ipcRenderer.send('window:toggle-fullscreen'),
    setFullscreen: (enabled: boolean): void => ipcRenderer.send('window:set-fullscreen', enabled === true),
    close: (): void => ipcRenderer.send('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
    isFullscreen: (): Promise<boolean> => ipcRenderer.invoke('window:is-fullscreen'),
    onMaximizeChanged: (callback: (maximized: boolean) => void): void => {
      ipcRenderer.on('window:maximize-changed', (_event, maximized: boolean) => callback(maximized === true))
    },
    onFullscreenChanged: (callback: (fullscreen: boolean) => void): void => {
      ipcRenderer.on('window:fullscreen-changed', (_event, fullscreen: boolean) => callback(fullscreen === true))
    },
  },
})
