import { formatMegabytes } from '../core/open-policy'

const TOAST_MS = 5000
let toastTimer: ReturnType<typeof setTimeout> | undefined

export function showToast(message: string): void {
  const toast = document.querySelector<HTMLElement>('#toast')!
  toast.textContent = message
  toast.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.hidden = true }, TOAST_MS)
}

/** Resolves true when the user chooses to open the large file anyway. */
export function confirmLargeFile(name: string, size: number): Promise<boolean> {
  const dialog = document.querySelector<HTMLDialogElement>('#largeFileDialog')!
  document.querySelector('#largeFileMessage')!.textContent = `${name} (${formatMegabytes(size)}) yavaş açılabilir.`
  dialog.returnValue = ''
  dialog.showModal()
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'open'), { once: true })
  })
}
