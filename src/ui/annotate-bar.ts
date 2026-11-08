import type { DocumentView, EditingState, EditorMode, EditorSetting } from '../app/document-view'
import { shapeSvg, type SavedSignature, type SignatureStore } from '../core/signatures'
import { showToast } from './messages'
import { askSignature } from './signature-dialog'

type MarkMode = Exclude<EditorMode, 'none'>

interface Choice {
  readonly label: string
  readonly value: string | number
}

interface ModeInfo {
  readonly label: string
  readonly icon: string
  /** None for signatures, which are drawn as they were made. */
  readonly colorKind?: 'inkColor' | 'textColor' | 'highlightColor'
  readonly colors?: readonly Choice[]
  readonly sizeKind?: 'inkThickness' | 'textSize'
  readonly sizes?: readonly Choice[]
  /** What the sizes look like on their buttons: a dot this many px wide, or a letter. */
  readonly sizeLook?: (value: number) => string
}

const PEN_COLORS: readonly Choice[] = [
  { label: 'Siyah', value: '#000000' },
  { label: 'Mavi', value: '#1D4ED8' },
  { label: 'Kırmızı', value: '#DC2626' },
  { label: 'Yeşil', value: '#15803D' },
]

/** pdf.js's own highlighter colours (`HIGHLIGHT_COLORS`), so its colour menu matches. */
const HIGHLIGHT_CHOICES: readonly Choice[] = [
  { label: 'Sarı', value: '#FFFF98' },
  { label: 'Yeşil', value: '#53FFBC' },
  { label: 'Mavi', value: '#80EBFF' },
  { label: 'Pembe', value: '#FFCBE6' },
]

export const PEN_ICON = '<path d="M4 20l1-5L16 4l4 4L9 19z"/><path d="M14 6l4 4"/>'
const SIGN_ICON = '<path d="M3 17c3-1 4-9 6-9s-1 9 1 9 3-5 4-5 1 3 2 3 2-2 3-2"/><path d="M3 21h18"/>'
const ADD_ICON = '<path d="M12 5v14"/><path d="M5 12h14"/>'

const MODES: Readonly<Record<MarkMode, ModeInfo>> = {
  ink: {
    label: 'Kalem',
    icon: PEN_ICON,
    colorKind: 'inkColor',
    colors: PEN_COLORS,
    sizeKind: 'inkThickness',
    sizes: [{ label: 'İnce', value: 2 }, { label: 'Orta', value: 4 }, { label: 'Kalın', value: 8 }],
    sizeLook: value => `<span class="annotate-bar__dot" style="width:${value * 2 + 4}px;height:${value * 2 + 4}px"></span>`,
  },
  highlight: {
    label: 'Fosforlu',
    icon: '<path d="M13 5l6 6-7 7H6v-6z"/><path d="M6 18l-2 2"/><path d="M10 9l5 5"/>',
    colorKind: 'highlightColor',
    colors: HIGHLIGHT_CHOICES,
  },
  text: {
    label: 'Metin',
    icon: '<path d="M5 7V5h14v2"/><path d="M12 5v14"/><path d="M9 19h6"/>',
    colorKind: 'textColor',
    colors: PEN_COLORS,
    sizeKind: 'textSize',
    sizes: [{ label: 'Küçük', value: 12 }, { label: 'Orta', value: 18 }, { label: 'Büyük', value: 28 }],
    sizeLook: value => `<span class="annotate-bar__letter" style="font-size:${Math.round(value * 0.8)}px">A</span>`,
  },
  signature: {
    label: 'İmza',
    icon: SIGN_ICON,
  },
}

const UNDO_ICON = '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>'
const REDO_ICON = '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/>'
const DELETE_ICON = '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>'
const DONE_ICON = '<path d="M5 12l5 5 9-10"/>'

function svg(icon: string): string {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ` stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>`
}

function button(className: string, label: string, inner: string, shown = false): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = className
  element.title = label
  element.setAttribute('aria-label', label)
  element.innerHTML = shown ? `${inner}<span>${label}</span>` : inner
  return element
}

/**
 * The marking bar: a pen, a highlighter and text boxes on the pages, drawn by pdf.js's editing
 * layer. Under the toolbar like the search bar; while it is open the pages take marks instead of
 * turning or selecting. The marks become PDF annotations when the document is saved ("Farklı
 * Kaydet"), so the opened file is never changed.
 */
