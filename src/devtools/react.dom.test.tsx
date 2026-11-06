import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { graphReports } from './inspector'
import { GraphDevtoolsPanel, graphDevtoolsPlugin } from './react'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let dom: FakeDom
let graph: GraphInstance
let root: Root
let container: HTMLElement

beforeEach(() => {
  dom = installDom()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const element = document.createElement('div')
  document.body.append(element)
  graph = createGraphHost(
    element,
    {
      definition: defineGraph({ marks: [nodes([{ id: 'a', x: 0, y: 0 }], { x: 'x', y: 'y' })] }),
      ariaLabel: 'graphe',
    },
    fakeRenderer,
  )
  dom.flushFrames()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  graph.destroy()
  vi.useRealTimers()
  dom.restore()
})

describe('GraphDevtoolsPanel', () => {
  it('mounts the panel with the theme it is given', () => {
    act(() =>
      root.render(
        <StrictMode>
          <GraphDevtoolsPanel theme="light" messages={{ nodes: 'Nœuds' }} />
        </StrictMode>,
      ),
    )
    expect(container.querySelectorAll('.graph-devtools')).toHaveLength(1)
    expect(container.querySelector('.graph-devtools')?.getAttribute('data-theme')).toBe('light')
    expect(container.textContent).toContain('Nœuds')
    expect(graphReports()).toHaveLength(1)
  })

  it('stops measuring once unmounted', () => {
    act(() =>
      root.render(
        <StrictMode>
          <GraphDevtoolsPanel />
        </StrictMode>,
      ),
    )
    expect(graphReports()).toHaveLength(1)
    act(() => root.render(null))
    expect(graphReports()).toEqual([])
  })
})

describe('graphDevtoolsPlugin', () => {
  it('renders the panel inside TanStack Devtools', () => {
    const plugin = graphDevtoolsPlugin({ messages: { title: 'Graphe' } })
    expect(plugin).toMatchObject({ id: 'bruno00o-graph', name: 'Graphe' })
    const slot = document.createElement('div')
    act(() => root.render(plugin.render(slot, { theme: 'dark', devtoolsOpen: true })))
    expect(container.querySelector('.graph-devtools')?.getAttribute('data-theme')).toBe('dark')
  })
})
