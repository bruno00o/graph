import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import {
  BasicIndex,
  createCollection,
  createLiveQueryCollection,
  eq,
  gte,
  localOnlyCollectionOptions,
} from '@tanstack/db'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'

interface Score {
  readonly node: string
  readonly score: number
}

const minimums = [25, 50, 75]

function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648
    return state / 2_147_483_648
  }
}

function button(text: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', () => onClick(element))
  return element
}

export function mount(container: HTMLElement): GraphInstance {
  const next = seeded(29)
  const { items: sample, links } = createSample(160, 240, 5, 13, 0.03)
  const items = createCollection(
    localOnlyCollectionOptions({ getKey: (item: Item) => item.id, initialData: sample }),
  )
  items.createIndex((item) => item.id, { indexType: BasicIndex })
  const scores = createCollection(
    localOnlyCollectionOptions({
      getKey: (row: Score) => row.node,
      initialData: sample.map((item) => ({ node: item.id, score: Math.round(next() * 100) })),
    }),
  )

  const matching = (minimum: number) =>
    createLiveQueryCollection({
      getKey: (row) => row.id,
      query: (q) =>
        q
          .from({ item: items })
          .innerJoin({ score: scores }, ({ item, score }) => eq(item.id, score.node))
          .where(({ score }) => gte(score.score, minimum))
          .select(({ item, score }) => ({
            id: item.id,
            label: item.label,
            group: item.group,
            x: item.x,
            y: item.y,
            score: score.score,
          })),
    })

  let minimum = minimums[1] ?? 50
  let shown = matching(minimum)
  const define = () =>
    defineGraph({
      marks: [
        edges<Link>(links, { source: 'from', target: 'to', opacity: 0.5 }),
        nodes(shown, { x: 'x', y: 'y', color: 'group', size: 'score', label: 'label' }),
      ],
      scales: { size: { domain: [0, 100], range: [4, 22] } },
      transitions: { positions: 0 },
    })
  const graph = mountGraph(container, { definition: define(), ariaLabel: messages.graphLabel })

  const status = document.createElement('output')
  status.className = 'example-status'
  const show = () => {
    const count = [...scores.values()].filter((row) => row.score >= minimum).length
    status.textContent = messages.matching(count, sample.length, minimum)
  }
  show()

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.minimum(minimum), (element) => {
      minimum = minimums[(minimums.indexOf(minimum) + 1) % minimums.length] ?? minimum
      element.textContent = messages.minimum(minimum)
      const previous = shown
      shown = matching(minimum)
      graph.update({ definition: define() })
      void previous.cleanup()
      show()
    }),
    button(messages.rescore, () => {
      const keys = sample.filter(() => next() < 0.25).map((item) => item.id)
      scores.update(keys, (drafts) => {
        for (const draft of drafts) draft.score = Math.round(next() * 100)
      })
      show()
    }),
  )
  container.append(actions, status)

  return graph
}
