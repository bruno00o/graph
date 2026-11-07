import Link from 'fumadocs-core/link'
import { type JSX, useState } from 'react'
import { findExample } from '../examples/catalog'
import { messages } from '../messages'
import { ExampleFrame } from './example-frame'

export function LiveExample({
  slug,
  caption = true,
}: {
  readonly slug: string
  readonly caption?: boolean
}): JSX.Element | null {
  const [frame, setFrame] = useState<HTMLDivElement | null>(null)
  const example = findExample(slug)
  if (!example) return null
  return (
    <figure className="live-example not-prose">
      <ExampleFrame example={example} frame={frame} onFrame={setFrame} />
      {caption ? (
        <figcaption className="live-caption">
          {example.description}{' '}
          <Link className="ulink" href={`/examples/${example.slug}`}>
            {messages.examples.readSource}
          </Link>
        </figcaption>
      ) : null}
    </figure>
  )
}
