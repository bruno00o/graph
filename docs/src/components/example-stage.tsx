import type { GraphInstance } from '@bruno00o/graph'
import { type JSX, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Example, LoadedExample } from '../examples/types'
import { messages } from '../messages'

function VanillaStage({
  mount,
  graphRef,
}: {
  readonly mount: (container: HTMLElement) => GraphInstance
  readonly graphRef: RefObject<GraphInstance | null>
}): JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = host.current
    if (!element) return
    const graph = mount(element)
    graphRef.current = graph
    return () => {
      graph.destroy()
      element.replaceChildren()
      if (graphRef.current === graph) graphRef.current = null
    }
  }, [mount, graphRef])
  return <div ref={host} className="vanilla-host" />
}

export function useVisible<T extends Element>(ref: RefObject<T | null>, enabled = true): boolean {
  const [visible, setVisible] = useState(!enabled)
  useEffect(() => {
    const element = ref.current
    if (!enabled || !element) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, enabled])
  return visible
}

export function ExampleStage({
  example,
  graphRef,
}: {
  readonly example: Example
  readonly graphRef: RefObject<GraphInstance | null>
}): JSX.Element {
  const [loaded, setLoaded] = useState<LoadedExample | null>(null)
  useEffect(() => {
    let live = true
    void document.fonts.ready
      .then(() => example.load())
      .then((module) => {
        if (live) setLoaded(module)
      })
    return () => {
      live = false
    }
  }, [example])
  if (!loaded) {
    return (
      <div className="stage stage-pending" role="status">
        {messages.examples.loading}
      </div>
    )
  }
  return (
    <div className="stage">
      {loaded.kind === 'vanilla' ? (
        <VanillaStage mount={loaded.mount} graphRef={graphRef} />
      ) : (
        <loaded.Example ref={graphRef} />
      )}
    </div>
  )
}
