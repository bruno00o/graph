import { Graph, type GraphInstance } from '@bruno00o/graph/react'
import { type Ref, useEffect, useMemo, useState } from 'react'
import { definitionOf } from './definition'
import { messages } from './messages'
import type { Answer, LayoutRequest } from './worker'
import GraphWorker from './worker?worker'
import '../shared/overlays.css'
import './worker.css'

const seeds = [7, 12, 19, 26]

function isDark(): boolean {
  const { classList } = document.documentElement
  return (
    classList.contains('dark') ||
    (!classList.contains('light') && matchMedia('(prefers-color-scheme: dark)').matches)
  )
}

function useDark(): boolean {
  const [dark, setDark] = useState(isDark)
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDark()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return dark
}

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  const [round, setRound] = useState(0)
  const [answer, setAnswer] = useState<Answer | null>(null)
  const dark = useDark()
  const seed = seeds[round % seeds.length] ?? 0

  useEffect(() => {
    const worker = new GraphWorker()
    worker.onmessage = ({ data }: MessageEvent<Answer>) => setAnswer(data)
    const request: LayoutRequest = { seed, theme: dark ? 'dark' : 'light' }
    worker.postMessage(request)
    return () => worker.terminate()
  }, [seed, dark])

  const shownSeed = answer?.seed
  const definition = useMemo(
    () => (shownSeed === undefined ? null : definitionOf(shownSeed)),
    [shownSeed],
  )
  const waiting = answer === null || answer.seed !== seed

  return (
    <div className="worker">
      <div className="worker-panel">
        <span className="worker-caption">{messages.mounted}</span>
        {answer && definition ? (
          <Graph
            key={answer.seed}
            ref={ref}
            className="example-graph"
            definition={definition}
            ariaLabel={messages.graphLabel}
            initialPositions={answer.positions}
          />
        ) : null}
        <div className="example-actions worker-actions">
          <button
            type="button"
            className="example-button"
            disabled={waiting}
            onClick={() => setRound((value) => value + 1)}
          >
            {messages.another}
          </button>
        </div>
        <output className="example-status">
          {waiting || !answer ? messages.working : messages.done(answer.duration)}
        </output>
      </div>
      <div className="worker-panel worker-preview">
        <span className="worker-caption">{messages.exported}</span>
        {answer ? (
          <img
            alt={messages.previewLabel}
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(answer.svg)}`}
          />
        ) : null}
      </div>
    </div>
  )
}
