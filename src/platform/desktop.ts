import { browserPlatform } from './browser'
import type { Platform } from './platform'

/** The Electron window: full screen belongs to the window, the rest works as in a browser. */
export function desktopPlatform(controls: DesktopWindowControls): Platform {
  const listeners = new Set<() => void>()
  let isFullscreen = false
  const show = (enabled: boolean) => {
    isFullscreen = enabled
    for (const listener of listeners) listener()
  }
  controls.onFullscreenChanged(show)
  void controls.isFullscreen().then(show).catch(() => undefined)
  return {
    ...browserPlatform(),
    get isFullscreen() {
      return isFullscreen
    },
    toggleFullscreen: () => controls.toggleFullscreen(),
    onFullscreenChange: listener => { listeners.add(listener) },
  }
}
