import type { Platform } from '../platform/platform'

let wired = false

/** Opens Hakkında; its links go outside the app through the platform (browser, desktop, Android). */
export function showAbout(platform: Platform): void {
  const dialog = document.querySelector<HTMLDialogElement>('#aboutDialog')!
  if (!wired) {
    wired = true
    document.querySelector('#aboutVersion')!.textContent = `sürüm ${__APP_VERSION__}`
    for (const link of dialog.querySelectorAll<HTMLAnchorElement>('a[href^="https://"]')) {
      link.addEventListener('click', event => {
        event.preventDefault()
        platform.openExternal(link.href)
      })
    }
    // A press on the backdrop (outside the window) closes it, like × and Escape.
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close()
    })
  }
  if (!dialog.open) dialog.showModal()
}
