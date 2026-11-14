import { act, type ReactNode, StrictMode, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { nodes } from '../marks'
import { Graph, type GraphInstance } from '../react'
import { shapes } from '../shapes'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { NodeMark, ShapeGeometry, ShapeMark } from '../types'
import type { ShapeEdit } from './edits'
import { ShapeEditor, useShapeEditor } from './react'

vi.mock('../webgl/renderer', () => ({ createWebglRenderer: () => fakeRenderer() }))

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

interface Zone {
  readonly id: string
  readonly geometry: ShapeGeometry
}

interface Item {
  readonly id: string
}

const zones: Zone[] = [{ id: 'box', geometry: { x: -250, y: -200, width: 100, height: 100 } }]
const items: Item[] = [{ id: 'n' }]
const definition = defineGraph({
  marks: [shapes(zones, { name: 'zones' }), nodes(items, { name: 'items' })],
})

type Marks = ShapeMark<Zone, 'zones'> | NodeMark<Item, 'items'>

let dom: FakeDom
let root: Root
let container: HTMLElement

function render(element: ReactNode): void {
  act(() => {
    root.render(element)
  })
  act(() => {
    dom.flushFrames()
  })
}

function layers(): number {
  return container.querySelectorAll('svg[data-shape-editor]').length
}

function press(type: string, x: number, y: number): void {
  const canvas = container.querySelector('canvas')
  act(() => {
    canvas?.dispatchEvent(
      new PointerEvent(type, {
        clientX: x + 400,
        clientY: y + 300,
        button: 0,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
}

beforeEach(() => {
  dom = installDom()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  dom.restore()
})

describe('<ShapeEditor>', () => {
  it('edits the enclosing graph once under StrictMode, and stops on unmount', () => {
    const edits: ShapeEdit[] = []
    render(
      <StrictMode>
        <Graph definition={definition} ariaLabel="graph" initialView={{ x: 0, y: 0, zoom: 1 }}>
          <ShapeEditor onEdit={(next) => edits.push(...next)} />
        </Graph>
      </StrictMode>,
    )
    expect(layers()).toBe(1)
    expect(container.querySelector('textarea')?.placeholder).toBe('')
    render(
      <StrictMode>
        <Graph definition={definition} ariaLabel="graph" initialView={{ x: 0, y: 0, zoom: 1 }}>
          <ShapeEditor placeholder="Note" onEdit={(next) => edits.push(...next)} />
        </Graph>
      </StrictMode>,
    )
    expect(container.querySelectorAll('textarea')).toHaveLength(1)
    expect(container.querySelector('textarea')?.placeholder).toBe('Note')
    press('pointermove', -200, -150)
    press('pointerdown', -200, -150)
    press('pointermove', -190, -150)
    press('pointermove', -180, -150)
    press('pointerup', -180, -150)
    expect(edits.map((edit) => edit.type)).toEqual(['change'])
    render(
      <StrictMode>
        <Graph definition={definition} ariaLabel="graph" />
      </StrictMode>,
    )
    expect(layers()).toBe(0)
    expect(container.querySelector('textarea')).toBeNull()
  })
})

describe('drawing from React', () => {
  it('takes the tool and the latest key maker from its props', () => {
    const edits: ShapeEdit<Marks>[] = []
    let states: string[] = []
    function Tools({
      tool,
      prefix,
    }: {
      readonly tool: 'select' | 'circle'
      readonly prefix: string
    }) {
      const { state } = useShapeEditor<never, Marks>({
        tool,
        newKey: () => `${prefix}1`,
        onEdit: (next) => edits.push(...next),
      })
      states.push(state.tool)
      return null
    }
    const page = (tool: 'select' | 'circle', prefix: string) => (
      <Graph definition={definition} ariaLabel="graph" initialView={{ x: 0, y: 0, zoom: 1 }}>
        <Tools tool={tool} prefix={prefix} />
      </Graph>
    )
    render(page('select', 'a'))
    expect(states.at(-1)).toBe('select')
    states = []
    render(page('circle', 'b'))
    expect(states.at(-1)).toBe('circle')
    press('pointermove', 0, 0)
    press('pointerdown', 0, 0)
    press('pointermove', 10, 0)
    press('pointermove', 20, 0)
    press('pointerup', 20, 0)
    expect(edits).toMatchObject([
      { type: 'add', key: 'b1', mark: 'zones', geometry: { center: { x: 0, y: 0 }, radius: 20 } },
    ])
  })
})

describe('useShapeEditor', () => {
  it('follows a graph given as an option, and types its edits', () => {
    const seen: string[] = []
    function Panel({ graph }: { readonly graph: GraphInstance<never, Marks> | null }): ReactNode {
      const { state, editor } = useShapeEditor({
        graph,
        marks: ['zones'],
        onEdit: (edits) => {
          for (const edit of edits) {
            if (edit.type !== 'add') expectTypeOf(edit.mark).toEqualTypeOf<'zones' | undefined>()
          }
        },
      })
      seen.push(`${editor === null} ${state.selected.join(',')}`)
      return null
    }
    function Page(): ReactNode {
      const [graph, setGraph] = useState<GraphInstance<never, Marks> | null>(null)
      return (
        <>
          <Graph
            definition={definition}
            ariaLabel="graph"
            initialView={{ x: 0, y: 0, zoom: 1 }}
            ref={setGraph}
          />
          <Panel graph={graph} />
        </>
      )
    }
    render(<Page />)
    expect(layers()).toBe(1)
    press('pointermove', -200, -150)
    press('pointerdown', -200, -150)
    press('pointerup', -200, -150)
    expect(seen.at(-1)).toBe('false box')
    expect(seen[0]).toBe('true ')
  })

  it('refuses unknown mark names at compile time', () => {
    function Wrong(): ReactNode {
      // @ts-expect-error
      useShapeEditor<never, Marks>({ marks: ['items'] })
      return null
    }
    expect(Wrong).toBeTypeOf('function')
  })
})
