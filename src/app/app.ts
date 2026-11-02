import { needsLargeFileWarning } from '../core/open-policy'
import { loadPdf, PasswordException } from '../core/pdf-document'
import type { PdfFile } from '../core/pdf-file'
import { currentPlatform } from '../platform/platform'
import { TOOLS } from '../tools'
import type { ToolContext } from '../tools/tool'
import { confirmLargeFile, showToast } from '../ui/messages'
import { mountToolbar } from '../ui/toolbar'
import { DocumentView } from './document-view'

const APP_TITLE = 'awPDF | mADEMatik'

/** The composition root: connects the platform, the document view and the tools. */
export function startApp(): void {
  const container = document.querySelector<HTMLDivElement>('#viewerContainer')!
  const viewer = document.querySelector<HTMLDivElement>('#viewer')!
  const emptyState = document.querySelector<HTMLElement>('#emptyState')!
  const platform = currentPlatform()
  const view = new DocumentView(container, viewer)
  const context: ToolContext = { view, pickFile: () => platform.pickFile() }
  let lastOpen = 0

  async function open(file: PdfFile): Promise<void> {
    const attempt = ++lastOpen
    if (needsLargeFileWarning(file.size) && !await confirmLargeFile(file.name, file.size)) return
    try {
      const document_ = await loadPdf(file)
      if (attempt !== lastOpen) {
        void document_.loadingTask.destroy()
        return
      }
      container.hidden = false
      emptyState.hidden = true
      view.open(document_)
      document.title = `${file.name} | ${APP_TITLE}`
    } catch (error) {
      console.error(error)
      showToast(error instanceof PasswordException ? 'Parolalı PDF\'ler henüz açılamıyor.' : 'Bu PDF açılamadı.')
    }
  }

  mountToolbar(document.querySelector('#toolbar')!, TOOLS, context)
  platform.onFile(file => void open(file))
  document.querySelector('#emptyOpen')!.addEventListener('click', context.pickFile)
}
