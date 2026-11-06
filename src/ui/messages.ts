import { formatMegabytes } from '../core/open-policy'
import type { ImagePageSize } from '../core/images-to-pdf'
import { parsePageRange } from '../core/page-range'

const TOAST_MS = 5000
let toastTimer: ReturnType<typeof setTimeout> | undefined

/** Where the browser has popovers, the message shows above an open dialog too. */
export function showToast(message: string): void {
  const toast = document.querySelector<HTMLElement>('#toast')!
  toast.textContent = message
  toast.hidden = false
  if (typeof toast.showPopover === 'function') {
    // Shown again so that it comes above a dialog opened since.
    if (toast.matches(':popover-open')) toast.hidePopover()
    toast.showPopover()
  }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.hidden = true
    if (typeof toast.hidePopover === 'function' && toast.matches(':popover-open')) toast.hidePopover()
  }, TOAST_MS)
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

/** The password, or null when cancelled. It leaves the field at once. */
export async function askPassword(name: string, wasWrong: boolean): Promise<string | null> {
  const input = document.querySelector<HTMLInputElement>('#passwordInput')!
  document.querySelector('#passwordFile')!.textContent = name
  document.querySelector<HTMLElement>('#passwordWrong')!.hidden = !wasWrong
  const answered = ask(document.querySelector<HTMLDialogElement>('#passwordDialog')!, 'open')
  input.focus()
  const confirmed = await answered
  const password = input.value
  input.value = ''
  return confirmed ? password : null
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

/**
 * The pages to print, in order, or null when cancelled. Typing in the field chooses "these pages";
 * a range that cannot be read keeps the dialog open with the reason under it.
 */
export function askPrintPages(current: number, pageCount: number): Promise<number[] | null> {
  return askPages('printRange', 'print', current, pageCount)
}

/** Pages, format and resolution for saving pages as pictures, or null when cancelled. */
export async function askImageExport(current: number, pageCount: number): Promise<{ pages: number[]; format: 'png' | 'jpg'; dpi: number } | null> {
  const pages = await askPages('imageExport', 'save', current, pageCount)
  if (!pages) return null
  const form = document.querySelector('#imageExportDialog form')!
  const checked = (name: string) => form.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)!.value
  return { pages, format: checked('imageFormat') === 'jpg' ? 'jpg' : 'png', dpi: Number(checked('imageResolution')) }
}

/**
 * A dialog with "all", "this page" and "these pages:" choices named `prefix`, its field
 * `#<prefix>Input` and its message `#<prefix>Error`. The choice it opens with is the one checked
 * in the page.
 */
async function askPages(prefix: string, confirm: string, current: number, pageCount: number): Promise<number[] | null> {
  const dialog = document.querySelector<HTMLDialogElement>(`#${prefix}Dialog`)!
  const form = dialog.querySelector('form')!
  const input = document.querySelector<HTMLInputElement>(`#${prefix}Input`)!
  const error = document.querySelector<HTMLElement>(`#${prefix}Error`)!
  const choice = (value: string) => form.querySelector<HTMLInputElement>(`input[name="${prefix}"][value="${value}"]`)!
  document.querySelector(`#${prefix}All`)!.textContent = `Tüm sayfalar (${pageCount})`
  document.querySelector(`#${prefix}Current`)!.textContent = `Bu sayfa (${current})`
  // Each time it opens on the choice marked in the page.
  form.querySelector<HTMLInputElement>(`input[name="${prefix}"][checked]`)!.checked = true
  input.value = ''
  error.hidden = true
  const chosen = () => {
    if (choice('current').checked) return [current]
    if (choice('pages').checked) return parsePageRange(input.value, pageCount)
    return Array.from({ length: pageCount }, (_, index) => index + 1)
  }
  const onInput = () => { choice('pages').checked = true }
  const onSubmit = (event: SubmitEvent) => {
    if ((event.submitter as HTMLButtonElement | null)?.value !== confirm || chosen()) return
    event.preventDefault()
    error.textContent = `Sayfaları 1 ile ${pageCount} arasında yazın, örneğin 1-5, 8.`
    error.hidden = false
    input.focus()
  }
  input.addEventListener('input', onInput)
  form.addEventListener('submit', onSubmit)
  const confirmed = await ask(dialog, confirm)
  input.removeEventListener('input', onInput)
  form.removeEventListener('submit', onSubmit)
  return confirmed ? chosen() : null
}

/** How pictures sit on their pages, or null when cancelled. */
export async function askImagePageSize(): Promise<ImagePageSize | null> {
  const dialog = document.querySelector<HTMLDialogElement>('#imageSizeDialog')!
  if (!await ask(dialog, 'create')) return null
  return dialog.querySelector<HTMLInputElement>('input[name="imageSize"]:checked')!.value as ImagePageSize
}

/** A long task's progress dialog; `cancelled` turns true when the user gives up. */
export interface Work {
  readonly cancelled: boolean
  progress(text: string): void
  done(): void
}

export function startWork(title: string): Work {
  const dialog = document.querySelector<HTMLDialogElement>('#workDialog')!
  document.querySelector('#workTitle')!.textContent = title
  const progress = document.querySelector('#workProgress')!
  progress.textContent = ''
  let finished = false
  let cancelled = false
  dialog.addEventListener('close', () => { cancelled = !finished }, { once: true })
  dialog.showModal()
  return {
    get cancelled() {
      return cancelled
    },
    progress: text => { progress.textContent = text },
    done: () => {
      finished = true
      dialog.close()
    },
  }
}

export type UnsavedAnswer = 'save' | 'discard' | 'cancel'

/** What to do with a document whose changes are not saved yet. */
export function askUnsavedChanges(name: string): Promise<UnsavedAnswer> {
  const dialog = document.querySelector<HTMLDialogElement>('#unsavedDialog')!
  document.querySelector('#unsavedMessage')!.textContent = `${name} belgesinde kaydedilmemiş değişiklikler var. Kapatırsanız kaybolur.`
  dialog.returnValue = ''
  dialog.showModal()
  return new Promise(resolve => {
    dialog.addEventListener('close', () => {
      const answer = dialog.returnValue
      resolve(answer === 'save' || answer === 'discard' ? answer : 'cancel')
    }, { once: true })
  })
}

/** Resolves true when the user leaves the page editor without saving. */
export function confirmLeaveEditor(): Promise<boolean> {
  return ask(document.querySelector<HTMLDialogElement>('#leaveEditorDialog')!, 'leave')
}
