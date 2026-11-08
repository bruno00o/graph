import type { GraphInstance, Key } from '@bruno00o/graph'
import { type JSX, type Ref, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type Language, loadNetwork, type Network } from './data'
import {
  type Depth,
  type Direction,
  definitionOf,
  framePadding,
  type LanguageGraph,
  type LayoutId,
  layoutOf,
} from './definition'
import { messages } from './messages'
import { Panel } from './panel'
import { scopeOf } from './scope'
import { Stage } from './stage'
import { Tooltip } from './tooltip'
import { liftToGroups, lineageOf } from './trace'
import './language-influences.css'

const startKey = 'Q575650'
const framing = { padding: framePadding, maxZoom: 1.4 } as const

function assign(ref: Ref<GraphInstance | null>, value: GraphInstance | null): void {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

export function App({ ref }: { readonly ref: Ref<GraphInstance | null> }): JSX.Element {
  const [network, setNetwork] = useState<Network | null>(null)
  const [failed, setFailed] = useState(false)
  const [layout, setLayout] = useState<LayoutId>('layers')
  const [direction, setDirection] = useState<Direction>('right')
  const [grouped, setGrouped] = useState(false)
  const [alone, setAlone] = useState(true)
  const [depth, setDepth] = useState<Depth>(1)
  const [selected, setSelected] = useState<string | null>(null)
  const [counts, setCounts] = useState<{ before: number; after: number } | null>(null)
  const [graph, setGraph] = useState<LanguageGraph | null>(null)
  const reflowed = useRef<string | null>(null)

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
        setSelected((current) => current ?? (loaded.byId.has(startKey) ? startKey : null))
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

  const scope = useMemo(
    () => (network && alone && selected ? scopeOf(network, selected, depth) : null),
    [network, alone, selected, depth],
  )
  const scopeKey = scope ? `${selected}:${depth}` : 'all'

  const definition = useMemo(
    () =>
      definitionOf({
        languages: scope?.languages ?? network?.languages ?? [],
        influences: scope?.influences ?? network?.influences ?? [],
        categories: network?.categories ?? [],
        grouped,
        layout,
        direction,
      }),
    [network, scope, grouped, layout, direction],
  )

  const report = useCallback(
    (instance: LanguageGraph | null) => {
      setGraph(instance)
      assign(ref, instance)
    },
    [ref],
  )

  useEffect(() => {
    if (!graph || !network) return
    return graph.on('selectionchange', ({ selection }) => {
      const key = selection.nodes[0]
      if (typeof key === 'string' && network.byId.has(key)) setSelected(key)
      else if (key === undefined) setSelected(null)
    })
  }, [graph, network])

  useEffect(() => {
    if (!graph) return
    const current = graph.selection.get().nodes
    if (selected === null) {
      if (current.length > 0) graph.selection.clear()
    } else if (current[0] !== selected) {
      graph.selection.set({ nodes: [selected] })
    }
  }, [graph, selected])

  useEffect(() => {
    if (!graph || !grouped || !alone || selected === null) return
    const group = graph.groups.parent(selected)
    if (group !== undefined && graph.groups.isFolded(group)) graph.groups.unfold([group])
  }, [graph, grouped, alone, selected])

  useEffect(() => {
    if (!graph) return
    const apply = () => {
      if (selected === null) {
        graph.states.clear('ancestors')
        graph.states.clear('descendants')
        graph.states.clear('lineage')
        setCounts(null)
        return
      }
      const trace = lineageOf(graph, selected, depth)
      const nodes = (keys: readonly Key[]) => (grouped ? liftToGroups(graph, keys) : [...keys])
      graph.states.set('ancestors', {
        nodes: nodes(trace.before.nodes.slice(1)),
        edges: trace.before.edges,
      })
      graph.states.set('descendants', {
        nodes: nodes(trace.after.nodes.slice(1)),
        edges: trace.after.edges,
      })
      graph.states.set('lineage', {
        nodes: nodes([...trace.before.nodes, ...trace.after.nodes]),
        edges: [...trace.before.edges, ...trace.after.edges],
      })
      const before = trace.before.nodes.length - 1
      const after = trace.after.nodes.length - 1
      setCounts((last) =>
        last?.before === before && last.after === after ? last : { before, after },
      )
    }
    apply()
    return graph.on('foldchange', apply)
  }, [graph, selected, depth, grouped])

  const arrangement = `${scopeKey}:${grouped}:${layout}:${direction}`
  useEffect(() => {
    if (!graph) {
      reflowed.current = null
      return
    }
    const previous = reflowed.current
    reflowed.current = arrangement
    if (previous === null || previous === arrangement) return
    graph.layout.run(layoutOf(layout, direction), { fit: framing }).catch(() => {})
  }, [graph, arrangement, layout, direction])

  const frameAfterLayout = useCallback(() => {
    if (!graph) return
    const stop = graph.on('layoutend', () => {
      stop()
      graph.view.fit({ ...framing, duration: 500 })
    })
  }, [graph])

  const pick = useCallback(
    (language: Language) => {
      setSelected(language.id)
      if (!graph || alone) return
      const ancestors: Key[] = []
      for (
        let key = graph.groups.parent(language.id);
        key !== undefined;
        key = graph.groups.parent(key)
      ) {
        if (graph.groups.isFolded(key)) ancestors.push(key)
      }
      const frame = () => {
        const trace = lineageOf(graph, language.id, depth)
        graph.view.fit({
          nodes: liftToGroups(graph, [...trace.before.nodes, ...trace.after.nodes]),
          padding: { ...framePadding, top: 90, left: 90, right: 90 },
          maxZoom: 1.6,
          duration: 700,
        })
      }
      if (ancestors.length === 0) {
        frame()
        return
      }
      const stop = graph.on('layoutend', () => {
        stop()
        frame()
      })
      graph.groups.unfold(ancestors)
    },
    [graph, alone, depth],
  )

  const clear = useCallback(() => setSelected(null), [])

  const label = network
    ? messages.graphLabel(network.languages.length, network.influences.length)
    : ''
  const current = selected && network ? (network.byId.get(selected) ?? null) : null

  return (
    <div className="lang-app">
      <Panel
        network={network}
        graph={graph}
        layout={layout}
        onLayout={setLayout}
        direction={direction}
        onDirection={setDirection}
        grouped={grouped}
        onGrouped={setGrouped}
        alone={alone}
        onAlone={setAlone}
        depth={depth}
        onDepth={setDepth}
        selected={current}
        lineage={counts}
        shown={
          scope ? { languages: scope.languages.length, influences: scope.influences.length } : null
        }
        onPick={pick}
        onClear={clear}
        onFold={(folded) => {
          frameAfterLayout()
          if (folded) graph?.groups.fold()
          else graph?.groups.unfold()
        }}
      />
      <div className="lang-stage">
        {network ? (
          <Stage definition={definition} label={label} report={report}>
            <Tooltip network={network} />
          </Stage>
        ) : (
          <div className="lang-loading" role="status">
            {failed ? (
              <>
                <span>{messages.failed}</span>
                <button className="lang-button" type="button" onClick={load}>
                  {messages.retry}
                </button>
              </>
            ) : (
              messages.loading
            )}
          </div>
        )}
        {network ? (
          <div className="lang-tools">
            <button
              className="lang-button lang-button-small"
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
