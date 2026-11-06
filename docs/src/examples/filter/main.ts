import {
  defineGraph,
  edges,
  type GraphInstance,
  type LiveSource,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { subset } from '@bruno00o/graph/db'
import {
  and,
  type Collection,
  createCollection,
  createLiveQueryCollection,
  eq,
  gte,
  inArray,
  localOnlyCollectionOptions,
  or,
} from '@tanstack/db'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from '../shared/messages'
import { createLinkCollection } from './links'
import '../shared/overlays.css'

const sizes = [50_000, 200_000, 500_000]
const weights = [1, 10, 20, 40, 80]
const groups = ['', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
type Source = 'subset' | 'query'

function button(text: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', () => onClick(element))
  return element
}

export function mount(container: HTMLElement): GraphInstance {
  let size = sizes[0] ?? 50_000
  let minimum = 20
  let group = ''
  let source: Source = 'subset'
  let opened: string[] = []
  let timing = ''
  let loaded = ''

  const status = document.createElement('output')
  status.className = 'example-status'
  const show = () => {
    status.textContent = [timing, loaded].filter(Boolean).join('. ')
  }

  const load = () => {
    const { items, links } = createSample(size, size * 2)
    const people = createCollection(
      localOnlyCollectionOptions({
        id: 'filter-items',
        getKey: (item: Item) => item.id,
        initialData: items,
      }),
    )
    const relations = createLinkCollection(links, () => {
      loaded = messages.linksLoaded(relations.size)
      show()
    })
    return { people, relations }
  }
  let data = load()

  const filtered = (): LiveSource<Item> | Collection<Item, string> => {
    if (source === 'query') {
      return createLiveQueryCollection((q) =>
        q
          .from({ item: data.people })
          .where(({ item }) =>
            group
              ? and(gte(item.weight, minimum), eq(item.group, group))
              : gte(item.weight, minimum),
          ),
      )
    }
    return subset(data.people, (item) =>
      group ? and(gte(item.weight, minimum), eq(item.group, group)) : gte(item.weight, minimum),
    )
  }
  const around = () =>
    opened.length === 0
      ? []
      : [
          edges<Link>(
            subset(data.relations, (link) =>
              or(inArray(link.from, opened), inArray(link.to, opened)),
            ),
            { source: 'from', target: 'to' },
          ),
        ]

  let shown = filtered()
  let linked = around()
  const define = () =>
    defineGraph({
      marks: [
        ...linked,
        nodes<Item>(shown, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
      ],
      interaction: { select: false },
      states: { opened: { stroke: 'var(--graph-ink)', strokeWidth: 2 } },
    })

  const graph = mountGraph(container, { definition: define(), ariaLabel: messages.filterLabel })
  container.append(status)

  const refilter = () => {
    const previous = shown
    let start = performance.now()
    requestAnimationFrame(() => {
      start = performance.now()
    })
    const before = performance.now()
    shown = filtered()
    graph.update({ definition: define() })
    const database = performance.now() - before
    requestAnimationFrame(() => {
      timing = messages.filterTiming(database, performance.now() - start)
      show()
    })
    if ('cleanup' in previous) void previous.cleanup()
  }

  const reopen = (keys: string[]) => {
    opened = keys
    linked = around()
    graph.update({ definition: define() })
    graph.states.set('opened', { nodes: opened })
  }

  graph.on('doubleclick', ({ target }) => {
    if (target?.kind !== 'node' || opened.includes(String(target.key))) return
    reopen([...opened, String(target.key)])
  })

  const weightButton = button(messages.filterWeight(minimum), (element) => {
    minimum = weights.find((value) => value > minimum) ?? weights[0] ?? 1
    element.textContent = messages.filterWeight(minimum)
    refilter()
  })
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    weightButton,
    button(messages.raiseWeight, () => {
      minimum = Math.min(100, minimum + 1)
      weightButton.textContent = messages.filterWeight(minimum)
      refilter()
    }),
    button(messages.filterGroup(messages.allGroups), (element) => {
      group = groups[(groups.indexOf(group) + 1) % groups.length] ?? ''
      element.textContent = messages.filterGroup(group || messages.allGroups)
      refilter()
    }),
    button(messages.filterSource(messages.filterSources[source]), (element) => {
      source = source === 'subset' ? 'query' : 'subset'
      element.textContent = messages.filterSource(messages.filterSources[source])
      refilter()
    }),
    button(messages.unload, () => reopen([])),
    button(messages.nodeCount(size), (element) => {
      size = sizes[(sizes.indexOf(size) + 1) % sizes.length] ?? size
      element.textContent = messages.nodeCount(size)
      const previous = data
      opened = []
      linked = []
      data = load()
      refilter()
      void previous.people.cleanup()
      void previous.relations.cleanup()
      graph.states.clear('opened')
      graph.view.fit(undefined, { duration: 400 })
    }),
  )
  container.append(actions)

  return graph
}
