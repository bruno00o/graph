import {
  defineGraph,
  edges,
  type GraphInstance,
  mountGraph,
  nodes,
  type View,
} from '@bruno00o/graph'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from '../shared/messages'
import { button, createPage, status, themeToggle } from '../shared/page'

interface Tile {
  readonly index: number
  readonly graph: GraphInstance
  readonly element: HTMLElement
  visible: boolean
  seen: number
  live: boolean
  losing: boolean
  kept: boolean
  held: { readonly view: View; readonly selection: string } | null
}

const params = new URLSearchParams(location.search)
const count = Number(params.get('graphs') ?? 20)
const budget = Number(params.get('live') ?? 8)
const nodeCount = Number(params.get('nodes') ?? 400)
const edgeCount = Number(params.get('edges') ?? nodeCount * 2)

const { header, main } = createPage(messages.suspend)
main.classList.add('tiles')

const tiles: Tile[] = []
const byElement = new Map<Element, Tile>()
const resumes: number[] = []
let clock = 0
let lost = 0

const liveStatus = status()
const lostStatus = status()
const keptStatus = status()
const resumeStatus = status()

function describe(): void {
  const live = tiles.filter((tile) => !tile.graph.store.state.suspended).length
  liveStatus.textContent = messages.suspendLive(live, tiles.length)
  lostStatus.textContent = messages.suspendLost(lost)
  keptStatus.textContent = messages.suspendKept(
    tiles.filter((tile) => tile.kept).length,
    tiles.length,
  )
  const last = resumes.at(-1)
  resumeStatus.textContent = last === undefined ? '' : messages.suspendResume(last)
}

function snapshot(tile: Tile): { view: View; selection: string } {
  return {
    view: tile.graph.view.get(),
    selection: tile.graph.selection.get().nodes.join(),
  }
}

function suspend(tile: Tile): void {
  if (tile.graph.store.state.suspended) return
  tile.losing = tile.live
  tile.live = false
  tile.graph.suspend()
  tile.held = snapshot(tile)
}

function resume(tile: Tile): void {
  if (!tile.graph.store.state.suspended) return
  const held = tile.held
  if (held) {
    const now = snapshot(tile)
    const same =
      now.selection === held.selection &&
      now.view.x === held.view.x &&
      now.view.y === held.view.y &&
      now.view.zoom === held.view.zoom &&
      tile.graph.count().nodes === nodeCount
    if (!same) tile.kept = false
  }
  const start = performance.now()
  tile.graph.resume()
  tile.live = true
  void tile.graph.drawn().then(() => {
    resumes.push(performance.now() - start)
    describe()
  })
}

function balance(): void {
  const ranked = [...tiles].sort((a, b) => Number(b.visible) - Number(a.visible) || b.seen - a.seen)
  ranked.forEach((tile, rank) => {
    if (!tile.visible && rank >= budget) suspend(tile)
  })
  for (const tile of ranked) if (tile.visible) resume(tile)
  describe()
}

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      const tile = byElement.get(entry.target)
      if (!tile) continue
      tile.visible = entry.isIntersecting
      if (tile.visible) tile.seen = ++clock
    }
    balance()
  },
  { root: main },
)

for (let index = 0; index < count; index++) {
  const { items, links } = createSample(nodeCount, edgeCount, 6, index + 1)
  const element = document.createElement('section')
  element.className = 'tile'
  const caption = document.createElement('h2')
  caption.textContent = messages.suspendGraph(index + 1)
  const host = document.createElement('div')
  host.className = 'tile-graph'
  element.append(caption, host)
  main.append(element)
  const graph = mountGraph(host, {
    definition: defineGraph({
      marks: [
        edges<Link>(links, { source: 'from', target: 'to', opacity: 0.4 }),
        nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
      ],
    }),
    ariaLabel: messages.suspendGraph(index + 1),
    suspended: true,
  })
  graph.selection.set({ nodes: [`n${index}`] })
  const tile: Tile = {
    index,
    graph,
    element,
    visible: false,
    seen: 0,
    live: false,
    losing: false,
    kept: true,
    held: null,
  }
  graph.element.querySelector('canvas')?.addEventListener('webglcontextlost', () => {
    if (tile.losing) tile.losing = false
    else lost++
    describe()
  })
  tiles.push(tile)
  byElement.set(element, tile)
  observer.observe(element)
}

function tour(): Promise<void> {
  return new Promise((done) => {
    const end = main.scrollHeight - main.clientHeight
    let down = true
    const step = () => {
      main.scrollTop += down ? 160 : -160
      if (down && main.scrollTop >= end - 1) down = false
      else if (!down && main.scrollTop <= 0) {
        done()
        return
      }
      setTimeout(step, 80)
    }
    step()
  })
}

header.append(
  liveStatus,
  lostStatus,
  keptStatus,
  resumeStatus,
  button(messages.suspendTour, () => {
    void tour()
  }),
  themeToggle(messages.dark, messages.light),
)
const hint = document.createElement('p')
hint.className = 'tiles-hint'
hint.textContent = messages.suspendHint
main.prepend(hint)
describe()

Object.assign(window, {
  graph: tiles[0]?.graph,
  tiles,
  tour,
  suspendStats: () => ({
    lost,
    live: tiles.filter((tile) => !tile.graph.store.state.suspended).length,
    kept: tiles.filter((tile) => tile.kept).length,
    resumes: [...resumes],
  }),
})
