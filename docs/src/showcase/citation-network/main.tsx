import type { GraphInstance, GraphReach, Key } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import {
  type JSX,
  type Ref,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { loadNetwork, type Network, type Work } from './data'
import { type Depth, definitionOf, framePadding, type WorkGraph } from './definition'
import { messages } from './messages'
import { Panel } from './panel'
import { Stage } from './stage'
import { Tooltip } from './tooltip'
import './citation-network.css'

type Mode = 'trace' | 'path'

interface Trace {
  readonly outgoing: GraphReach
  readonly incoming: GraphReach
}

interface TracedPath {
  readonly from: string | null
  readonly to: string | null
  readonly nodes: readonly string[] | null
  readonly edges: readonly string[]
  readonly pending: boolean
}

interface LayoutRunState {
  readonly running: boolean
  readonly completed: boolean | null
  readonly duration: number | null
}

type Placement = readonly [string, { readonly x: number; readonly y: number }]
type Placements = readonly Placement[]

const framing = { padding: framePadding, maxZoom: 1.6 } as const

const emptyPath: TracedPath = { from: null, to: null, nodes: null, edges: [], pending: false }

const idleLayout: LayoutRunState = { running: false, completed: null, duration: null }

function assign(ref: Ref<GraphInstance | null>, value: GraphInstance | null): void {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

function arrowKeys(reach: GraphReach, suffix: string): Set<string> {
  return new Set(reach.edges.map((edge) => `${edge}${suffix}`))
}

export function App({ ref }: { readonly ref: Ref<GraphInstance | null> }): JSX.Element {
  const [network, setNetwork] = useState<Network | null>(null)
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [depth, setDepth] = useState<Depth>(1)
  const [mode, setMode] = useState<Mode>('trace')
  const [trace, setTrace] = useState<Trace | null>(null)
  const [path, setPath] = useState<TracedPath>(emptyPath)
  const [counted, setCounted] = useState<{ outgoing: number; incoming: number } | null>(null)
  const [graph, setGraph] = useState<WorkGraph | null>(null)
  const [layout, setLayout] = useState<LayoutRunState>(idleLayout)

  const loading = useRef(0)
  const load = useCallback(() => {
    loading.current += 1
    const run = loading.current
    setNetwork(null)
    setFailed(false)
    loadNetwork().then(
      (loaded) => {
        if (run !== loading.current) return
        setNetwork(loaded)
        setSelected(null)
      },
      () => {
        if (run === loading.current) setFailed(true)
      },
    )
  }, [])

  useEffect(() => {
    load()
    return () => {
      loading.current += 1
    }
  }, [load])

  const report = useCallback(
    (instance: WorkGraph | null) => {
      setGraph(instance)
      assign(ref, instance)
    },
    [ref],
  )

  const placements = useMemo<Placements>(() => {
    if (!network) return []
    const placed: Placement[] = []
    for (const work of network.works) {
      if (work.x === null || work.y === null) continue
      placed.push([work.id, { x: work.x, y: work.y }])
    }
    return placed
  }, [network])

  const placedOn = useRef<Network | null>(null)
  useLayoutEffect(() => {
    if (!graph || !network || placements.length === 0 || placedOn.current === network) return
    placedOn.current = network
    graph.positions.set(placements, { duration: 0 })
    graph.view.fit({ padding: framePadding, duration: 0 })
  }, [graph, network, placements])

  const runForces = useCallback(() => {
    if (!graph || layout.running) return
    setLayout({ running: true, completed: null, duration: null })
    const startedAt = performance.now()
    void graph.layout.run(force({ edgeLength: 40 }), { fit: true }).then((completed) => {
      setLayout({ running: false, completed, duration: performance.now() - startedAt })
    })
  }, [graph, layout.running])

  const restore = useCallback(() => {
    if (!graph || layout.running || placements.length === 0) return
    graph.positions.set(placements, { duration: 700 })
  }, [graph, placements, layout.running])

  useEffect(() => {
    if (!graph || !network) return
    return graph.on('selectionchange', ({ selection }) => {
      const key = selection.nodes[0]
      if (typeof key === 'string' && network.byId.has(key)) {
        setSelected(key)
        setMode('trace')
      } else if (key === undefined) {
        setSelected(null)
      }
    })
  }, [graph, network])

  const arrows = useMemo(() => {
    if (mode !== 'trace' || !trace) return null
    const keys = new Set<string>([
      ...arrowKeys(trace.outgoing, '>out'),
      ...arrowKeys(trace.incoming, '>in'),
    ])
    if (keys.size === 0) return null
    return keys
  }, [mode, trace])

  const definition = useMemo(
    () =>
      definitionOf({
        works: network?.works ?? [],
        links: network?.links ?? [],
        maxIncoming: network?.maxIncoming ?? 1,
        firstYear: network?.firstYear ?? 1900,
        lastYear: network?.lastYear ?? 2026,
        arrows,
      }),
    [network, arrows],
  )

  useEffect(() => {
    if (!graph || !network) {
      setTrace(null)
      setCounted(null)
      return
    }
    if (mode === 'trace' && selected) {
      const outgoing = graph.paths.reach(selected, { direction: 'forward', maxCost: depth })
      const incoming = graph.paths.reach(selected, { direction: 'backward', maxCost: depth })
      setTrace({ outgoing, incoming })
      setCounted({ outgoing: outgoing.nodes.length - 1, incoming: incoming.nodes.length - 1 })
      graph.states.clear('path')
      graph.states.set('outgoing', { nodes: outgoing.nodes.slice(1), edges: outgoing.edges })
      graph.states.set('incoming', { nodes: incoming.nodes.slice(1), edges: incoming.edges })
      graph.states.set('focus', {
        nodes: [...outgoing.nodes, ...incoming.nodes],
        edges: [...incoming.edges, ...outgoing.edges],
      })
      return
    }
    if (mode === 'path' && !path.pending && path.from !== null && path.nodes !== null) {
      const inside = new Set<Key>(path.nodes)
      setTrace(null)
      setCounted(null)
      graph.states.clear('outgoing')
      graph.states.clear('incoming')
      graph.states.set('path', { nodes: path.nodes, edges: path.edges })
      graph.states.set('focus', { nodes: path.nodes, edges: path.edges })
      if (inside.size === 0) graph.states.clear('focus')
      return
    }
    graph.states.clear('outgoing')
    graph.states.clear('incoming')
    graph.states.clear('path')
    graph.states.clear('focus')
    setTrace(null)
    setCounted(null)
  }, [graph, network, mode, selected, depth, path])

  useEffect(() => {
    if (!graph || mode !== 'path' || !path.pending) return
    if (path.from === null || path.to === null) return
    const { from, to } = path
    const found = graph.paths.shortest(from, to, { direction: 'both' })
    setPath((current) =>
      current.from === from && current.to === to
        ? {
            from,
            to,
            nodes: found ? found.nodes.map(String) : null,
            edges: found ? found.edges.map(String) : [],
            pending: false,
          }
        : current,
    )
  }, [graph, mode, path])

  useEffect(() => {
    if (!graph || !selected || mode !== 'trace') return
    graph.view.fit({ nodes: [selected], ...framing, duration: 500 })
  }, [graph, selected, mode])

  useEffect(() => {
    if (!graph || mode !== 'path' || path.pending || path.nodes === null) return
    if (path.nodes.length === 0) return
    graph.view.fit({ nodes: path.nodes, ...framing, duration: 700 })
  }, [graph, mode, path])

  const pick = useCallback(
    (work: Work) => {
      graph?.selection.set({ nodes: [work.id] })
      setSelected(work.id)
      setMode('trace')
    },
    [graph],
  )

  const query = useCallback((side: 'from' | 'to', work: Work) => {
    setMode('path')
    setPath((current) => ({
      from: side === 'from' ? work.id : current.from,
      to: side === 'to' ? work.id : current.to,
      nodes: null,
      edges: [],
      pending: true,
    }))
  }, [])

  const clear = useCallback(() => {
    setSelected(null)
    setMode('trace')
    setPath(emptyPath)
    setTrace(null)
    setCounted(null)
    graph?.selection.clear()
  }, [graph])

  const label = network ? messages.graphLabel(network.works.length, network.links.length) : ''
  const current = selected && network ? (network.byId.get(selected) ?? null) : null

  return (
    <div className="cite-app">
      <Panel
        network={network}
        graph={graph}
        depth={depth}
        onDepth={setDepth}
        selected={current}
        neighborhood={counted}
        layout={layout}
        onLayout={runForces}
        onRestore={restore}
        path={{
          from: path.from,
          to: path.to,
          nodes: path.nodes,
          pending: path.pending,
        }}
        onPick={pick}
        onQuery={query}
        onClear={clear}
      />
      <div className="cite-stage">
        {network ? (
          <Stage definition={definition} label={label} report={report}>
            <Tooltip />
          </Stage>
        ) : (
          <div className="cite-loading" role="status">
            {failed ? (
              <>
                <span>{messages.failed}</span>
                <button className="cite-button" type="button" onClick={load}>
                  {messages.retry}
                </button>
              </>
            ) : (
              messages.loading
            )}
          </div>
        )}
        {network ? (
          <div className="cite-tools">
            <button
              className="cite-button cite-button-small"
              type="button"
              onClick={() => graph?.view.fit({ padding: framePadding, duration: 500 })}
            >
              {messages.actions.fit}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
