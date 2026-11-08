import { themeColor } from '../theme/tokens'
import type { Mark } from '../types'
import type { Legend, LegendLayer, LegendState } from './index'
import type {
  LegendColor,
  LegendEdgeLook,
  LegendLook,
  LegendNodeLook,
  LegendScalesOf,
  LegendSizes,
  LegendValue,
} from './read'

/**
 * A section of a legend: `'color'`, `'size'`, `'width'`, `'looks'` or `'layers'`. A mark with a
 * scale of its own adds a block after the section of that scale.
 */
export type LegendSection = 'color' | 'size' | 'width' | 'looks' | 'layers'

/** Options of `mountLegend`. The legend writes no text of its own: titles come from these. */
export interface LegendViewOptions<M extends Mark = Mark> {
  /** Titles of the sections. A section without a title shows none. */
  readonly titles?: Partial<Readonly<Record<LegendSection, string | undefined>>> | undefined
  /**
   * Sections to show, in this order. Looks show only for a kind of element drawn with more than
   * one look, layers only when a mark names a layer.
   * @default ['color', 'size', 'width', 'looks', 'layers']
   */
  readonly sections?: readonly LegendSection[] | undefined
  /**
   * Text of a value of a scale. Defaults to the value, numbers formatted for the language of the
   * page with at most two decimals.
   */
  readonly format?: ((value: LegendValue, section: LegendSection) => string) | undefined
  /** Text of a look. Defaults to the name of its mark, or no text for a mark without a name. */
  readonly lookText?: ((look: LegendLook<M>) => string) | undefined
  /**
   * Title of the block of a scale of its own of a mark, shown after the section of that scale.
   * Defaults to the name of the mark, or no title for a mark without a name.
   */
  readonly markTitle?:
    | ((scales: LegendScalesOf<M>, section: 'color' | 'size' | 'width') => string)
    | undefined
  /** Text of a layer. Defaults to its name. */
  readonly layerText?: ((layer: LegendLayer<M>) => string) | undefined
  /**
   * Categories, looks and layers switch off and on by click, Enter or Space, as toggle buttons.
   * @default true
   */
  readonly toggle?: boolean | undefined
  /** Accessible name of the legend. */
  readonly ariaLabel?: string | undefined
}

/** A legend in the page, made by `mountLegend`. */
export interface LegendView<M extends Mark = Mark> {
  /** The element of the legend, for the application to place. */
  readonly element: HTMLElement
  /**
   * Changes the options: an option left out keeps its current value, an option set to `undefined`
   * returns to its default.
   */
  update(options?: LegendViewOptions<M>): void
  /** Removes the element. The legend itself stays. */
  destroy(): void
}

const allSections: readonly LegendSection[] = ['color', 'size', 'width', 'looks', 'layers']
let headings = 0
const maxDiameter = 40
const maxWidth = 12
const border = `color-mix(in srgb, ${themeColor('ink')} 16%, transparent)`
const hoverFill = `color-mix(in srgb, ${themeColor('ink')} 8%, transparent)`
const rootStyle = `display:flex;flex-direction:column;gap:10px;box-sizing:border-box;padding:8px 10px;border:1px solid ${border};border-radius:4px;background:${themeColor('paper-raised')};color:${themeColor('ink')};font:12px/1.4 ${themeColor('font')};max-width:100%`
const titleStyle = `font-weight:600;margin:0 0 4px`
const listStyle = 'list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1px'
const itemStyle =
  'display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;padding:2px 4px;margin:0;border:0;border-radius:3px;background:none;font:inherit;color:inherit;text-align:left'

function defaultFormat(value: LegendValue): string {
  if (typeof value !== 'number') return String(value)
  const language = document.documentElement.lang || undefined
  return value.toLocaleString(language, { maximumFractionDigits: 2 })
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  style: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.style.cssText = style
  if (text !== undefined) node.textContent = text
  return node
}

