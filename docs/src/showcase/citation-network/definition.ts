import {
  defineGraph,
  edges,
  type GraphDefinition,
  type GraphInstance,
  type GraphState,
  nodes,
} from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { type Link, type Work, yearTime } from './data'

const dimmed = { nodes: 0.08, edges: 0.03 } as const

export type Depth = 1 | 2

export const depths: readonly Depth[] = [1, 2]

export const framePadding = { top: 48, right: 48, bottom: 104, left: 48 } as const

const nodeLabel = { text: 'title', maxWidth: 180 } as const

const linkStyle = { name: 'cites', width: 1, opacity: 0.12 } as const

const workStyle = { name: 'works', size: 'incoming' as const } as const

export function workYear(work: Work): number | null {
  return work.year
}

export function linkArrowFactory(
  arrows: ReadonlySet<string>,
): (link: Link) => 'none' | 'target' | 'source' | 'both' {
  return (link) => {
    const out = arrows.has(`${link.id}>out`)
    const back = arrows.has(`${link.id}>in`)
    if (out && back) return 'both'
    if (out) return 'target'
    if (back) return 'source'
    return 'none'
  }
}

export interface DefinitionInput {
  readonly works: readonly Work[]
  readonly links: readonly Link[]
  readonly maxIncoming: number
  readonly firstYear: number
  readonly lastYear: number
  readonly arrows: ReadonlySet<string> | null
}

export function definitionOf(input: DefinitionInput) {
  const arrow = input.arrows ? linkArrowFactory(input.arrows) : 'none'
  return defineGraph({
    marks: [
      edges(input.links, {
        ...linkStyle,
        source: 'from',
        target: 'to',
        ...(input.arrows ? { arrow } : {}),
      }),
      nodes(input.works, {
        ...workStyle,
        color: workYear,
        label: nodeLabel,
        time: yearTime,
      }),
    ],
    scales: {
      size: {
        type: 'sqrt',
        domain: input.maxIncoming > 0 ? [0, input.maxIncoming] : [0, 1],
        range: [2, 16],
      },
      color: { type: 'sequential', domain: [input.firstYear, input.lastYear] },
    },
    states: {
      outgoing: {
        nodes: { outline: 'var(--graph-ink)', outlineWidth: 2, raise: true },
        edges: { stroke: 'var(--graph-ink)', strokeWidth: 1.5, raise: true },
      },
      incoming: {
        nodes: { outline: 'var(--graph-accent)', outlineWidth: 2, raise: true },
        edges: { stroke: 'var(--graph-accent)', strokeWidth: 1.5, raise: true },
      },
      path: {
        nodes: { outline: 'var(--graph-ink)', outlineWidth: 2.5, raise: true },
        edges: {
          stroke: 'var(--graph-ink)',
          strokeWidth: 2.5,
          flow: true,
          label: true,
          raise: true,
        },
      },
      focus: {
        nodes: { others: { opacity: dimmed.nodes } },
        edges: { others: { opacity: dimmed.edges } },
      },
    },
    layout: force({ edgeLength: 40 }),
    relayout: true,
    interaction: { select: 'single' },
    view: { padding: framePadding, autoFit: 'layouts' },
  })
}

export type WorkDefinition = ReturnType<typeof definitionOf>

type Parts<D> = D extends GraphDefinition<infer S, infer M> ? { state: S; mark: M } : never

export type WorkState = Parts<WorkDefinition>['state']
export type WorkMark = Parts<WorkDefinition>['mark']
export type WorkGraph = GraphInstance<WorkState, WorkMark>
export type WorkGraphState = GraphState<WorkState, WorkMark>
