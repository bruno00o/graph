# Live data: a loading overlay and sources of your own

Show your own loading state from `data` and `loadingchange`, and wait for the complete rows with `graph.loaded()`. The graph draws no indicator, and an overlay of your own reads the same store as any other component.

```ts
import { defineGraph, type LiveSource, mountGraph, nodes } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'

type Item = { id: string; label: string }

declare const rows: LiveSource<Item>

const definition = defineGraph({
  marks: [nodes(rows, { label: 'label' })],
  layout: force(),
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Graph of live rows' })

const overlay = document.createElement('p')
overlay.setAttribute('role', 'status')
overlay.textContent = 'Loading'
overlay.hidden = !graph.store.get().data.loading
document.body.append(overlay)

graph.on('loadingchange', ({ loading, failed }) => {
  overlay.hidden = !loading
  if (!loading && failed.length > 0) overlay.textContent = 'Some data could not be loaded'
})

export async function whenComplete() {
  await graph.loaded()
  return graph.count().nodes
}
```

The overlay shows while `data.loading` is `true` and hides on `loadingchange`. `loaded()` resolves also after a failure, so check `failed` before trusting the counts.

## A live source of your own

A live source of your own may report `status` (`'loading'`, `'loadingSubset'` or `'idle'` mean loading, `'error'` or `'crashed'` failed, anything else loaded) and `on('status:change', listener)` returning a stop function. A `status` that stays `'idle'` once loaded counts as loading until it changes. Leave both out when the source has no first load.
