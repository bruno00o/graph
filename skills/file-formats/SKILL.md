---
name: file-formats
description: >
  Use when loading a GraphML, GEXF, JSON Graph Format or CSV file into
  @bruno00o/graph nodes and edges, telling the formats apart, mapping the
  positions, colors, sizes, parents and time a file carries onto marks, typing
  the attributes of a file, reporting the data problems and unreadable files, or
  saving a graph or its positions back to one of these formats or converting
  between them.
metadata:
  purpose: >
    The @bruno00o/graph/formats entry point: the readers and writers of four
    graph file formats, the shape of what they return, how a file becomes marks,
    and how a graph becomes text again, with the mistakes that lose positions,
    colors, edges or digits.
  type: sub-skill
  library: '@bruno00o/graph'
sources:
  - src/formats/index.ts
  - src/formats/types.ts
  - src/formats/graphml.ts
  - src/formats/gexf.ts
  - src/formats/json-graph.ts
  - src/formats/csv.ts
  - src/formats/detect.ts
  - src/formats/errors.ts
  - docs/content/docs/(guide)/file-formats.mdx
  - docs/content/docs/api/formats.mdx
requires:
  - core
---

# Read and write graph files

Load the core skill first (`intent load @bruno00o/graph#core`): a file becomes plain arrays that feed `nodes()` and `edges()`, and everything about keys, channels and updates is as in core. This skill covers `@bruno00o/graph/formats`.

The entry point has no dependency, fetches nothing and touches no file: your code loads the text (`await response.text()`, `await file.text()`, `fs.readFile(path, 'utf8')`) and saves the text a writer returns. It runs in the browser, in a worker and in Node. It imports nothing from the rest of the library.

## Setup

No setup: import from the sub-path.

```ts
import { defineGraph, edges, mountGraph, nodes, raw } from '@bruno00o/graph'
import { readGraphml } from '@bruno00o/graph/formats'

const text = await (await fetch('/graph.graphml')).text()
const file = readGraphml(text)

const definition = defineGraph({
  marks: [
    edges(file.edges, {
      source: 'source',
      target: 'target',
      label: 'label',
      arrow: (edge) => (edge.directed ? 'target' : 'none'),
    }),
    nodes(file.nodes, {
      label: 'label',
      parent: 'parent',
      color: raw((node) => node.color ?? 'var(--graph-node)'),
      size: raw((node) => node.size ?? 12),
    }),
  ],
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Imported graph' })
console.log(file.issues.length, graph.count())
```

Every reader returns the same `GraphFile`: `nodes` (`FileNode`, key `id`), `edges` (`FileEdge`, with `id`, `source`, `target`, `directed`), `graph` (what the file says about the graph: `directed`, `id`, `timeFormat`, `attributes`), `schema` (declared attributes) and `issues`. Node and edge fields are plain objects, so `nodes(file.nodes, ...)` needs no `id` option, and `edges(file.edges, ...)` still needs `source: 'source'` and `target: 'target'`.

## Core Patterns

### Pick the reader

| Format | Reader | Input |
| --- | --- | --- |
| GraphML | `readGraphml(text, { fields })` | the XML text |
| GEXF 1.2 and 1.3 | `readGexf(text)` | the XML text |
| JSON Graph Format | `readJsonGraph(input, { graph, fields })`, `readJsonGraphs(input)` | the JSON text or the value it parses to |
| CSV | `readCsv({ nodes, edges }, options)` | the text of a node table and an edge table, or the edge table alone |

- `readJsonGraph` reads one graph of a document: `graph` is an index or an `id`, default 0. `readJsonGraphs` returns an array with all of them. Version 1 documents (a list of nodes) are read too.
- `readCsv` takes `{ nodes, edges }` (each a string, the nodes optional: without a node table, the nodes are the ends of the edges) or one string, the edge table. The node table needs an `id` column and the edge table `source` and `target`; `id`, `source` and `target` options name other columns, matched without case. `separator` (default `','`), `directed` (default `true`, when the table has no `directed` column) and `types` (column types by name) are the other options.
- `detectFormat(text)` returns `'graphml'`, `'gexf'`, `'json-graph'`, `'csv'` or `null`. It looks at the first characters only: text that starts with `{` is JSON Graph Format, with `<` it reads the root element, and anything else is called CSV, even if it is not a table. Use it when the type is unknown, and still handle `FormatError`.

