import {
  type AggregateEdge,
  defineGraph,
  edges,
  type GraphDefinition,
  type GraphEventHandler,
  type GraphInstance,
  type GraphState,
  groups,
  type NodeGroup,
  nodes,
} from '@bruno00o/graph'
import { type LayersDirection, layers } from '@bruno00o/graph/layouts'
import { force } from '@bruno00o/graph/layouts/force'
import { type Influence, type Language, paradigmName, yearTime } from './data'

export type LayoutId = 'layers' | 'force'
export type Direction = Extract<LayersDirection, 'down' | 'right'>
export type Item = Language | NodeGroup<Language>

export type Depth = 1 | 2 | 3 | 'all'

export const layoutIds: readonly LayoutId[] = ['layers', 'force']
export const directions: readonly Direction[] = ['down', 'right']
export const depths: readonly Depth[] = [1, 2, 3, 'all']

export interface DefinitionInput {
  readonly languages: readonly Language[]
  readonly influences: readonly Influence[]
  readonly categories: readonly string[]
  readonly grouped: boolean
  readonly layout: LayoutId
  readonly direction: Direction
}

export const framePadding = { top: 48, right: 48, bottom: 112, left: 48 } as const

export const dimmed = { nodes: 0.12, edges: 0.04 } as const

export function isGroup(item: unknown): item is NodeGroup<Language> {
  return typeof item === 'object' && item !== null && 'data' in item && 'count' in item
}

function groupLabel(group: NodeGroup<Language>): string {
  return `${paradigmName(String(group.value))} (${group.count})`
}

function groupTime(group: NodeGroup<Language>): number | null {
  let first: number | null = null
  for (const language of group.data) {
    const time = yearTime(language)
    if (time !== null && (first === null || time < first)) first = time
  }
  return first
}

function mergedWidth(aggregate: AggregateEdge<Influence>): number {
  return aggregate.count
}

const aggregate = { width: mergedWidth, opacity: 0.7, arrow: 'target' } as const

export function layoutOf(layout: LayoutId, direction: Direction) {
  if (layout === 'force') return force({ edgeLength: 70 })
  return layers({ direction, nodeSpacing: 8, layerSpacing: 48 })
}

export function definitionOf(input: DefinitionInput) {
  const marks = [
    edges(input.influences, {
      name: 'influences',
      source: 'from',
      target: 'to',
      arrow: 'target',
      width: 1,
      opacity: 0.5,
      aggregate,
    }),
    nodes(input.languages, {
      name: 'languages',
      shape: 'box',
      size: 22,
      color: 'main',
      label: 'name',
      time: yearTime,
    }),
    ...(input.grouped
      ? [
          groups(input.languages, {
            by: 'main',
            name: 'paradigms',
            min: 2,
            shape: 'box',
            size: 30,
            color: 'value',
            label: { text: groupLabel, weight: 'bold' },
            time: groupTime,
          }),
        ]
      : []),
  ]
  return defineGraph({
    marks,
    scales: {
      color: { type: 'categorical', domain: input.categories },
      width: { type: 'sqrt', domain: [1, 80], range: [1.5, 9] },
    },
    states: {
      ancestors: {
        nodes: { outline: 'var(--graph-ink)', outlineWidth: 2.5, raise: true },
        edges: { stroke: 'var(--graph-ink)', strokeWidth: 2, raise: true },
      },
      descendants: {
        nodes: { outline: 'var(--graph-accent)', outlineWidth: 2.5, raise: true },
        edges: { stroke: 'var(--graph-accent)', strokeWidth: 2, raise: true },
      },
      lineage: {
        nodes: { others: { opacity: dimmed.nodes } },
        edges: { others: { opacity: dimmed.edges } },
      },
      focus: { others: { opacity: 0.18 } },
      off: { hide: true },
    },
    layout: layoutOf(input.layout, input.direction),
    relayout: true,
    interaction: { select: 'single' },
    view: { padding: framePadding, autoFit: 'layouts' },
  })
}

export type LanguageDefinition = ReturnType<typeof definitionOf>

type Parts<D> = D extends GraphDefinition<infer S, infer M> ? { state: S; mark: M } : never

export type LanguageState = Parts<LanguageDefinition>['state']
export type LanguageMark = Parts<LanguageDefinition>['mark']
export type LanguageGraph = GraphInstance<LanguageState, LanguageMark>
export type LanguageGraphState = GraphState<LanguageState, LanguageMark>
export type LanguageClick = GraphEventHandler<'click', LanguageMark>
