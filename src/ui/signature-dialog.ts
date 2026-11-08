import { drawnShape, imageShape, shapeSvg, textShape, type SignatureShape, type SignatureStore } from '../core/signatures'

export interface NewSignature {
  description: string
  shape: SignatureShape
  /** Kept on the device to be used again. */
  keep: boolean
}

type Way = 'draw' | 'type' | 'image'

/** A drawn line's width in the pad's pixels; pdf.js scales the drawing with the box. */
const PEN_WIDTH = 3
/** Handwriting where the device has it (Android's "cursive" is one); italic serif elsewhere. */
const SIGNATURE_FONT = { fontFamily: 'cursive, "Z003", "URW Chancery L", serif', fontStyle: 'italic', fontWeight: 'normal' }

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!

/**
 * The new signature dialog: drawn with a finger, a pen or the mouse, typed, or traced from a
 * picture. Also lists the kept signatures, to remove them. Resolves null when cancelled.
 */
export function askSignature(store: SignatureStore, onRemoved: (id: string) => void): Promise<NewSignature | null> {
  const dialog = $<HTMLDialogElement>('#signatureDialog')
  const canvas = $<HTMLCanvasElement>('#signatureCanvas')
  const textInput = $<HTMLInputElement>('#signatureText')
  const imageInput = $<HTMLInputElement>('#signatureImageInput')
  const nameInput = $<HTMLInputElement>('#signatureName')
  const keep = $<HTMLInputElement>('#signatureKeep')
  const addButton = $<HTMLButtonElement>('#signatureAdd')
  const tabs: Record<Way, [HTMLButtonElement, HTMLElement]> = {
    draw: [$('#signatureTabDraw'), $('#signatureDraw')],
    type: [$('#signatureTabType'), $('#signatureType')],
    image: [$('#signatureTabImage'), $('#signatureImage')],
  }
  const controller = new AbortController()
  const { signal } = controller

  let way: Way = 'draw'
  let strokes: number[][] = []
  /** The pad's size when it was laid out; a closed dialog measures nothing. */
  let pad = { width: 0, height: 0 }
  let typed: SignatureShape | null = null
  let traced: SignatureShape | null = null
  const current = (): SignatureShape | null => way === 'draw'
    ? drawnShape(strokes, pad.width, pad.height, PEN_WIDTH)
    : way === 'type' ? typed : traced
  const update = () => { addButton.disabled = current() === null }

  const choose = (next: Way) => {
    way = next
    for (const [name, [tab, panel]] of Object.entries(tabs) as [Way, [HTMLButtonElement, HTMLElement]][]) {
      tab.setAttribute('aria-selected', String(name === next))
      panel.hidden = name !== next
    }
    if (next === 'draw') sizePad()
    if (next === 'type') textInput.focus()
    update()
  }
  for (const [name, [tab]] of Object.entries(tabs) as [Way, [HTMLButtonElement, HTMLElement]][]) {
    tab.addEventListener('click', () => choose(name), { signal })
  }

  // The pad: strokes in CSS pixels, drawn at the screen's own resolution.
  const context = canvas.getContext('2d')!
  const redraw = () => {
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, canvas.width, canvas.height)
    const scale = canvas.width / Math.max(canvas.clientWidth, 1)
    context.setTransform(scale, 0, 0, scale, 0, 0)
    context.lineWidth = PEN_WIDTH
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.strokeStyle = getComputedStyle(canvas).color
    for (const stroke of strokes) {
      context.beginPath()
      context.moveTo(stroke[0], stroke[1])
      for (let index = 2; index + 1 < stroke.length; index += 2) context.lineTo(stroke[index], stroke[index + 1])
      if (stroke.length === 2) context.lineTo(stroke[0] + 0.1, stroke[1])
      context.stroke()
    }
  }
  function sizePad() {
    if (canvas.clientWidth === 0) return
    pad = { width: canvas.clientWidth, height: canvas.clientHeight }
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.round(canvas.clientWidth * ratio)
    canvas.height = Math.round(canvas.clientHeight * ratio)
    redraw()
  }
  let drawing: number[] | null = null
  const point = (event: PointerEvent) => {
    const box = canvas.getBoundingClientRect()
    return [Math.round((event.clientX - box.left) * 10) / 10, Math.round((event.clientY - box.top) * 10) / 10]
  }
  canvas.addEventListener('pointerdown', event => {
    canvas.setPointerCapture(event.pointerId)
    drawing = point(event)
    strokes.push(drawing)
    redraw()
    event.preventDefault()
  }, { signal })
  canvas.addEventListener('pointermove', event => {
    if (!drawing) return
    for (const sample of event.getCoalescedEvents?.() ?? [event]) drawing.push(...point(sample))
    redraw()
  }, { signal })
  const stop = () => {
    drawing = null
    update()
  }
  canvas.addEventListener('pointerup', stop, { signal })
  canvas.addEventListener('pointercancel', stop, { signal })
  $('#signatureClear').addEventListener('click', () => {
    strokes = []
    redraw()
    update()
  }, { signal })

  textInput.addEventListener('input', () => {
    typed = textShape(textInput.value, SIGNATURE_FONT)
    $('#signatureTypePreview').innerHTML = typed ? shapeSvg(typed, textInput.value) : ''
    update()
  }, { signal })

  $('#signatureImagePick').addEventListener('click', () => imageInput.click(), { signal })
  imageInput.addEventListener('change', async () => {
    const file = imageInput.files?.[0]
    imageInput.value = ''
    if (!file) return
    const preview = $('#signatureImagePreview')
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      traced = imageShape(bitmap)
      bitmap.close()
    } catch {
      traced = null
    }
    preview.innerHTML = traced ? shapeSvg(traced, file.name) : '<p class="dialog__error">Bu görselde imza bulunamadı.</p>'
    update()
  }, { signal })

  const listSaved = () => {
    const saved = store.list()
    $('#signatureSaved').hidden = saved.length === 0
    $('#signatureSavedList').replaceChildren(...saved.map(item => {
      const row = document.createElement('li')
      const picture = document.createElement('span')
      picture.className = 'signature-dialog__thumb'
      picture.innerHTML = shapeSvg(item.shape, item.description)
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'secondary-button'
      remove.textContent = 'Sil'
      remove.setAttribute('aria-label', `${item.description} imzasını sil`)
      remove.addEventListener('click', () => {
        store.remove(item.id)
        listSaved()
        onRemoved(item.id)
      })
      row.append(picture, remove)
      return row
    }))
    keep.disabled = store.isFull
    keep.checked = !store.isFull
    keep.parentElement!.title = store.isFull ? 'En çok 5 imza saklanır; yenisi için birini silin.' : ''
  }

  strokes = []
  typed = traced = null
  textInput.value = ''
  $('#signatureTypePreview').innerHTML = ''
  $('#signatureImagePreview').innerHTML = ''
  listSaved()
  dialog.returnValue = ''
  dialog.showModal()
  choose('draw')

  return new Promise(resolve => {
    dialog.addEventListener('close', () => {
      controller.abort()
      const shape = current()
      if (dialog.returnValue !== 'add' || !shape) resolve(null)
      else resolve({ description: nameInput.value.trim() || 'İmza', shape, keep: keep.checked && !keep.disabled })
    }, { once: true })
  })
}
