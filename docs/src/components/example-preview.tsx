import type { GraphInstance } from '@bruno00o/graph'
import { type JSX, useRef } from 'react'
import type { ExampleEntry } from '../examples/registry'
import { ExampleStage, useVisible } from './example-stage'

export function ExamplePreview({ example }: { readonly example: ExampleEntry }): JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const graph = useRef<GraphInstance | null>(null)
  const visible = useVisible(box)
  return (
    <div ref={box} className="thumb sheet" inert aria-hidden="true">
      {visible ? <ExampleStage example={example} graphRef={graph} /> : null}
    </div>
  )
}