export class AnnotateBar {
  private readonly listeners = new Set<() => void>()
  private readonly modeButtons = new Map<MarkMode, HTMLButtonElement>()
  private readonly colors = document.createElement('div')
  private readonly sizes = document.createElement('div')
  private readonly signatureGroup = document.createElement('div')
  /** The kept signature a tap on the page puts there. */
  private signature: SavedSignature | null = null
  private readonly undoButton = button('annotate-bar__button', 'Geri Al', svg(UNDO_ICON))
  private readonly redoButton = button('annotate-bar__button', 'Yinele', svg(REDO_ICON))
  private readonly deleteButton = button('annotate-bar__button', 'Seçileni Sil', svg(DELETE_ICON))
  /** The mode the bar opens with: the one used last. */
  private mode: MarkMode = 'ink'
  private readonly chosen: Record<MarkMode, { color: string; size?: number }> = {
    ink: { color: '#DC2626', size: 4 },
    highlight: { color: '#FFFF98' },
    text: { color: '#000000', size: 18 },
    signature: { color: '' },
  }

  constructor(private readonly root: HTMLElement, private readonly view: DocumentView, private readonly signatures: SignatureStore) {
    const modes = document.createElement('div')
    modes.className = 'annotate-bar__group'
    modes.setAttribute('role', 'group')
    modes.setAttribute('aria-label', 'Kalem türü')
    for (const [mode, info] of Object.entries(MODES) as [MarkMode, ModeInfo][]) {
      const modeButton = button('annotate-bar__button annotate-bar__mode', info.label, svg(info.icon), true)
      modeButton.dataset.mode = mode
      modeButton.addEventListener('click', () => mode === 'signature' ? this.sign() : this.use(mode))
      this.modeButtons.set(mode, modeButton)
      modes.append(modeButton)
    }
    this.colors.className = 'annotate-bar__group'
    this.colors.setAttribute('role', 'group')
    this.colors.setAttribute('aria-label', 'Renk')
    this.sizes.className = 'annotate-bar__group'
    this.sizes.setAttribute('role', 'group')
    this.signatureGroup.className = 'annotate-bar__group annotate-bar__signatures'
    this.signatureGroup.setAttribute('role', 'group')
    this.signatureGroup.setAttribute('aria-label', 'İmzalar')
    this.signatureGroup.hidden = true
    const actions = document.createElement('div')
    actions.className = 'annotate-bar__group'
    actions.append(this.undoButton, this.redoButton, this.deleteButton)
    const done = button('annotate-bar__button annotate-bar__done', 'Bitti', svg(DONE_ICON), true)
    root.append(modes, this.colors, this.sizes, this.signatureGroup, actions, done)
    // The bar's buttons do not take the focus: pdf.js ends the pen's drawing when its layer loses
    // it, and the strokes would become one drawing, undone at once instead of stroke by stroke.
    root.addEventListener('mousedown', event => {
      if ((event.target as Element).closest('button')) event.preventDefault()
    })

    this.undoButton.addEventListener('click', () => view.undo())
    this.redoButton.addEventListener('click', () => view.redo())
    this.deleteButton.addEventListener('click', () => view.deleteSelected())
    done.addEventListener('click', () => this.close())
    // Esc leaves the bar, as it leaves the search; with a mark selected pdf.js first unselects it.
    // Seen before pdf.js's own handler (capture), which clears the selection.
    window.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !this.isOpen || view.editingState.hasSelection) return
      const target = event.target as Element
      if (target.closest?.('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open]')) return
      this.close()
    }, true)
    view.onEditingChange(state => {
      this.showState(state)
      // pdf.js moved to the kind of mark the user picked on the page.
      const { editorMode } = view
      if (this.isOpen && editorMode !== 'none' && editorMode !== this.mode) this.show(editorMode)
    })
    view.onChange(() => {
      // A tab closed or another opened: the bar works on whatever is on screen, or closes.
      if (this.isOpen && !view.isOpen) this.close()
    })
    this.showState(view.editingState)
  }

  get isOpen(): boolean {
    return !this.root.hidden
  }

  /** Runs when the bar opens or closes. */
  onChange(listener: () => void): void {
    this.listeners.add(listener)
  }

  toggle(): void {
    if (this.isOpen) this.close()
    else this.open()
  }

  open(): void {
    if (this.isOpen || !this.view.isOpen) return
    this.root.hidden = false
    this.use(this.mode)
    this.notify()
  }

  /** Opens the bar for signing; with no signature kept yet, the new signature dialog first. */
  sign(): void {
    if (!this.view.isOpen) return
    if (!this.isOpen) {
      this.root.hidden = false
      this.notify()
    }
    this.use('signature')
    if (this.signatures.list().length === 0) void this.newSignature()
  }

  close(): void {
    if (!this.isOpen) return
    this.root.hidden = true
    void this.view.setEditorMode('none')
    this.notify()
  }

  /** Draws, highlights or writes with this from now on, in the colour and size chosen for it. */
  private use(mode: MarkMode): void {
    const switched = this.view.setEditorMode(mode)
    this.show(mode)
    // pdf.js keeps the choices per kind of mark, for the marks made from now on; sent once it has
    // switched and unselected, or they would change the mark that was selected.
    void switched.then(() => {
      if (!this.isOpen || this.view.editorMode !== mode) return
      const info = MODES[mode]
      const chosen = this.chosen[mode]
      if (info.colorKind) this.apply({ kind: info.colorKind, value: chosen.color })
      if (info.sizeKind && chosen.size !== undefined) this.apply({ kind: info.sizeKind, value: chosen.size })
    })
  }

  /** The mode's buttons: its colours and sizes, which change the selected marks too. */
  private show(mode: MarkMode): void {
    this.mode = mode
    const info = MODES[mode]
    const chosen = this.chosen[mode]
    for (const [other, modeButton] of this.modeButtons) modeButton.setAttribute('aria-pressed', String(other === mode))
    this.signatureGroup.hidden = mode !== 'signature'
    if (mode === 'signature') this.showSignatures()
    this.colors.hidden = !info.colors
    const { colorKind, colors } = info
    if (colorKind && colors) {
      this.fill(this.colors, colors, chosen.color, choice => {
        chosen.color = String(choice.value)
        this.apply({ kind: colorKind, value: chosen.color })
      }, choice => `<span class="annotate-bar__swatch" style="background:${String(choice.value)}"></span>`)
    }
    this.sizes.hidden = !info.sizes
    if (info.sizes && info.sizeKind && info.sizeLook) {
      const { sizeKind, sizeLook } = info
      this.sizes.setAttribute('aria-label', sizeKind === 'textSize' ? 'Yazı boyutu' : 'Kalınlık')
      this.fill(this.sizes, info.sizes, chosen.size, choice => {
        chosen.size = Number(choice.value)
        this.apply({ kind: sizeKind, value: chosen.size })
      }, choice => sizeLook(Number(choice.value)))
    }
  }

  /** The kept signatures, each put on the page with a tap, and a new one. */
  private showSignatures(): void {
    const kept = this.signatures.list()
    // The one chosen last, also one not kept; the first kept one otherwise.
    this.signature ??= kept[0] ?? null
    this.view.useSignature(this.signature)
    const buttons = kept.map(item => {
      const choice = button('annotate-bar__button annotate-bar__choice annotate-bar__signature', item.description, shapeSvg(item.shape, item.description))
      choice.title = `${item.description}: sayfaya koy (ya da sayfada bir yere dokunun)`
      choice.setAttribute('aria-pressed', String(item.id === this.signature?.id))
      choice.addEventListener('click', () => {
        this.signature = item
        for (const other of this.signatureGroup.querySelectorAll('.annotate-bar__signature')) {
          other.setAttribute('aria-pressed', String(other === choice))
        }
        void this.view.addSignature(item)
      })
      return choice
    })
    const add = button('annotate-bar__button annotate-bar__new-signature', 'Yeni İmza', svg(ADD_ICON), true)
    add.addEventListener('click', () => void this.newSignature())
    this.signatureGroup.replaceChildren(...buttons, add)
  }

  /** Asks for a signature, keeps it if wished, and puts it on the page. */
  private async newSignature(): Promise<void> {
    const made = await askSignature(this.signatures, id => {
      if (id === this.signature?.id) this.signature = null
      if (this.mode === 'signature') this.showSignatures()
    })
    if (!made || !this.isOpen || !this.view.isOpen) return
    let signature: SavedSignature | null = null
    if (made.keep) {
      signature = this.signatures.add(made.description, made.shape)
      if (!signature) showToast('İmza bu cihazda saklanamadı; yalnız bu belgeye konuyor.')
    }
    signature ??= { id: crypto.randomUUID(), description: made.description, shape: made.shape }
    this.signature = signature
    this.use('signature')
    await this.view.addSignature(signature)
  }

  private fill(group: HTMLElement, choices: readonly Choice[], current: string | number | undefined,
    pick: (choice: Choice) => void, look: (choice: Choice) => string): void {
    group.replaceChildren(...choices.map(choice => {
      const choiceButton = button('annotate-bar__button annotate-bar__choice', choice.label, look(choice))
      choiceButton.setAttribute('aria-pressed', String(choice.value === current))
      choiceButton.addEventListener('click', () => {
        for (const other of group.children) other.setAttribute('aria-pressed', String(other === choiceButton))
        pick(choice)
      })
      return choiceButton
    }))
  }

  private apply(setting: EditorSetting): void {
    this.view.changeEditor(setting)
  }

  private showState(state: EditingState): void {
    this.undoButton.disabled = !state.canUndo
    this.redoButton.disabled = !state.canRedo
    this.deleteButton.disabled = !state.hasSelection
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}
