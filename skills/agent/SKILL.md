---
name: agent
description: >
  Use when a coding agent needs to see or drive a @bruno00o/graph graph in a
  running app: setting up the graphAgent() Vite plugin, the client line of a
  TanStack Start app, running the graph-agent command (tabs, graphs, snapshot,
  query, act, image, errors, changes), reading what a graph draws (elements on
  screen, labels drawn and why others hide, looks, states, degree), acting on
  it to check a change, and createGraphAgent in a test or a script; and finding
  why no page is connected, an element is missing or a step fails.
metadata:
  purpose: >
    The agent bridge of @bruno00o/graph/agent: the Vite plugin and its relay,
    the client of the dev server, the graph-agent command, snapshot, query, act
    and subscribe, what the bridge sees and does not see, its security, and the
    mistakes that leave an agent blind or acting on the wrong element.
  type: sub-skill
  library: '@bruno00o/graph'
sources:
  - src/agent/index.ts
  - src/agent/types.ts
  - src/agent/agent.ts
  - src/agent/act.ts
  - src/agent/query.ts
  - src/agent/read.ts
  - src/agent/dev.ts
  - src/agent/vite.ts
  - src/agent/cli.ts
  - docs/content/docs/(guide)/agent.mdx
  - docs/content/docs/api/agent.mdx
  - docs/content/docs/api/agent-vite.mdx
requires:
  - core
---

# See and drive a graph from a coding agent

Load the core skill first (`intent load @bruno00o/graph#core`): marks, keys, states and the instance API are the same. The agent bridge lets you, the coding agent, ask the running app what a graph draws, as JSON, and act on it to check a change: select, fit, fold, set a state, run a layout. It runs in development only, through the dev server of Vite, and it is experimental: a minor version may change it.

Use it to check a change you made to a graph before telling the user it works: that the nodes show, the labels are drawn, the colors are right, a state applies, a layout settles. Read the code for the rules; ask the bridge for what the page draws.

## Setup

1. Add the plugin to the Vite config (Vite 7 or 8). It applies to `vite dev` only.

   ```ts
   import { graphAgent } from '@bruno00o/graph/agent/vite'
   import { defineConfig } from 'vite'

   export default defineConfig({
     plugins: [graphAgent()],
   })
   ```

2. Start the dev server, and ask the user to open the app in a browser on a page with a graph. The plugin writes `.graph-agent/server.json`; the command finds it in the current folder or above.
3. Check the connection.

   ```sh
   npx graph-agent tabs
   npx graph-agent graphs
   ```

With pnpm, run `pnpm exec graph-agent`. The output is JSON on one line (`--pretty` indents it). Exit code 0 is success, 1 is a refusal from the page with `error` and sometimes `candidates`, 2 is no server.

In a TanStack Start app, or any app whose `tabs` stays empty while a page is open, import the client from the entry point of the browser, `src/client.tsx` in Start. The condition keeps it out of the server and of builds:

```tsx no-check
if (import.meta.env.DEV && !import.meta.env.SSR) import('@bruno00o/graph/agent/dev')
```

## Core Patterns

### Read, find, act, read again

```sh
npx graph-agent snapshot
npx graph-agent query delta --kind node
npx graph-agent act select n12 then fit selection
npx graph-agent snapshot --limit 10
npx graph-agent image
```

- `snapshot` waits for the graph to settle, then gives the graph, the view, the selection, focus and hover, the members of each state, the hidden layers, the time window, the folded groups, the layout, the problems in the data, and the first 50 elements on screen: raised elements first, then the largest nodes and widest edges. Past the limit, the last item is `{ "more": n }`.
- `query` finds elements by text (labels and keys, without case or accents, prefixes first), `--kind node|edge|shape|group`, `--within view|shown|selection|<state>|<layer>|<group key>`, `--near <key> --depth <n>`, 50 at a time from `--from`.
- `act` runs steps in order, stops at the first that fails, waits for the graph to settle and tells what changed: `selection`, `view`, `folded`, `time`, `hiddenLayers`, `states`, and the counts of elements that appeared and disappeared.
- `image` writes a PNG of the graph to `.graph-agent/` and prints its path: open it to look at the result.
- `errors` gives the last errors of the page, `changes [--since <n>]` the changes made by people, code and agents.

A step is an action, its targets, then its arguments as `name=value`. Targets: a key, a label that names one node, `node:<key>`, `edge:<key>`, `shape:<key>`, `group:<name>=<value>`, `selection` or `all`.

