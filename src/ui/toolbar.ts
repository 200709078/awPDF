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
  const buttons = tools.map(tool => ({ tool, button: toolButton(tool, context) }))
  const status = document.createElement('span')
  status.id = 'pageStatus'
  status.className = 'toolbar__status'
  root.append(...buttons.map(({ button }) => button), status)

  const canRun = (tool: Tool) => (!tool.needsDocument || context.view.isOpen) && (tool.isAvailable?.(context.view) ?? true)

  const update = () => {
    const { isOpen, pageLabel, pageCount } = context.view
    for (const { tool, button } of buttons) {
      button.disabled = !canRun(tool)
      if (tool.isActive) button.setAttribute('aria-pressed', String(tool.isActive(context.view)))
    }
    status.textContent = isOpen ? `${pageLabel} / ${pageCount}` : ''
  }
  context.view.onChange(update)
  update()

  window.addEventListener('keydown', event => {
    const shortcut = shortcutOf(event)
    const tool = tools.find(item => item.shortcuts?.includes(shortcut))
    if (!tool || !canRun(tool)) return
    event.preventDefault()
    tool.run(context)
  })
}
