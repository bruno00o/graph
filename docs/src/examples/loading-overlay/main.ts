import {
  defineGraph,
  edges,
  type GraphDataStatus,
  type GraphInstance,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { type Collection, createCollection } from '@tanstack/db'
import { createCommunities, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'

const batchCount = 3
const batchDelay = 700
const { items, links } = createCommunities(120, 170)

interface Load {
  readonly items: Collection<Item, string>
  readonly links: Collection<Link, string>
}

interface Progress {
  nodes: number
}

function slices<T>(rows: readonly T[]): T[][] {
  const size = Math.ceil(rows.length / batchCount)
  return Array.from({ length: batchCount }, (_, batch) =>
    rows.slice(batch * size, (batch + 1) * size),
  )
}

function delayed<T extends { readonly id: string }>(
  rows: readonly T[],
  fails: boolean,
  delivered: (count: number) => void,
): Collection<T, string> {
  return createCollection<T, string>({
    getKey: (row) => row.id,
    gcTime: 0,
    sync: {
      sync: ({ begin, write, commit, markReady, fail }) => {
        const batches = slices(rows)
        const timers: ReturnType<typeof setTimeout>[] = []
        let count = 0
        batches.forEach((batch, index) => {
          timers.push(
            setTimeout(
              () => {
                if (fails && index === batches.length - 1) {
                  fail(new Error(messages.serverError))
                  return
                }
                begin()
                for (const row of batch) write({ type: 'insert', value: row })
                commit()
                count += batch.length
                delivered(count)
                if (index === batches.length - 1) markReady()
              },
              batchDelay * (index + 1),
            ),
          )
        })
        return () => {
          for (const timer of timers) clearTimeout(timer)
        }
      },
    },
  })
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', onClick)
  return element
}

export function mount(container: HTMLElement): GraphInstance {
  const overlay = document.createElement('div')
  overlay.className = 'example-hint'
  overlay.setAttribute('role', 'status')
  const status = document.createElement('output')
  status.className = 'example-status'
  status.setAttribute('aria-live', 'polite')
  const progress: Progress = { nodes: 0 }

  const show = (data: GraphDataStatus) => {
    overlay.hidden = !data.loading
    overlay.textContent = messages.loading(progress.nodes, items.length)
  }

  const load = (round: number, fails: boolean): Load => {
    progress.nodes = 0
    const prefix = round === 0 ? '' : `r${round}:`
    return {
      items: delayed(
        items.map((item) => ({ ...item, id: prefix + item.id })),
        fails,
        (count) => {
          progress.nodes = count
          overlay.textContent = messages.loading(count, items.length)
        },
      ),
      links: delayed(
        links.map((link) => ({
          ...link,
          id: prefix + link.id,
          from: prefix + link.from,
          to: prefix + link.to,
        })),
        false,
        () => {},
      ),
    }
  }

  const definitionOf = ({ items, links }: Load) =>
    defineGraph({
      marks: [
        edges(links, { source: 'from', target: 'to' }),
        nodes(items, { color: 'group', size: 'weight', label: 'label' }),
      ],
      scales: { size: { domain: [1, 20], range: [12, 36] } },
      layout: force(),
    })

  const graph = mountGraph(container, {
    definition: definitionOf(load(0, false)),
    ariaLabel: messages.graphLabel,
  })

  const report = async () => {
    status.textContent = ''
    await graph.loaded()
    const { failed } = graph.store.state.data
    const { nodes, edges } = graph.count()
    status.textContent =
      failed.length > 0 ? messages.failed(nodes, items.length) : messages.loaded(nodes, edges)
  }

  let round = 0
  const reload = (fails: boolean) => async () => {
    round += 1
    graph.update({ definition: definitionOf(load(round, fails)) })
    await report()
    void graph.layout.run(undefined, { fit: true })
  }

  show(graph.store.state.data)
  graph.on('loadingchange', show)
  void report().catch(() => {})

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.reload, () => void reload(false)().catch(() => {})),
    button(messages.reloadFailing, () => void reload(true)().catch(() => {})),
  )
  container.append(overlay, actions, status)
  return graph
}