| Action | Target | Arguments |
| --- | --- | --- |
| `select`, `addToSelection`, `clearSelection` | elements | |
| `focus` | one node | |
| `fit` | elements, or none for the whole graph | `maxZoom` (2), `padding`, `duration` |
| `zoom`, `pan`, `setView` | | `by`; `x`, `y` in pixels; `x`, `y`, `zoom` |
| `fold`, `unfold`, `toggleFold` | groups | |
| `hideLayer`, `showLayer` | layer names | |
| `setTime`, `clearTime` | | `start`, `end` (ISO dates, ms, `null`) |
| `setState`, `clearState` | elements | `name` of a declared state |
| `path` | two nodes | `direction`, `weight`, `visible`, `state` |
| `runLayout` | nodes, or none | `fit`, `duration` |
| `move`, `resetPositions` | one node; nodes | `x`, `y` world, or `dx`, `dy` pixels |

Every step moves at once (`duration` 0) unless it asks for a `duration`. Moves made by `act` reach `viewchange` and `positionchange` with the origin `'agent'`.

### Read an element

```json
{
  "kind": "node",
  "key": "n12",
  "label": "Delta",
  "labelShown": false,
  "labelHidden": "overlap",
  "screen": [412.5, 233],
  "size": 18,
  "look": { "fill": "#2769b7", "stroke": "#f7f7f4", "opacity": 1 },
  "states": ["selected"],
  "degree": 4
}
```

- `screen` is in CSS pixels from the top left of the canvas, `size` the diameter drawn.
- `look` holds the colors resolved for the element, states applied, as hex; `dimmed` is there when a state lowers its opacity, as the `others` of a state does.
- `labelShown` says whether the label is drawn; `labelHidden` says why not: `state` (a state hides it), `too-small` (under 8 pixels on screen), `node-too-small` (the node is under `minScreenSize`), `off-screen`, `overlap` (an earlier label holds the place), `edge-too-short`, `limit` (the view holds its most labels). `labelDrawn` is the text drawn when it differs from the label, cut by `maxWidth`. `view.labelsDrawn` counts the labels drawn.
- `degree` is the degree drawn: an edge merged with others counts once, the edges of a folded group count on the group.
- A group node of `groups()` has a key written `{ "group": { "name", "value", "parent" } }`; pass it back as is, or as `group:<name>=<value>` to the command.
- `data` holds up to six text, number or boolean fields of the item, cut at 60 characters.

### In a test or a script

`createGraphAgent` is the bridge without the dev server. It takes any graph, also one from `createGraph` (headless skill), and gives the same snapshot, query and act.

```ts
import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { createGraphAgent } from '@bruno00o/graph/agent'
import { createGraph } from '@bruno00o/graph/headless'
import { grid } from '@bruno00o/graph/layouts'

type Item = { id: string; name: string; team: string }
type Link = { id: string; from: string; to: string }
declare const items: Item[]
declare const links: Link[]

const graph = createGraph({
  definition: defineGraph({
    marks: [
      nodes(items, { label: 'name', color: 'team' }),
      edges(links, { source: 'from', target: 'to' }),
    ],
    states: { path: { stroke: '#d1495b' } },
    layout: grid(),
  }),
  size: { width: 800, height: 600 },
})
await graph.settled()

const agent = createGraphAgent(graph, {
  describe: (datum, _key, kind) => (kind === 'node' ? { team: (datum as Item).team } : null),
})
const found = agent.query({ text: 'delta', kind: 'node' })
const result = await agent.act({
  steps: [
    { action: 'select', target: 'Delta' },
    { action: 'fit', target: 'selection' },
    { action: 'path', target: ['n0', 'n7'], args: { state: 'path' } },
  ],
})
if (!result.ok) console.log(result.error?.message, result.error?.candidates)
const shot = agent.snapshot({ limit: 10 })
console.log(found.total, result.changed.states, shot.view.labelsDrawn)
agent.destroy()
graph.destroy()
```

`describe` decides what an agent reads of the items: without it, `data` is left out. `agent.subscribe(listener)` tells changes as they come, a view once it stops moving.

## Common Mistakes

### HIGH Calling the command without the plugin

`graph-agent` talks to the relay of the plugin on the dev server. Without `graphAgent()` in the Vite config, with the server stopped, or from a folder outside the project, it exits with 2 and `no dev server found`. Add the plugin, start `vite dev`, and run the command from the project (or pass `--url`). A server started before the plugin was added has no relay: restart it.

