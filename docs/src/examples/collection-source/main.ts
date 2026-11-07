import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { createCollection, localOnlyCollectionOptions } from '@tanstack/db'
import { createSample } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'

interface Row {
  readonly id: string
  readonly label: string
  readonly group: string
  readonly weight: number
}

interface Pair {
  readonly id: string
  readonly from: string
  readonly to: string
}

function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648
    return state / 2_147_483_648
  }
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
  const sample = createSample(40, 56, 4, 3, 0.02)
  const rows = createCollection(
    localOnlyCollectionOptions({
      getKey: (row: Row) => row.id,
      initialData: sample.items.map(({ id, label, group, weight }) => ({
        id,
        label,
        group,
        weight,
      })),
    }),
  )
  const pairs = createCollection(
    localOnlyCollectionOptions({ getKey: (pair: Pair) => pair.id, initialData: sample.links }),
  )

  const definition = defineGraph({
    marks: [
      edges(pairs, { source: 'from', target: 'to' }),
      nodes(rows, { color: 'group', size: 'weight', label: 'label' }),
    ],
    scales: { size: { domain: [1, 100], range: [10, 34] } },
    states: { touched: { outline: 'var(--graph-accent)', outlineWidth: 3, label: true } },
    layout: force(),
  })
  const graph = mountGraph(container, { definition, ariaLabel: messages.graphLabel })

  const status = document.createElement('output')
  status.className = 'example-status'
  status.setAttribute('aria-live', 'polite')
  const report = (action?: string) => {
    status.textContent = [action, messages.totals(rows.size, pairs.size)].filter(Boolean).join(' ')
  }
  report()

  const next = seeded(11)
  let created = sample.items.length
  const pick = (): Row | undefined => {
    const all = [...rows.values()]
    return all[Math.floor(next() * all.length)]
  }
  const touch = (key: string | null) => {
    if (key) graph.states.set('touched', { nodes: [key] })
    else graph.states.clear('touched')
  }

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.insert, () => {
      const anchor = pick()
      if (!anchor) return
      created += 1
      const row = {
        id: `added-${created}`,
        label: messages.node(created),
        group: anchor.group,
        weight: Math.round(5 + next() * 60),
      }
      rows.insert(row)
      pairs.insert({ id: `link-${created}`, from: anchor.id, to: row.id })
      touch(row.id)
      report(messages.inserted(row.label, anchor.label))
    }),
    button(messages.update, () => {
      const row = pick()
      if (!row) return
      const weight = row.weight < 50 ? Math.round(70 + next() * 30) : Math.round(2 + next() * 10)
      rows.update(row.id, (draft) => {
        draft.weight = weight
      })
      touch(row.id)
      report(messages.updated(row.label, row.weight, weight))
    }),
    button(messages.remove, () => {
      const row = pick()
      if (!row || rows.size <= 1) return
      const attached = [...pairs.values()]
        .filter((pair) => pair.from === row.id || pair.to === row.id)
        .map((pair) => pair.id)
      if (attached.length > 0) pairs.delete(attached)
      rows.delete(row.id)
      touch(null)
      report(messages.removed(row.label, attached.length))
    }),
  )
  container.append(actions, status)

  return graph
}
