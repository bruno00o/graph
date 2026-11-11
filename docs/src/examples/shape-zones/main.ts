import {
  defineGraph,
  type EdgeDash,
  edges,
  type GraphInstance,
  mountGraph,
  nodes,
  type ShapeGeometry,
} from '@bruno00o/graph'
import { shapes } from '@bruno00o/graph/shapes'
import { messages } from './messages'
import '../shared/overlays.css'

type Frame = keyof typeof messages.frames
type Outline = keyof typeof messages.outlines

interface Zone {
  readonly id: Exclude<Frame, 'all'>
  readonly geometry: ShapeGeometry
  readonly tone: number
  readonly line: boolean
}

interface Item {
  readonly id: string
  readonly label: string
  readonly zone: number
  readonly x: number
  readonly y: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const blob = (cx: number, cy: number, radii: readonly number[]) =>
  radii.map((radius, index) => {
    const angle = (index / radii.length) * Math.PI * 2
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius] as const
  })

const trail = Array.from({ length: 40 }, (_, index) => {
  const t = index / 39
  return { x: 40 + t * 920, y: 600 - t * 300 + Math.sin(t * Math.PI * 3) * 60 }
})

const zones: Zone[] = [
  {
    id: 'court',
    geometry: {
      rings: [
        blob(250, 250, [210, 190, 170, 200, 230, 180, 160, 190, 220, 200, 175, 205]),
        blob(270, 240, [70, 55, 62, 48, 66, 58, 74, 50]),
      ],
    },
    tone: 1,
    line: false,
  },
  {
    id: 'ring',
    geometry: { center: { x: 720, y: 200 }, radius: 150, inner: 90 },
    tone: 2,
    line: false,
  },
  {
    id: 'block',
    geometry: { x: 560, y: 420, width: 340, height: 180, cornerRadius: 28 },
    tone: 3,
    line: false,
  },
  { id: 'trail', geometry: { points: trail }, tone: 4, line: true },
]

const names = [
  'Alpha',
  'Beta',
  'Gamma',
  'Delta',
  'Epsilon',
  'Zeta',
  'Eta',
  'Theta',
  'Iota',
  'Kappa',
  'Lambda',
  'Mu',
  'Nu',
  'Xi',
  'Omicron',
  'Pi',
  'Rho',
  'Sigma',
]
const places: readonly (readonly [zone: number, x: number, y: number])[] = [
  [0, 120, 180],
  [0, 160, 340],
  [0, 300, 380],
  [0, 390, 260],
  [0, 220, 110],
  [0, 360, 130],
  [1, 720, 75],
  [1, 840, 230],
  [1, 640, 320],
  [1, 595, 160],
  [2, 620, 480],
  [2, 760, 470],
  [2, 850, 550],
  [2, 680, 560],
  [3, 110, 560],
  [3, 330, 520],
  [3, 470, 440],
  [3, 930, 300],
]
const items: Item[] = places.map(([zone, x, y], index) => ({
  id: `n${index}`,
  label: names[index] ?? `n${index}`,
  zone,
  x,
  y,
}))
const pairs = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 5],
  [5, 4],
  [4, 0],
  [6, 7],
  [7, 8],
  [8, 9],
  [9, 6],
  [10, 11],
  [11, 12],
  [12, 13],
  [13, 10],
  [14, 15],
  [15, 16],
  [3, 9],
  [8, 11],
  [2, 15],
  [16, 10],
  [7, 17],
] as const
const links: Link[] = pairs.map(([from, to], index) => ({
  id: `e${index}`,
  from: `n${from}`,
  to: `n${to}`,
}))

const frames = Object.keys(messages.frames) as Frame[]
const outlines = Object.keys(messages.outlines) as Outline[]

const define = (outline: Outline) =>
  defineGraph({
    marks: [
      shapes(zones, {
        fill: (zone) =>
          zone.line ? null : `color-mix(in srgb, var(--graph-cat-${zone.tone}) 18%, transparent)`,
        stroke: (zone) => `var(--graph-cat-${zone.tone})`,
        strokeWidth: (zone) => (zone.line ? 3 : 1.5),
        dash: (zone): EdgeDash => (zone.line ? 'dashed' : outline),
      }),
      edges(links, { source: 'from', target: 'to' }),
      nodes(items, {
        x: 'x',
        y: 'y',
        size: 14,
        fill: (item) => `var(--graph-cat-${(zones[item.zone]?.tone ?? 1) + 4})`,
        label: 'label',
      }),
    ],
  })

function button(text: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', () => onClick(element))
  return element
}

export function mount(container: HTMLElement): GraphInstance {
  let frame: Frame = 'all'
  let outline: Outline = 'solid'
  const graph = mountGraph(container, {
    definition: define(outline),
    ariaLabel: messages.graphLabel(items.length, zones.length),
  })

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.frame(messages.frames[frame]), (element) => {
      frame = frames[(frames.indexOf(frame) + 1) % frames.length] ?? 'all'
      element.textContent = messages.frame(messages.frames[frame])
      graph.view.fit(frame === 'all' ? { duration: 400 } : { shapes: [frame], duration: 400 })
    }),
    button(messages.outline(messages.outlines[outline]), (element) => {
      outline = outlines[(outlines.indexOf(outline) + 1) % outlines.length] ?? 'solid'
      element.textContent = messages.outline(messages.outlines[outline])
      graph.update({ definition: define(outline) })
    }),
  )
  container.append(actions)
  return graph
}
