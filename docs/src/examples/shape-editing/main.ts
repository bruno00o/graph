import {
  defineGraph,
  edges,
  type GraphInstance,
  mountGraph,
  nodes,
  type ShapeGeometry,
} from '@bruno00o/graph'
import {
  applyShapeEdits,
  createShapeEditor,
  mountShapeEditor,
  type ShapeEdit,
  type ShapeEditorTool,
} from '@bruno00o/graph/editor'
import { shapes } from '@bruno00o/graph/shapes'
import { messages } from './messages'
import '../shared/overlays.css'
import './shape-editing.css'

interface Zone {
  readonly id: string
  readonly geometry: ShapeGeometry
  readonly order?: number
}

interface Note {
  readonly id: string
  readonly geometry: ShapeGeometry
  readonly text?: string
}

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const start: Zone[] = [
  {
    id: 'area',
    geometry: {
      rings: [
        [
          { x: 0, y: 0 },
          { x: 320, y: -40 },
          { x: 380, y: 180 },
          { x: 220, y: 320 },
          { x: 20, y: 260 },
        ],
        [
          { x: 120, y: 90 },
          { x: 230, y: 80 },
          { x: 200, y: 190 },
        ],
      ],
    },
  },
  { id: 'block', geometry: { x: 460, y: 20, width: 260, height: 160, cornerRadius: 16 } },
  { id: 'ring', geometry: { center: { x: 600, y: 330 }, radius: 110, inner: 60 } },
  {
    id: 'path',
    geometry: {
      points: [
        { x: -40, y: 420 },
        { x: 160, y: 380 },
        { x: 320, y: 460 },
        { x: 470, y: 470 },
      ],
    },
  },
]

const startNotes: Note[] = [
  {
    id: 'note',
    geometry: { x: 460, y: -130, width: 260, height: 100 },
    text: messages.note,
  },
]

const items: Item[] = [
  { id: 'a', x: 90, y: 60 },
  { id: 'b', x: 290, y: 200 },
  { id: 'c', x: 590, y: 100 },
  { id: 'd', x: 600, y: 330 },
  { id: 'e', x: 160, y: 380 },
]

const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'bc', from: 'b', to: 'c' },
  { id: 'cd', from: 'c', to: 'd' },
  { id: 'be', from: 'b', to: 'e' },
]

const tools = Object.keys(messages.tools) as ShapeEditorTool[]

const define = (zones: readonly Zone[], notes: readonly Note[]) =>
  defineGraph({
    marks: [
      shapes(zones, {
        name: 'zones',
        color: 'id',
        order: 'order',
        strokeWidth: (zone) => ('points' in zone.geometry ? 3 : 1.5),
      }),
      shapes(notes, {
        name: 'notes',
        fill: 'transparent',
        stroke: 'var(--graph-ink-muted)',
        dash: 'dashed',
        label: { text: 'text', size: 16, wrap: true, scale: 'world', place: 'always' },
      }),
      edges(links, { source: 'from', target: 'to' }),
      nodes(items, { x: 'x', y: 'y', size: 14 }),
    ],
    interaction: { lasso: true },
    background: { grid: 'dots', spacing: 20 },
    view: { padding: { top: 112, right: 32, bottom: 56, left: 32 } },
  })

function button(text: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', onClick)
  return element
}

export function mount(container: HTMLElement): GraphInstance {
  let zones: readonly Zone[] = start
  let notes: readonly Note[] = startNotes
  const graph = mountGraph(container, {
    definition: define(zones, notes),
    ariaLabel: messages.graphLabel(start.length + startNotes.length, items.length),
  })
  const status = document.createElement('p')
  status.className = 'example-status'
  status.setAttribute('aria-live', 'polite')

  const editor = createShapeEditor(graph, {
    newMark: 'zones',
    textMark: 'notes',
    onEdit: (edits: readonly ShapeEdit[]) => {
      zones = applyShapeEdits(zones, edits, { mark: 'zones' })
      notes = applyShapeEdits(notes, edits, { mark: 'notes' })
      graph.update({ definition: define(zones, notes) })
    },
  })
  const view = mountShapeEditor(editor, { placeholder: messages.placeholder })
  view.input.setAttribute('aria-label', messages.textLabel)

  const toolbar = document.createElement('div')
  toolbar.className = 'shape-tools'
  toolbar.setAttribute('role', 'group')
  toolbar.setAttribute('aria-label', messages.toolsLabel)
  const toolButtons = tools.map((tool) => {
    const element = document.createElement('button')
    element.type = 'button'
    element.textContent = messages.tools[tool as keyof typeof messages.tools]
    element.addEventListener('click', () => {
      editor.setTool(tool)
      graph.element.focus()
    })
    return element
  })
  toolbar.append(...toolButtons)

  const undo = button(messages.undo, () => editor.undo())
  const redo = button(messages.redo, () => editor.redo())
  const duplicate = button(messages.duplicate, () => editor.duplicate())
  const raise = button(messages.raise, () => editor.raise())
  const lower = button(messages.lower, () => editor.lower())
  const remove = button(messages.remove, () => editor.remove())
  const snap = document.createElement('label')
  snap.className = 'shape-snap'
  const check = document.createElement('input')
  check.type = 'checkbox'
  check.addEventListener('change', () => {
    editor.update({ snap: { grid: check.checked ? 'background' : null } })
  })
  snap.append(check, messages.snap)

  function show(): void {
    const state = editor.store.state
    for (const [index, element] of toolButtons.entries()) {
      element.setAttribute('aria-pressed', String(tools[index] === state.tool))
    }
    undo.disabled = !state.canUndo
    redo.disabled = !state.canRedo
    const none = state.selected.length === 0
    for (const element of [duplicate, raise, lower, remove]) element.disabled = none
    const drawing = state.drawing
    status.textContent =
      drawing && (drawing.tool === 'polygon' || drawing.tool === 'line') && drawing.points > 0
        ? messages.drawing(drawing.points, drawing.tool === 'polygon')
        : messages.status(zones.length + notes.length)
  }
  editor.store.subscribe(show)
  show()

  const actions = document.createElement('div')
  actions.className = 'example-actions shape-actions'
  actions.append(toolbar, undo, redo, duplicate, raise, lower, remove, snap)
  container.append(actions, status)
  return graph
}
