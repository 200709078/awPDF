import type { Tool, ToolContext } from '../tools/tool'

export function shortcutOf(event: KeyboardEvent): string {
  return `${event.ctrlKey || event.metaKey ? 'ctrl+' : ''}${event.key.toLowerCase()}`
}

const MENU_LABEL = 'Diğer Araçlar'
const MENU_ICON = '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>'
/** Space left under the open menu, so its shadow and rounded end stay on screen. */
const MENU_SCREEN_MARGIN_PX = 8

function emptyButton(id: string, label: string, icon: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.id = id
  button.className = 'toolbar__button'
  button.title = label
  button.setAttribute('aria-label', label)
  button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ` stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>`
  return button
}

function toolButton(tool: Tool, context: ToolContext): HTMLButtonElement {
  const button = emptyButton(`tool-${tool.id}`, tool.label, tool.icon)
  const label = document.createElement('span')
  label.className = 'toolbar__label'
  label.textContent = tool.label
  button.append(label)
  button.addEventListener('click', () => tool.run(context))
  return button
}

interface OverflowMenu {
  fit(): void
  /** False when it was not open. */
  close(): boolean
}

/**
 * Keeps the toolbar on one line: the buttons that do not fit move, from the last one back, into a
 * menu at the row's end, where the styles show their names. They stay the same elements, so their
 * pressed and disabled states and their IDs need no second copy. A resize redoes this by itself.
 */
function mountOverflowMenu(root: HTMLElement, buttons: readonly HTMLButtonElement[], rowEnd: HTMLElement): OverflowMenu {
  const toggle = emptyButton('toolbarMenuButton', MENU_LABEL, MENU_ICON)
  const menu = document.createElement('div')
  menu.id = 'toolbarMenu'
  menu.className = 'toolbar__menu'
  toggle.setAttribute('aria-controls', menu.id)
  root.append(toggle, menu)

  const setOpen = (open: boolean) => {
    menu.hidden = !open
    toggle.setAttribute('aria-expanded', String(open))
    if (open) menu.style.maxHeight = `${window.innerHeight - root.getBoundingClientRect().bottom - MENU_SCREEN_MARGIN_PX}px`
  }
  const fit = () => {
    setOpen(false)
    toggle.hidden = true
    rowEnd.before(...buttons)
    if (root.scrollWidth <= root.clientWidth) return
    toggle.hidden = false
    for (let index = buttons.length - 1; index >= 0 && root.scrollWidth > root.clientWidth; index--) {
      menu.prepend(buttons[index])
    }
  }

  toggle.addEventListener('click', () => setOpen(menu.hidden === true))
  // Bubbles here after the button's own click has run its tool.
  menu.addEventListener('click', event => {
    if ((event.target as Element).closest('button')) setOpen(false)
  })
  // In the capture phase, since the page's own handlers may stop a press on the document.
  document.addEventListener('pointerdown', event => {
    const target = event.target as Node
    if (!menu.contains(target) && !toggle.contains(target)) setOpen(false)
  }, true)
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || menu.hidden) return
    setOpen(false)
    toggle.focus()
  })
  new ResizeObserver(fit).observe(root)
  fit()
  return {
    fit,
    close: () => {
      const wasOpen = !menu.hidden
      setOpen(false)
      return wasOpen
    },
  }
}

/** Builds the toolbar and the keyboard shortcuts from the tool list. */
export function mountToolbar(root: HTMLElement, tools: readonly Tool[], context: ToolContext): Pick<OverflowMenu, 'close'> {
  const supported = tools.filter(tool => tool.isSupported?.(context) ?? true)
  const buttons = supported.filter(tool => tool.inToolbar !== false).map(tool => ({ tool, button: toolButton(tool, context) }))
  const status = document.createElement('button')
  status.type = 'button'
  status.id = 'pageStatus'
  status.className = 'toolbar__status'
  status.title = 'Sayfaya Git'
  status.addEventListener('click', () => supported.find(tool => tool.id === 'goToPage')?.run(context))
  root.append(...buttons.map(({ button }) => button), status)
  const menu = mountOverflowMenu(root, buttons.map(({ button }) => button), status)

  const canRun = (tool: Tool) => (!tool.needsDocument || context.view.isOpen) && (tool.isAvailable?.(context.view) ?? true)

  const update = () => {
    const { isOpen, pageLabel, pageCount } = context.view
    for (const { tool, button } of buttons) {
      button.disabled = !canRun(tool)
      if (tool.isActive) button.setAttribute('aria-pressed', String(tool.isActive(context)))
    }
    const statusWidth = status.offsetWidth
    status.disabled = !isOpen
    status.textContent = isOpen ? `${pageLabel} / ${pageCount}` : ''
    if (status.offsetWidth !== statusWidth) menu.fit()
  }
  context.view.onChange(update)
  context.sidePanel.onChange(update)
  context.searchBar.onChange(update)
  context.theme.onChange(update)
  context.platform.onFullscreenChange(update)
  context.regionCapture.onChange(update)
  update()

  window.addEventListener('keydown', event => {
    // Form fields in the document take letters too: an "r" there is text, not a turn.
    const isTyping = (event.target as Element).matches?.('input, textarea, select, [contenteditable]') && !event.ctrlKey && !event.metaKey
    if (isTyping || document.querySelector('dialog[open]')) return
    const shortcut = shortcutOf(event)
    const tool = supported.find(item => item.shortcuts?.includes(shortcut))
    if (!tool || !canRun(tool)) return
    event.preventDefault()
    tool.run(context)
  })
  return menu
}