```ts
import {
  detectFormat,
  FormatError,
  readCsv,
  readGexf,
  readGraphml,
  readJsonGraph,
} from '@bruno00o/graph/formats'
import type { GraphFile } from '@bruno00o/graph/formats'

export function readAny(text: string): GraphFile | null {
  try {
    switch (detectFormat(text)) {
      case 'graphml':
        return readGraphml(text)
      case 'gexf':
        return readGexf(text)
      case 'json-graph':
        return readJsonGraph(text)
      case 'csv':
        return readCsv(text)
      default:
        return null
    }
  } catch (error) {
    if (error instanceof FormatError) {
      console.warn(error.message, error.format, error.line, error.column)
      return null
    }
    throw error
  }
}
```

### Handle problems and unreadable files

A reader throws a `FormatError` (`format`, `line`, `column`, and a message that names them) only for a file it cannot read at all: XML that is not well formed, a root element of another format, JSON that does not parse, a CSV edge table without `source` or `target`, an unclosed quote. Every other problem goes to `file.issues` and the reader works around it. `issues` is empty for a clean file.

| `type` | When | What the reader did |
| --- | --- | --- |
| `duplicate-id` | a node or edge with the id of an earlier one | kept the first |
| `missing-id` | a node without id | skipped it |
| `missing-end` | an edge without source or target | skipped it |
| `missing-node` | an edge whose end is not a node of the file | kept it: pending until the node exists |
| `invalid-value` | a value that does not fit its declared type | kept the text |
| `unknown-attribute` | a value for an undeclared attribute | kept the text |
| `malformed-row` | a CSV row with more or fewer fields than the header | filled missing fields with nothing |
| `unsupported` | hyperedges, ports, nested data, phylogenies, shapes with no equivalent, GEXF attributes that change over time | skipped it; counted once with the line of the first use |

Show the user a count by `type`, not a wall of messages. Issues with a `line` point to the line in the file.

### Map a file onto marks

`FileNode` and `FileEdge` carry fields the marks read directly:

| In the file | Field |
| --- | --- |
| GEXF `viz:position`, or attributes `x`, `y` | `x`, `y` (units of the file) |
| GEXF `viz:size` or `viz:thickness`, attribute `size`, `width` | `size` on nodes, `width` on edges |
| GEXF `viz:color`, attribute `color` | `color`, a CSS color |
| GEXF `viz:shape`, attribute `shape` | `shape` (`circle`, `square`, `diamond`), `image`, and `dash` on edges |
| GEXF `start`, `end`, `spells`, `timestamps`, `intervals`; attributes `time`, `start`, `end` | `time` (a moment or `{ start, end }`, in milliseconds), `spells` when an element exists more than once |
| GEXF `pid` and nested nodes, GraphML nested `<graph>`, attribute `parent` | `parent` |
| GEXF `weight` and `kind`, JSON Graph Format `relation`, attribute `type`, `weight` | `weight`, `type` |

- Positions: `nodes(file.nodes, { x: 'x', y: 'y' })`. Positions that come from the data are never moved by a layout, so map `x` and `y` only when the file's positions are wanted. For a layout, leave them out.
- Every field of `FileNode` and `FileEdge` other than `id` (and `source`, `target`, `directed` on edges) is optional (`x?: number`, never `null`), so a function reading one returns `number | undefined`.
- Colors and sizes of a file are final values: wrap the accessor in `raw()` (`color: raw((node) => node.color ?? '...')`), otherwise `color` sends them through the categorical scale and palette colors replace them. `fill` and `stroke` styles also work for per-item colors, but a style function must return a string, never `undefined`: give a fallback (`stroke: (edge) => edge.color ?? 'var(--graph-edge)'`, `fill: (node) => node.color ?? 'var(--graph-node)'`).
- Positions only when the file has them: test the data, then spread the options. A file without coordinates then gets the library's placement or a layout.

```ts
import { nodes } from '@bruno00o/graph'
import type { GraphFile } from '@bruno00o/graph/formats'

export function fileNodes(file: GraphFile) {
  const placed = file.nodes.some((node) => Number.isFinite(node.x) && Number.isFinite(node.y))
  return nodes(file.nodes, { label: 'label', ...(placed ? { x: 'x', y: 'y' } : {}) })
}
```