### HIGH No page connected in a server-rendered app

The plugin adds the client to the entry points of the package that the browser loads. When no page shows a graph yet, or in an app whose client entry the plugin does not reach, `tabs` stays empty and commands fail after five seconds with `no page is connected`. Add the client line to the browser entry (`src/client.tsx` in TanStack Start), and make sure the user has the app open; a hidden tab still answers, a closed one does not.

### HIGH Importing the client in production code

A bare `import '@bruno00o/graph/agent/dev'` ships the client in the build. It stays idle and warns, but it is dead weight, and on the server it is evaluated for nothing. Guard the import with `import.meta.env.DEV && !import.meta.env.SSR`, or let the plugin add it.

### HIGH Looking for an element in the snapshot only

A snapshot lists 50 elements, those on screen with the highest priority. An element off screen, small, or past the limit is not there, and that does not mean it is missing. Use `query` with its text, `--within shown` for everything drawn, or `--near <key>` for its neighbors, before concluding.

### MEDIUM Acting on a label that names several nodes

A label in a target must name one node. With several, the step fails with `candidates` holding their keys; with none, `candidates` holds close labels. Take the key from `query` and pass it, as `node:<key>` when a node and an edge share it.

### MEDIUM A duration in a step

A step with a `duration` animates, and a hidden tab runs no frames: the animation never ends and `act` comes back with `settled: false` after its timeout. Leave `duration` out, as by default, unless the user watches the page.

### MEDIUM Setting a state the definition does not declare

`setState` and `path` with `state` take a state declared in `states` of `defineGraph`. Another name fails with the declared names as `candidates`. Add the state to the definition first if you need a new one.

### MEDIUM Looking for the members of a folded group

The bridge reads what the graph draws, and a folded group hides its members: `query` does not find them and `act` does not reach them. Find the group (`--kind group`), `act unfold <group>`, then look again.

### MEDIUM Taking a hidden label for a bug

`labelShown: false` is often the rule of the graph, not a bug: labels under 8 pixels, overlapping a larger node's label, or past the label limit are left out on purpose. Read `labelHidden` before changing code: `too-small` and `node-too-small` call for a zoom or a `minScreenSize`, `overlap` for a closer view or fewer labels, `state` for the style of a state.

### MEDIUM Expecting the fields of the items

`createGraphAgent` tells nothing of the items by default, and the client of the dev server tells only six short fields. To read more, read the data in the code, or pass `describe` when you make the bridge yourself.

### MEDIUM Checking HTML in the image

`graph-agent image` is a PNG export of the graph alone: anchors, panels, legends and the base map are not in it, and the snapshot does not see them either. Check those in the code, or ask the user for a screenshot.

### MEDIUM A `switch` over the origins without `'agent'`

`ViewOrigin` and `PositionOrigin` have `'agent'` for the moves of the bridge. A `switch` that checks every origin, or a `Record` keyed by them, no longer compiles until it handles it.

```ts expect-error=TS2322
import type { ViewOrigin } from '@bruno00o/graph'

function who(origin: ViewOrigin): string {
  switch (origin) {
    case 'user':
      return 'by hand'
    case 'api':
      return 'by code'
    default: {
      const left: never = origin
      return left
    }
  }
}
console.log(who('user'))
```

## Security

The relay answers only on the machine: it refuses other addresses even with `server.host` open, host names other than `localhost`, `127.0.0.1` and `::1`, commands without its header, and a page stream from another origin. Do not open it to the network, and do not ask the user to.

## Completion

The task is done when:

- `graphAgent()` is in the Vite config, and in a server-rendered app the client line is in the browser entry under `import.meta.env.DEV && !import.meta.env.SSR`;
- `graph-agent tabs` lists the page, and `snapshot` comes back with `settled: true`;
- the change is checked by `query`, `act` and a new `snapshot` or `image`, not only by reading the code;
- no step uses a `duration` unless the user watches;
- no production code imports `@bruno00o/graph/agent/dev` without the guard;
- `tsc` accepts the code.

## References

Every page has a Markdown version: add `.md` to its URL.

- [Agent bridge](https://bruno00o.github.io/graph/docs/agent), [createGraphAgent](https://bruno00o.github.io/graph/docs/api/agent), [graphAgent and graph-agent](https://bruno00o.github.io/graph/docs/api/agent-vite)
- [Versioning: experimental ports](https://bruno00o.github.io/graph/docs/versioning#experimental-ports)
