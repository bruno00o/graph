import { act, type ReactNode, StrictMode, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { Anchor, Graph, type GraphInstance } from './index'

vi.mock('../webgl/renderer', () => ({ createWebglRenderer: () => fakeRenderer() }))

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const definition = defineGraph({
  marks: [
    nodes(
      [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 100, y: 0 },
      ],
      { x: 'x', y: 'y' },
    ),
  ],
})

let dom: FakeDom
let root: Root
let container: HTMLElement
let graph: GraphInstance | null = null
let renders = 0

function Content({ text }: { readonly text: string }) {
  renders++
  return <span className="content">{text}</span>
}

function Pinned({ initial }: { readonly initial: string }) {
  const [key, setKey] = useState(initial)
  return (
    <Graph
      definition={definition}
      ariaLabel="graph"
      initialView={{ x: 0, y: 0, zoom: 1 }}
      ref={(instance) => {
        graph = instance
      }}
    >
      <Anchor node={key} side="bottom">
        <Content text={key} />
      </Anchor>
      <button type="button" onClick={() => setKey('b')} />
    </Graph>
  )
}

function Doubled() {
  return (
    <Graph definition={definition} ariaLabel="graph" initialView={{ x: 0, y: 0, zoom: 1 }}>
      {/* @ts-expect-error */}
      <Anchor node="a" point={{ x: 100, y: 0 }} side="bottom" align={undefined}>
        <Content text="a" />
      </Anchor>
    </Graph>
  )
}

function render(element: ReactNode): void {
  act(() => {
    root.render(element)
  })
  act(() => {
    dom.flushFrames()
  })
}

beforeEach(() => {
  dom = installDom()
  renders = 0
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  dom.restore()
})

describe('<Anchor>', () => {
  it('renders its children into the anchor layer once under StrictMode', () => {
    render(
      <StrictMode>
        <Pinned initial="a" />
      </StrictMode>,
    )
    const content = container.querySelectorAll('.content')
    expect(content).toHaveLength(1)
    const wrapper = content[0]?.parentElement?.parentElement
    expect(wrapper?.hasAttribute('data-graph-anchor')).toBe(true)
    expect(wrapper?.style.transform).toBe('translate(400px,312px)')
  })

  it('follows the view without rendering again, and moves when its props change', () => {
    render(<Pinned initial="a" />)
    const count = renders
    act(() => {
      graph?.view.set({ x: -50, y: 0, zoom: 1 })
      dom.flushFrames()
    })
    expect(renders).toBe(count)
    const wrapper = container.querySelector('.content')?.parentElement?.parentElement
    expect(wrapper?.style.transform).toBe('translate(450px,312px)')
    act(() => {
      container.querySelector('button')?.click()
    })
    act(() => {
      dom.flushFrames()
    })
    expect(wrapper?.style.transform).toBe('translate(550px,312px)')
    expect(container.querySelector('.content')?.textContent).toBe('b')
  })

  it('takes a single target in its props, and keeps the node when given more', () => {
    render(<Doubled />)
    const wrapper = container.querySelector('.content')?.parentElement?.parentElement
    expect(wrapper?.style.transform).toBe('translate(400px,312px)')
  })

  it('leaves the graph when unmounted', () => {
    render(<Pinned initial="a" />)
    act(() => {
      root.render(null)
    })
    expect(container.querySelector('.content')).toBeNull()
  })
})
