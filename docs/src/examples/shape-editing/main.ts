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
} from '@bruno00o/graph/editor'
import { shapes } from '@bruno00o/graph/shapes'
import { messages } from './messages'

interface Zone {
  readonly id: string
  readonly geometry: ShapeGeometry
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

const define = (zones: readonly Zone[]) =>
  defineGraph({
    marks: [
      shapes(zones, {
        name: 'zones',
        color: 'id',
        strokeWidth: (zone) => (zone.id === 'path' ? 3 : 1.5),
      }),
      edges(links, { source: 'from', target: 'to' }),
      nodes(items, { x: 'x', y: 'y', size: 14 }),
    ],
    interaction: { lasso: true },
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
  const history: (readonly Zone[])[] = []
  const graph = mountGraph(container, {
    definition: define(zones),
    ariaLabel: messages.graphLabel(start.length, items.length),
  })
  const status = document.createElement('p')
  status.className = 'example-status'
  status.setAttribute('aria-live', 'polite')

  function show(next: readonly Zone[]): void {
    zones = next
    graph.update({ definition: define(zones) })
    undo.disabled = history.length === 0
    status.textContent = messages.status(history.length)
  }

  const undo = button(messages.undo, () => {
    const previous = history.pop()
    if (previous) show(previous)
  })
  const editor = createShapeEditor(graph, {
    onEdit: (edits: readonly ShapeEdit[]) => {
      history.push(zones)
      show(applyShapeEdits(zones, edits))
    },
  })
  mountShapeEditor(editor)
  const remove = button(messages.remove, () => editor.remove())
  editor.store.subscribe(() => {
    remove.disabled = editor.store.state.selected.length === 0
  })
  undo.disabled = true
  remove.disabled = true
  status.textContent = messages.status(0)

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(undo, remove)
  container.append(actions, status)
  return graph
}