- A `parent` that names no node leaves the node at the top level and shows up as `missing-parent` in `graph.issues()` (see the core skill).
- Time: `time: 'time'` on `nodes()` and `edges()` with a `defineGraph({ time })` window (see the time skill). A GEXF period includes its end, but the time window excludes it, so an element disappears at exactly the moment its period ends. Dates without a zone are read as UTC; with `timeformat` `double` or `integer` the numbers are kept.
- Attributes that have no field stay in `attributes`, typed from the file's declarations (GraphML `<key>`, GEXF `<attributes>`, the JSON values), with declared defaults applied. Integers are numbers when exact, decimal strings beyond `Number.MAX_SAFE_INTEGER` (no digit is lost), and lists become arrays. Type them without casts by passing the attribute types to the reader; it is an assertion, the file is not checked.

```ts
import { nodes } from '@bruno00o/graph'
import { readGexf } from '@bruno00o/graph/formats'

export function scored(text: string) {
  const file = readGexf<{ readonly score: number }, { readonly strength: number }>(text)
  return nodes(file.nodes, { size: (node) => node.attributes.score, label: 'label' })
}
```

- GraphML, JSON Graph Format and CSV have no slot of their own for these fields, so the readers take attributes with the same names (`label`, `x`, `y`, `size`, `color`, `shape`, `image`, `time`, `start`, `end`, and `parent` outside GraphML; on edges also `type`, `weight`, `width`, `dash`, `directed`) when the value fits. A value that does not fit stays in `attributes`. `fields: false` keeps every attribute as it is. That is also how a file written by `write*` reads back identically.
- Ids are strings in `FileNode.id`, `FileEdge.source` and `target`. If other data you join uses numeric keys, `1` and `'1'` differ and edges wait forever: convert one side.
- An edge without an id gets `a->b` (directed) or `a--b`, then `a->b#2`, `a->b#3` for parallel edges, never an id the file already uses; the same file always gives the same ids.
- A CSV column is numbers when every unquoted value is a number written as JavaScript writes it (`007` stays text), booleans when every value is `true` or `false`, otherwise text. A quoted value is always text. An empty field is no value and `""` is an empty string. Use `types: { nodes: { zip: 'string' } }` to force a column.

### Write a graph back

Every writer takes `{ nodes, edges, graph?, schema? }` and options, and returns the text (`writeCsv` returns `{ nodes, edges }`, two texts). The input can be a `GraphFile` from a reader, the data of your marks, or anything iterable.

- Where to read: `nodes: { key, label, parent, x, y, size, color, shape, image, time, spells, attributes, types }` and `edges: { key, source, target, directed, label, type, weight, color, width, dash, time, spells, attributes, types }`, each a field name or a function; `null` leaves a part out. The defaults are the field names of `FileNode` and `FileEdge`, so a reader's result needs no option.
- `positions: graph.positions.snapshot()` writes the node positions of the live graph and wins over `x` and `y`.
- `attributes` is a list of field names or a function; by default the `attributes` object, otherwise every field no other option reads. Types come from `schema` when the values fit, otherwise from the values (integers, longs, doubles, booleans, lists, text); `types` sets them by name.
- GEXF: `version: '1.2'` (default `'1.3'`), `timeFormat`; `viz` for position, size, color, shape; `pid` for `parent`. A color that is not hexadecimal, `rgb()` or `rgba()`, and the `box` shape, go to attributes. GraphML nests children in `<graph>`. JSON Graph Format: `indent` (default 2), fields in `metadata`; `writeJsonGraphs` writes several graphs. CSV: `separator`, `lineBreak` (default `'\r\n'`), `bom: true` for spreadsheets that need a byte order mark to read UTF-8; text that would read back as a number or boolean is quoted.
- Writers throw a `TypeError` for a node without key or an edge without source or target.

```ts
import type { GraphInstance } from '@bruno00o/graph'
import { readGraphml, writeCsv, writeGexf, writeJsonGraph } from '@bruno00o/graph/formats'

type Person = { email: string; name: string; team: string }
type Link = { from: string; to: string }

declare const graph: GraphInstance
declare const people: Person[]
declare const links: Link[]
declare const teamColors: Record<string, string>

export const gexf = writeGexf(
  { nodes: people, edges: links },
  {
    nodes: { key: 'email', label: 'name', color: (person) => teamColors[person.team] },
    edges: { source: 'from', target: 'to', key: null },
    positions: graph.positions.snapshot(),
  },
)

export function convert(graphml: string) {
  const file = readGraphml(graphml)
  return {
    json: writeJsonGraph(file, { indent: 0 }),
    csv: writeCsv(file, { bom: true }),
  }
}

export const blob = new Blob([gexf], { type: 'application/xml' })
```

