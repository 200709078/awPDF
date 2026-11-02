import type { Tool, ToolContext } from '../tools/tool'

export function shortcutOf(event: KeyboardEvent): string {
  return `${event.ctrlKey || event.metaKey ? 'ctrl+' : ''}${event.key.toLowerCase()}`
}

function toolButton(tool: Tool, context: ToolContext): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.id = `tool-${tool.id}`
  button.className = 'toolbar__button'
  button.title = tool.label
  button.setAttribute('aria-label', tool.label)
  button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ` stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${tool.icon}</svg>`
  button.addEventListener('click', () => tool.run(context))
  return button
}

/** Builds the toolbar and the keyboard shortcuts from the tool list. */
export function mountToolbar(root: HTMLElement, tools: readonly Tool[], context: ToolContext): void {
  const supported = tools.filter(tool => tool.isSupported?.(context) ?? true)
  const buttons = supported.filter(tool => tool.inToolbar !== false).map(tool => ({ tool, button: toolButton(tool, context) }))
  const status = document.createElement('button')
  status.type = 'button'
  status.id = 'pageStatus'
  status.className = 'toolbar__status'
  status.title = 'Sayfaya Git'
  status.addEventListener('click', () => supported.find(tool => tool.id === 'goToPage')?.run(context))
  root.append(...buttons.map(({ button }) => button), status)

  const canRun = (tool: Tool) => (!tool.needsDocument || context.view.isOpen) && (tool.isAvailable?.(context.view) ?? true)

  const update = () => {
    const { isOpen, pageLabel, pageCount } = context.view
    for (const { tool, button } of buttons) {
      button.disabled = !canRun(tool)
      if (tool.isActive) button.setAttribute('aria-pressed', String(tool.isActive(context)))
    }
    status.disabled = !isOpen
    status.textContent = isOpen ? `${pageLabel} / ${pageCount}` : ''
  }
  context.view.onChange(update)
  context.sidePanel.onChange(update)
  context.searchBar.onChange(update)
  context.theme.onChange(update)
  context.platform.onFullscreenChange(update)
  update()

  window.addEventListener('keydown', event => {
    const isTyping = event.target instanceof HTMLInputElement && !event.ctrlKey && !event.metaKey
    if (isTyping || document.querySelector('dialog[open]')) return
    const shortcut = shortcutOf(event)
    const tool = supported.find(item => item.shortcuts?.includes(shortcut))
    if (!tool || !canRun(tool)) return
    event.preventDefault()
    tool.run(context)
  })
}
