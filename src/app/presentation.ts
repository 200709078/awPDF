import type { Platform } from '../platform/platform'
import type { SearchBar } from '../ui/search-bar'
import type { SidePanel } from '../ui/side-panel'
import type { DocumentView, ViewState } from './document-view'

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'])
const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'])
/** A press that moves further than this selected or swiped; it was not a tap. */
const TAP_SLOP = 10
/** The left part of the screen goes back; it is smaller, since going on is the usual tap. */
const PREVIOUS_AREA = 1 / 3

interface Before {
  state: ViewState
  singlePage: boolean
  twoPages: boolean
  wasFullscreen: boolean
}

/**
 * One page at a time, as large as the screen allows, with nothing else on it. The board's hand
 * has only taps: right of the left third goes on, the left third goes back, and a button leaves.
 */
export class Presentation {
  private before: Before | null = null
  private pressedAt = { x: 0, y: 0 }
  /** Full screen arrives a moment after asking; until then, not being in it means nothing. */
  private hasFilledScreen = false
  private readonly exitButton = document.querySelector<HTMLElement>('#presentationExit')!

  constructor(
    private readonly container: HTMLElement,
    private readonly view: DocumentView,
    private readonly sidePanel: SidePanel,
    private readonly searchBar: SearchBar,
    private readonly platform: Platform,
  ) {
    window.addEventListener('keydown', event => this.onKey(event), true)
    container.addEventListener('pointerdown', ({ clientX, clientY }) => { this.pressedAt = { x: clientX, y: clientY } })
    container.addEventListener('click', event => this.onTap(event))
    this.exitButton.addEventListener('click', () => this.exit())
    // Leaving full screen by the browser's own Esc ends the presentation too.
    platform.onFullscreenChange(() => {
      if (this.before && !this.before.wasFullscreen && !platform.isFullscreen && this.hasFilledScreen) this.exit()
      if (this.before && platform.isFullscreen) this.hasFilledScreen = true
    })
  }

  get isActive(): boolean {
    return this.before !== null
  }

  enter(): void {
    if (this.before) return
    const { view, platform } = this
    this.before = { state: view.state, singlePage: view.singlePage, twoPages: view.twoPages, wasFullscreen: platform.isFullscreen }
    this.searchBar.close()
    if (this.sidePanel.isOpen) this.sidePanel.toggle()
    document.body.classList.add('is-presenting')
    this.exitButton.hidden = false
    view.setLayout(true, false)
    view.fitPage()
    if (!platform.isFullscreen) platform.toggleFullscreen()
  }

  exit(): void {
    const { before, view, platform } = this
    if (!before) return
    this.before = null
    this.hasFilledScreen = false
    document.body.classList.remove('is-presenting')
    this.exitButton.hidden = true
    view.setLayout(before.singlePage, before.twoPages)
    view.setScale(before.state.scale)
    if (!before.wasFullscreen && platform.isFullscreen) platform.toggleFullscreen()
  }

  private onKey(event: KeyboardEvent): void {
    if (!this.before || document.querySelector('dialog[open]')) return
    if (event.key === 'Escape') this.exit()
    else if (NEXT_KEYS.has(event.key)) this.view.nextPage()
    else if (PREVIOUS_KEYS.has(event.key)) this.view.previousPage()
    else if (event.key === 'Home') this.view.goTo(1)
    else if (event.key === 'End') this.view.goTo(this.view.pageCount)
    else return
    // Before the toolbar's shortcuts and the browser's own scrolling.
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  private onTap({ clientX, clientY, target }: MouseEvent): void {
    if (!this.before || (target as Element).closest('a')) return
    if (Math.hypot(clientX - this.pressedAt.x, clientY - this.pressedAt.y) > TAP_SLOP) return
    if (clientX < this.container.clientWidth * PREVIOUS_AREA) this.view.previousPage()
    else this.view.nextPage()
  }
}