function colorParts(parts: string[], color: LegendColor | null): void {
  if (color?.type === 'categories') {
    for (const item of color.items) parts.push(item.id, item.color)
  } else if (color) {
    parts.push('ramp', ...color.domain.map(String), ...color.stops)
  }
}

function sizeParts(parts: string[], sizes: LegendSizes | null): void {
  parts.push('|')
  for (const item of sizes?.items ?? []) parts.push(String(item.value), String(item.size))
}

function structure(state: LegendState): string {
  const parts: string[] = []
  colorParts(parts, state.color)
  sizeParts(parts, state.size)
  sizeParts(parts, state.width)
  for (const mark of state.marks) {
    parts.push('|', mark.id, String(mark.mark))
    colorParts(parts, mark.color)
    sizeParts(parts, mark.size)
    sizeParts(parts, mark.width)
  }
  parts.push('|')
  for (const look of state.looks) parts.push(look.id)
  parts.push('|')
  for (const layer of state.layers) parts.push(layer.id)
  return parts.join('\u0000')
}

/**
 * Renders a legend in a plain element styled by the `--graph-…` tokens: swatches, a ramp, sizes,
 * widths and looks. Items highlight their elements under the pointer or the keyboard.
 */
export function mountLegend<S extends string, M extends Mark>(
  legend: Legend<S, M>,
  options: LegendViewOptions<M> = {},
): LegendView<M> {
  let settings = options
  const root = element('div', rootStyle)
  root.setAttribute('data-graph-legend', '')
  root.setAttribute('role', 'group')
  const items = new Map<string, HTMLElement>()
  let shown = ''
  let destroyed = false
  let building = false

  function text(value: LegendValue, section: LegendSection): string {
    return (settings.format ?? defaultFormat)(value, section)
  }

  function section(
    name: LegendSection,
    body: HTMLElement,
    mark: LegendScalesOf<M> | null = null,
  ): HTMLElement {
    const block = element('section', 'margin:0')
    block.setAttribute('data-section', name)
    if (mark) block.setAttribute('data-mark', mark.id)
    const title = mark
      ? (settings.markTitle?.(mark, name as 'color' | 'size' | 'width') ?? mark.mark)
      : settings.titles?.[name]
    if (title !== undefined) {
      const heading = element('div', titleStyle, title)
      heading.id = `graph-legend-${++headings}`
      block.setAttribute('aria-labelledby', heading.id)
      block.append(heading)
    }
    block.append(body)
    return block
  }

  function item(id: string | null, symbol: HTMLElement, label: string): HTMLElement {
    const toggle = id !== null && settings.toggle !== false
    const node = element(toggle ? 'button' : 'div', itemStyle)
    const row = element('li', 'margin:0')
    symbol.setAttribute('aria-hidden', 'true')
    node.append(symbol, element('span', 'overflow-wrap:anywhere', label))
    if (toggle) {
      ;(node as HTMLButtonElement).type = 'button'
      node.style.cursor = 'pointer'
    }
    if (id !== null) {
      node.setAttribute('data-item', id)
      items.set(id, node)
    }
    row.append(node)
    return row
  }

  function list(rows: readonly HTMLElement[]): HTMLElement {
    const node = element('ul', listStyle)
    node.setAttribute('role', 'list')
    node.append(...rows)
    return node
  }

  function swatch(color: string): HTMLElement {
    return element('span', `flex:none;width:10px;height:10px;border-radius:2px;background:${color}`)
  }

  function colorSection(
    color: LegendColor | null,
    mark: LegendScalesOf<M> | null = null,
  ): HTMLElement | null {
    if (!color) return null
    if (color.type === 'categories') {
      const rows = color.items.map((entry) =>
        item(entry.id, swatch(entry.color), text(entry.value, 'color')),
      )
      return section('color', list(rows), mark)
    }
    const body = element('div', 'display:flex;flex-direction:column;gap:2px;min-width:120px')
    const ramp = element('div', 'height:8px;border-radius:2px')
    ramp.setAttribute('aria-hidden', 'true')
    const stops = color.stops.join(', ')
    ramp.style.background = `linear-gradient(to right, ${stops})`
    ramp.style.background = `linear-gradient(in oklab to right, ${stops})`
    const ends = element('div', 'display:flex;justify-content:space-between;gap:8px')
    ends.append(
      element('span', '', text(color.domain[0], 'color')),
      element('span', '', text(color.domain[1], 'color')),
    )
    body.append(ramp, ends)
    return section('color', body, mark)
  }

  function sizeSection(
    name: 'size' | 'width',
    sizes: LegendSizes | null,
    mark: LegendScalesOf<M> | null = null,
  ): HTMLElement | null {
    if (!sizes) return null
    const largest = Math.max(...sizes.items.map((entry) => entry.size))
    const shrink = largest > maxDiameter ? maxDiameter / largest : 1
    const box = name === 'size' ? Math.max(2, largest * shrink) : 24
    const rows = sizes.items.map((entry) => {
      const symbol = element(
        'span',
        `flex:none;display:flex;align-items:center;justify-content:center;width:${box}px;height:${name === 'size' ? box : maxWidth}px`,
      )
      if (name === 'size') {
        const diameter = Math.max(2, entry.size * shrink)
        symbol.append(
          element(
            'span',
            `width:${diameter}px;height:${diameter}px;border-radius:50%;box-sizing:border-box;background:${themeColor('node')};border:1px solid ${themeColor('node-ring')}`,
          ),
        )
      } else {
        symbol.append(
          element(
            'span',
            `width:24px;height:${Math.max(1, Math.min(maxWidth, entry.size))}px;background:${themeColor('edge')}`,
          ),
        )
      }
      return item(null, symbol, text(entry.value, name))
    })
    return section(name, list(rows), mark)
  }

  function scaleSections(name: 'color' | 'size' | 'width', state: LegendState<M>): HTMLElement[] {
    const blocks = [
      name === 'color' ? colorSection(state.color) : sizeSection(name, state[name]),
      ...state.marks.map((mark) =>
        name === 'color' ? colorSection(mark.color, mark) : sizeSection(name, mark[name], mark),
      ),
    ]
    return blocks.filter((block): block is HTMLElement => block !== null)
  }

  function nodeSymbol(look: LegendNodeLook): HTMLElement {
    const shape =
      look.shape === 'square'
        ? 'width:12px;height:12px;border-radius:1px'
        : look.shape === 'diamond'
          ? 'width:10px;height:10px;transform:rotate(45deg)'
          : look.shape === 'box'
            ? 'width:16px;height:10px;border-radius:3px'
            : 'width:14px;height:14px;border-radius:50%'
    const symbol = element(
      'span',
      'flex:none;display:flex;align-items:center;justify-content:center;width:16px;height:16px',
    )
    const body = element('span', `${shape};overflow:hidden;background:${themeColor('node')}`)
    if (look.image !== null) {
      const url = `url(${JSON.stringify(look.image)})`
      if (look.imageColor === null) {
        body.style.backgroundImage = url
        body.style.backgroundSize = 'cover'
        body.style.backgroundPosition = 'center'
      } else {
        body.style.background = look.imageColor
        body.style.setProperty('mask', `${url} center / cover no-repeat`)
      }
    }
    symbol.append(body)
    return symbol
  }

  function edgeSymbol(look: LegendEdgeLook): HTMLElement {
    const symbol = element(
      'span',
      'flex:none;display:flex;align-items:center;width:24px;height:16px',
    )
    symbol.append(element('span', `width:100%;border-top:2px ${look.dash} ${themeColor('edge')}`))
    return symbol
  }

  function looksSection(state: LegendState<M>): HTMLElement | null {
    const looks = state.looks as readonly (LegendNodeLook | LegendEdgeLook)[]
    const nodes = looks.filter((look) => look.kind === 'nodes')
    const edges = looks.filter((look) => look.kind === 'edges')
    const shown = [...(nodes.length > 1 ? nodes : []), ...(edges.length > 1 ? edges : [])]
    if (shown.length === 0) return null
    const rows = shown.map((look) =>
      item(
        look.id,
        look.kind === 'nodes' ? nodeSymbol(look) : edgeSymbol(look),
        settings.lookText?.(look as LegendLook<M>) ?? look.mark ?? '',
      ),
    )
    return section('looks', list(rows))
  }

  function layerSymbol(): HTMLElement {
    const symbol = element(
      'span',
      'flex:none;display:flex;flex-direction:column;justify-content:center;gap:2px;width:16px;height:16px',
    )
    for (let line = 0; line < 3; line++) {
      symbol.append(
        element('span', `height:2px;border-radius:1px;background:${themeColor('edge')}`),
      )
    }
    return symbol
  }

  function layersSection(state: LegendState<M>): HTMLElement | null {
    if (state.layers.length === 0) return null
    const rows = state.layers.map((layer) =>
      item(layer.id, layerSymbol(), settings.layerText?.(layer) ?? layer.name),
    )
    return section('layers', list(rows))
  }

  function build(state: LegendState<M>): void {
    const focused = (document.activeElement as HTMLElement | null)?.getAttribute?.('data-item')
    items.clear()
    const blocks: HTMLElement[] = []
    for (const name of settings.sections ?? allSections) {
      if (name === 'looks' || name === 'layers') {
        const block = name === 'looks' ? looksSection(state) : layersSection(state)
        if (block) blocks.push(block)
      } else {
        blocks.push(...scaleSections(name, state))
      }
    }
    building = true
    try {
      root.replaceChildren(...blocks)
      root.style.display = blocks.length > 0 ? 'flex' : 'none'
      if (focused) items.get(focused)?.focus()
    } finally {
      building = false
    }
  }

  function paint(state: LegendState<M>): void {
    const off = new Set(state.off)
    for (const [id, node] of items) {
      const isOff = off.has(id)
      if (node instanceof HTMLButtonElement) node.setAttribute('aria-pressed', String(!isOff))
      node.style.opacity = isOff ? '0.45' : ''
      node.style.background = state.hovered === id ? hoverFill : 'none'
    }
  }

  function render(): void {
    if (destroyed) return
    const state = legend.store.state
    const next = structure(state)
    if (next !== shown) {
      shown = next
      build(state)
    }
    paint(state)
  }

  function idOf(target: EventTarget | null): string | null {
    const node = (target as HTMLElement | null)?.closest?.('[data-item]')
    return node && root.contains(node) ? node.getAttribute('data-item') : null
  }

  const onPointerOver = (event: PointerEvent) => legend.hover(idOf(event.target))
  const onPointerLeave = () => legend.hover(null)
  const onFocusIn = (event: FocusEvent) => {
    if (!building) legend.hover(idOf(event.target))
  }
  const onFocusOut = (event: FocusEvent) => {
    if (building) return
    if (!root.contains(event.relatedTarget as Node | null)) legend.hover(null)
  }
  const onClick = (event: MouseEvent) => {
    if (settings.toggle === false) return
    const id = idOf(event.target)
    if (id !== null) legend.toggle(id)
  }
  root.addEventListener('pointerover', onPointerOver)
  root.addEventListener('pointerleave', onPointerLeave)
  root.addEventListener('focusin', onFocusIn)
  root.addEventListener('focusout', onFocusOut)
  root.addEventListener('click', onClick)
  const subscription = legend.store.subscribe(render)

  function label(): void {
    if (settings.ariaLabel) root.setAttribute('aria-label', settings.ariaLabel)
    else root.removeAttribute('aria-label')
  }

  label()
  render()

  return {
    element: root,
    update(next = {}) {
      if (destroyed) return
      settings = { ...settings, ...next }
      shown = ''
      label()
      render()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      subscription.unsubscribe()
      root.removeEventListener('pointerover', onPointerOver)
      root.removeEventListener('pointerleave', onPointerLeave)
      root.removeEventListener('focusin', onFocusIn)
      root.removeEventListener('focusout', onFocusOut)
      root.removeEventListener('click', onClick)
      root.remove()
    },
  }
}
