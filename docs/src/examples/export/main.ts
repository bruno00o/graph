import {
  type Badge,
  defineGraph,
  edges,
  type GraphInstance,
  mountGraph,
  type NodeImage,
  nodes,
} from '@bruno00o/graph'
import { type ExportLabels, type ExportRegion, exportPng, exportSvg } from '@bruno00o/graph/export'
import { messages } from '../shared/messages'
import '../shared/overlays.css'

interface Item {
  readonly id: string
  readonly label: string
  readonly group: string
  readonly size: number
  readonly x: number
  readonly y: number
  readonly image: NodeImage | null
  readonly count: number | null
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly label: string | null
}

function icon(body: string): NodeImage {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`
  return {
    src: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    scale: 0.55,
    color: 'var(--graph-paper)',
  }
}

const icons: readonly (NodeImage | null)[] = [
  icon(
    '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
  ),
  icon(
    '<rect x="3" y="11" width="4" height="10" rx="1"/><rect x="10" y="5" width="4" height="16" rx="1"/><rect x="17" y="8" width="4" height="13" rx="1"/>',
  ),
  icon('<path d="M12 3l10 18H2z"/>'),
  null,
]

const items: Item[] = Array.from({ length: 10 }, (_, index) => {
  const angle = (index / 10) * Math.PI * 2
  return {
    id: `n${index}`,
    label: messages.node(index + 1),
    group: String.fromCharCode(65 + (index % 4)),
    size: index % 3 === 0 ? 40 : 28,
    x: Math.cos(angle) * 240,
    y: Math.sin(angle) * 170,
    image: icons[index % icons.length] ?? null,
    count: index % 3 === 0 ? index + 2 : null,
  }
})

const links: Link[] = items.map((item, index) => ({
  id: `r${index}`,
  from: item.id,
  to: items[(index + 1) % items.length]?.id ?? item.id,
  label: null,
}))
links.push(
  { id: 'p0', from: 'n0', to: 'n5', label: messages.edgeName(1) },
  { id: 'p1', from: 'n5', to: 'n0', label: messages.edgeName(2) },
  { id: 'p2', from: 'n0', to: 'n5', label: messages.edgeName(3) },
  { id: 'loop', from: 'n3', to: 'n3', label: messages.edgeName(4) },
)

const definition = defineGraph({
  marks: [
    edges<Link>(links, {
      source: 'from',
      target: 'to',
      arrow: 'target',
      label: (link) => link.label,
    }),
    nodes<Item>(items, {
      x: 'x',
      y: 'y',
      color: 'group',
      size: 'size',
      label: 'label',
      image: (item) => item.image,
      badges: {
        topRight: (item): Badge | null => (item.count === null ? null : { text: item.count }),
      },
    }),
  ],
  scales: { size: (value) => value },
})

function button(text: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', () => onClick(element))
  return element
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function mount(container: HTMLElement): GraphInstance {
  let region: ExportRegion = 'view'
  let labels: ExportLabels = 'visible'
  const graph = mountGraph(container, { definition, ariaLabel: messages.exportLabel })

  const status = document.createElement('output')
  status.className = 'example-status'
  const save = (format: string, blob: Blob, start: number, name: string) => {
    status.textContent = messages.exported(format, blob.size, performance.now() - start)
    download(blob, name)
  }

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.downloadPng, () => {
      const start = performance.now()
      void exportPng(graph, { region, labels, pixelRatio: 2 }).then((blob) =>
        save('PNG', blob, start, 'graph.png'),
      )
    }),
    button(messages.downloadSvg, () => {
      const start = performance.now()
      void exportSvg(graph, { region, labels }).then((text) =>
        save('SVG', new Blob([text], { type: 'image/svg+xml' }), start, 'graph.svg'),
      )
    }),
    button(messages.exportRegion(messages.exportRegions[region]), (element) => {
      region = region === 'view' ? 'graph' : 'view'
      element.textContent = messages.exportRegion(messages.exportRegions[region])
    }),
    button(messages.exportLabels(messages.exportLabelModes.visible), (element) => {
      labels = labels === 'visible' ? 'all' : 'visible'
      element.textContent = messages.exportLabels(
        labels === 'all' ? messages.exportLabelModes.all : messages.exportLabelModes.visible,
      )
    }),
  )
  container.append(actions, status)

  return graph
}