A live graph does not carry its source file: keep the `GraphFile` (or the arrays you drew) next to the instance, and write from it with `positions: graph.positions.snapshot()`. The snapshot holds the positions of every node as drawn, laid out or dragged, whether or not the file had coordinates, and they are written in the units the graph uses. A `GraphInstance` can be passed around as a plain `GraphInstance` parameter.

Reading what a writer wrote gives the same nodes, edges and attributes in every format. GraphML and CSV write lists and objects as JSON text, which reads back as text. Give a reader's `schema` back to the writer to keep the types.

## Common Mistakes

### HIGH Reading a file's positions and then expecting a layout to move them

Positions mapped through `x: 'x'` and `y: 'y'` come from the data, and a layout never moves nodes whose positions come from the data. A graph that keeps its file coordinates, in huge or tiny units, is this. Map `x` and `y` only to keep the file's drawing; leave them out and pass a `layout` to `defineGraph` to compute one.

### HIGH Colors and sizes of a file passed to the scale

`color: (node) => node.color` sends the CSS strings of the file through the categorical scale, so each distinct color becomes a palette color. Use `raw()` for the channel, or a `fill` style, and give a default for nodes without a color. The same goes for `size` in the units of the file.

```ts expect-error=TS2769
import { nodes } from '@bruno00o/graph'
import { readGexf } from '@bruno00o/graph/formats'

const file = readGexf('')

nodes(file.nodes, { color: 'red' })
```

### HIGH Passing something other than text

Readers take the text of the file (and JSON also the parsed value). A `Response`, a `Blob` or a `Buffer` is not text: await `response.text()` or `file.text()`, or decode the buffer, before reading. In Node, read as UTF-8.

```ts expect-error=TS2345
import { readGraphml } from '@bruno00o/graph/formats'

const response = await fetch('/graph.graphml')

readGraphml(response)
```

### MEDIUM Edge marks without `source` and `target`

`edges(file.edges, {})` does not compile: the options `source` and `target` are required even though the fields are named `source` and `target`.

### MEDIUM Ignoring `issues`

A reader never throws for bad data, so a half-read file looks fine. Check `file.issues`: `missing-node` edges stay as waiting edges (the graph's `count().pending`), `duplicate-id` rows are dropped, and `unsupported` parts (hyperedges, ports, dynamic attributes) are skipped. Surface counts to the user.

### MEDIUM Trusting `detectFormat` on arbitrary text

Anything that is not JSON or XML is called `'csv'`. A file that cannot be parsed as such throws a `FormatError` or yields many `malformed-row` issues. Pick the reader from the file name or content type when you know it, and keep the `try`/`catch`.

### MEDIUM Mixing numeric and string ids

File ids are strings. Edges that name `1` where the node id is `'1'` wait for a node that never comes. Keep both sides in one type.

### MEDIUM Expecting `writeCsv` to return a string

It returns `{ nodes, edges }`: two texts to save as two files. A node without key (`TypeError`) is the usual failure: name the key with `nodes: { key: 'field' }`.

### MEDIUM Expecting a round trip through a format with no slot

A color the format cannot hold (GEXF without hexadecimal, `rgb()` or `rgba()`), or the `box` shape, is written as an attribute. Keep `fields` at its default when reading it back so the attribute returns to the field.

## Completion

The task is done when:

- the text is loaded by your code and the right reader is chosen (or `detectFormat` with a `FormatError` handler);
- `edges()` names `source: 'source'` and `target: 'target'`, and `nodes()` maps only the fields wanted (`x` and `y` only to keep the file layout);
- file colors and sizes go through `raw()` or `fill`, not the scale;
- `file.issues` is read and summarized, and `missing-node` edges are expected or explained;
- written files come from `write*` with `positions`, `key`, `schema` or `types` set as needed, and a reader reads them back identically;
- `tsc` accepts the code.

## References

Every page has a Markdown version: add `.md` to its URL.

- [File formats guide](https://bruno00o.github.io/graph/docs/file-formats), [Formats API](https://bruno00o.github.io/graph/docs/api/formats)
- Example: [file formats](https://bruno00o.github.io/graph/examples/file-formats)
