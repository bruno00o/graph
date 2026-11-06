import type { GraphInstance } from '@bruno00o/graph'
import { type JSX, useEffect, useRef, useState } from 'react'
import type { ExampleEntry } from '../examples/registry'
import type { SourceFile } from '../examples/sources'
import { messages } from '../messages'
import { CodeTabs } from './code'
import { ExampleStage } from './example-stage'
import { Icon } from './icon'

const zoomStep = 1.5

export function toggleFullScreen(element: HTMLElement | null): void {
  if (!element) return
  if (document.fullscreenElement === element) void document.exitFullscreen()
  else void element.requestFullscreen?.()
}

export function useFullScreen(element: HTMLElement | null): boolean {
  const [active, setActive] = useState(false)
  useEffect(() => {
    const sync = () => setActive(element !== null && document.fullscreenElement === element)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [element])
  return active
}

export function ExampleFrame({
  example,
  frame,
  onFrame,
}: {
  readonly example: ExampleEntry
  readonly frame: HTMLDivElement | null
  readonly onFrame: (element: HTMLDivElement | null) => void
}): JSX.Element {
  const graph = useRef<GraphInstance | null>(null)
  const [run, setRun] = useState(0)
  const fullScreen = useFullScreen(frame)
  return (
    <div className="frame" ref={onFrame}>
      <div className="frame-bar">
        <span className="small muted">{example.hint}</span>
        <button className="tool" type="button" onClick={() => setRun((value) => value + 1)}>
          <Icon name="restart" />
          {messages.examples.restart}
        </button>
        <span className="tool-sep" aria-hidden="true" />
        <button
          className="tool tool-sq"
          type="button"
          aria-label={messages.examples.zoomIn}
          onClick={() => graph.current?.view.zoomBy(zoomStep, { duration: 200 })}
        >
          <Icon name="plus" />
        </button>
        <button
          className="tool tool-sq"
          type="button"
          aria-label={messages.examples.zoomOut}
          onClick={() => graph.current?.view.zoomBy(1 / zoomStep, { duration: 200 })}
        >
          <Icon name="minus" />
        </button>
        <button
          className="tool tool-sq"
          type="button"
          aria-label={messages.examples.fit}
          onClick={() => graph.current?.view.fit(undefined, { duration: 400 })}
        >
          <Icon name="fit" />
        </button>
        <span className="tool-sep" aria-hidden="true" />
        <button className="tool" type="button" onClick={() => toggleFullScreen(frame)}>
          <Icon name="expand" />
          {fullScreen ? messages.examples.exitFullScreen : messages.examples.fullScreen}
        </button>
      </div>
      <div className="frame-stage sheet">
        <ExampleStage key={run} example={example} graphRef={graph} />
      </div>
    </div>
  )
}

export function ExampleSource({ files }: { readonly files: readonly SourceFile[] }): JSX.Element {
  return (
    <CodeTabs
      files={files.map((file) => ({ label: file.name, code: file.code, language: file.language }))}
    />
  )
}
