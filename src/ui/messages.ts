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

function ask(dialog: HTMLDialogElement, answer: string): Promise<boolean> {
  dialog.returnValue = ''
  dialog.showModal()
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === answer), { once: true })
  })
}

/** Resolves true when the user chooses to open the large file anyway. */
export function confirmLargeFile(name: string, size: number): Promise<boolean> {
  const dialog = document.querySelector<HTMLDialogElement>('#largeFileDialog')!
  document.querySelector('#largeFileMessage')!.textContent = `${name} (${formatMegabytes(size)}) yavaş açılabilir.`
  return ask(dialog, 'open')
}

/** The whole address is shown: a link's text in a PDF may claim to go somewhere else. */
export function confirmExternalLink(url: string): Promise<boolean> {
  document.querySelector('#externalLinkUrl')!.textContent = url
  return ask(document.querySelector<HTMLDialogElement>('#externalLinkDialog')!, 'open')
}

/** The chosen page, or null when cancelled. */
export async function askPageNumber(page: number, pageCount: number): Promise<number | null> {
  const input = document.querySelector<HTMLInputElement>('#goToPageInput')!
  document.querySelector('#goToPageHint')!.textContent = `Sayfa numarası (1-${pageCount})`
  input.max = String(pageCount)
  input.value = String(page)
  const answered = ask(document.querySelector<HTMLDialogElement>('#goToPageDialog')!, 'go')
  input.select()
  return await answered ? Number(input.value) : null
}
