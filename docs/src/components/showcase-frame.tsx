import type { GraphInstance } from '@bruno00o/graph'
import { type JSX, useEffect, useRef, useState } from 'react'
import { messages } from '../messages'
import type { Showcase, ShowcaseApp } from '../showcase/types'
import { toggleFullScreen, useFullScreen } from './example-frame'
import { Icon } from './icon'

export function ShowcaseFrame({
  showcase,
  frame,
  onFrame,
}: {
  readonly showcase: Showcase
  readonly frame: HTMLDivElement | null
  readonly onFrame: (element: HTMLDivElement | null) => void
}): JSX.Element {
  const graph = useRef<GraphInstance | null>(null)
  const [App, setApp] = useState<ShowcaseApp | null>(null)
  const fullScreen = useFullScreen(frame)
  useEffect(() => {
    Object.defineProperty(window, 'graph', { configurable: true, get: () => graph.current })
    return () => {
      Reflect.deleteProperty(window, 'graph')
    }
  }, [])
  useEffect(() => {
    let live = true
    void document.fonts.ready
      .then(() => showcase.load())
      .then((loaded) => {
        if (live) setApp(() => loaded)
      })
    return () => {
      live = false
    }
  }, [showcase])
  return (
    <div className="frame showcase-frame" ref={onFrame}>
      <div className="frame-bar">
        <span className="small muted">{showcase.title}</span>
        <button className="tool" type="button" onClick={() => toggleFullScreen(frame)}>
          <Icon name="expand" />
          {fullScreen ? messages.examples.exitFullScreen : messages.examples.fullScreen}
        </button>
      </div>
      <div className="showcase-stage">
        {App ? (
          <App ref={graph} />
        ) : (
          <div className="stage stage-pending" role="status">
            {messages.showcase.loading}
          </div>
        )}
      </div>
    </div>
  )
}
