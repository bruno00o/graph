import { type Badge, defineGraph, edges, mountGraph, type NodeImage, nodes } from '@bruno00o/graph'
import { messages } from '../shared/messages'
import { button, createPage, exportButtons, status, themeToggle } from '../shared/page'

interface Item {
  readonly id: string
  readonly label: string
  readonly group: string
  readonly size: number
  readonly x: number
  readonly y: number
  readonly image: NodeImage | string | null
  readonly count: number | null
  readonly flag: string | null
  readonly dot: boolean
  readonly outline: string | null
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

function svg(viewBox: string, body: string): string {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`)}`
}

function picture(from: string, to: string, accent: string, wide: boolean): string {
  const width = wide ? 240 : 120
  return svg(
    `0 0 ${width} 120`,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="${width}" height="120" fill="url(#g)"/><circle cx="${width / 2 - 20}" cy="52" r="26" fill="${accent}" opacity="0.85"/><rect x="${width / 2 - 4}" y="66" width="48" height="30" rx="6" fill="#ffffff" opacity="0.6"/>`,
  )
}

const icons = {
  grid: svg(
    '0 0 24 24',
    '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
  ),
  bars: svg(
    '0 0 24 24',
    '<rect x="3" y="11" width="4" height="10" rx="1"/><rect x="10" y="5" width="4" height="16" rx="1"/><rect x="17" y="8" width="4" height="13" rx="1"/>',
  ),
  ring: svg(
    '0 0 24 24',
    '<path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20zm0 5a5 5 0 1 1 0 10a5 5 0 1 1 0-10z"/>',
  ),
  plus: svg('0 0 24 24', '<path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z"/>'),
  triangle: svg('0 0 24 24', '<path d="M12 3l10 18H2z"/>'),
}

const icon = (src: string): NodeImage => ({ src, scale: 0.55, color: 'var(--graph-paper)' })

function item(
  index: number,
  group: string,
  size: number,
  image: Item['image'],
  badges: Partial<Pick<Item, 'count' | 'flag' | 'dot' | 'outline'>> = {},
): Item {
  return {
    id: `n${index}`,
    label: messages.node(String(index + 1)),
    group: messages.group(group),
    size,
    x: (index % 4) * 150 - 225,
    y: Math.floor(index / 4) * 150 - 150,
    image,
    count: badges.count ?? null,
    flag: badges.flag ?? null,
    dot: badges.dot ?? false,
    outline: badges.outline ?? null,
  }
}

const items: Item[] = [
  item(0, 'A', 44, picture('#2769b7', '#12867c', '#f7f7f4', false), {
    count: 3,
    dot: true,
    outline: 'var(--graph-cat-1)',
  }),
  item(1, 'B', 44, picture('#a47c13', '#9b357f', '#191d22', true), {
    count: 12,
    flag: 'N',
    outline: 'var(--graph-cat-2)',
  }),
  item(2, 'C', 36, picture('#448335', '#4189ad', '#f7f7f4', false), {
    dot: true,
    outline: 'var(--graph-cat-3)',
  }),
  item(3, 'A', 36, icon(icons.grid), { count: 128 }),
  item(4, 'B', 36, icon(icons.bars), { count: 7, flag: 'B', dot: true }),
  item(5, 'C', 28, icon(icons.ring), { flag: 'C' }),
  item(6, 'D', 28, icon(icons.plus), { count: 1 }),
  item(7, 'D', 28, icon(icons.triangle), { dot: true }),
  item(8, 'A', 20, null, { count: 4, dot: true }),
  item(9, 'B', 20, picture('#5d4099', '#c93700', '#f7f7f4', true)),
  item(10, 'C', 14, icon(icons.grid), { count: 2, dot: true }),
  item(11, 'D', 14, null),
]

const links: Link[] = items.slice(1).map((item, index) => ({
  id: `l${index}`,
  from: items[Math.floor(index / 2)]?.id ?? 'n0',
  to: item.id,
}))

const define = (background: boolean) =>
  defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to', arrow: 'target' }),
      nodes<Item>(items, {
        x: 'x',
        y: 'y',
        color: 'group',
        size: 'size',
        label: { text: 'label', background },
        outline: (item) => item.outline,
        outlineWidth: 3,
        image: (item) => item.image,
        badges: {
          topRight: (item): Badge | null =>
            item.count === null ? null : { text: item.count > 99 ? '99+' : item.count },
          topLeft: (item): Badge | null =>
            item.flag === null ? null : { text: item.flag, fill: 'var(--graph-accent)' },
          bottomRight: (item): Badge | null => (item.dot ? { fill: 'var(--graph-cat-6)' } : null),
        },
      }),
    ],
    scales: { size: (value) => value },
    states: { muted: { opacity: 0.25, label: false } },
  })

let backgrounds = false
const definition = define(backgrounds)

const { header, main } = createPage(messages.nodes)
const graph = mountGraph(main, { definition, ariaLabel: messages.nodesLabel })

const hovered = status()
graph.on('pointerenter', ({ target }) => {
  if (target.kind === 'node') hovered.textContent = target.datum.label
})
graph.on('pointerleave', () => {
  hovered.textContent = ''
})

let muted = false
header.append(
  hovered,
  button(messages.mute, () => {
    muted = !muted
    graph.states.set('muted', {
      nodes: muted ? items.filter((_, at) => at % 2 === 1).map((item) => item.id) : [],
    })
  }),
  button(messages.labelBackgrounds, () => {
    backgrounds = !backgrounds
    graph.update({ definition: define(backgrounds) })
  }),
  button(messages.fit, () => graph.view.fit({ duration: 400 })),
  ...exportButtons(graph, 'nodes', { png: messages.exportPng, svg: messages.exportSvg }),
  themeToggle(messages.dark, messages.light),
)

Object.assign(window, { graph })
