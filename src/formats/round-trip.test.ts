import { describe, expect, it } from 'vitest'
import { generateGraph } from '../testing/graph-files'
import {
  type GraphFile,
  readCsv,
  readGexf,
  readGraphml,
  readJsonGraph,
  writeCsv,
  writeGexf,
  writeGraphml,
  writeJsonGraph,
} from '.'

function withoutLines(file: GraphFile) {
  return {
    ...file,
    issues: file.issues.map((issue) => {
      const { line: _line, ...rest } = issue as { line?: number }
      return rest
    }),
  }
}

function byId<T extends { readonly id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

const formats = {
  graphml: (graph: GraphFile) => readGraphml(writeGraphml(graph)),
  'gexf 1.3': (graph: GraphFile) => readGexf(writeGexf(graph)),
  'gexf 1.2': (graph: GraphFile) => readGexf(writeGexf(graph, { version: '1.2' })),
  'json graph': (graph: GraphFile) => readJsonGraph(writeJsonGraph(graph)),
  csv: (graph: GraphFile) => readCsv(writeCsv(graph)),
} as const

describe('round trips', () => {
  for (const [name, trip] of Object.entries(formats)) {
    it(`reads back what ${name} writes, for 40 seeded graphs`, () => {
      for (let seed = 1; seed <= 40; seed++) {
        const graph = generateGraph(seed, 12, 20, {
          tricky: seed % 2 === 0,
          lists: name === 'gexf 1.3' || name === 'json graph',
          parents: seed % 3 === 0,
          spells: name.startsWith('gexf') || name === 'json graph',
        })
        const input: GraphFile = {
          graph: { directed: seed % 4 !== 0, attributes: {} },
          nodes: graph.nodes,
          edges: graph.edges,
          schema: { nodes: [], edges: [], graph: [] },
          issues: [],
        }
        const first = trip(input)
        expect(byId(first.nodes), `seed ${seed}`).toEqual(byId(graph.nodes))
        expect(first.edges, `seed ${seed}`).toEqual(graph.edges)
        const second = trip(first)
        expect(withoutLines(second), `seed ${seed}`).toEqual(withoutLines(first))
      }
    })
  }

  it('keeps the data of the generated graph through JSON Graph Format', () => {
    const graph = generateGraph(7, 30, 50, {
      tricky: true,
      lists: true,
      parents: true,
      spells: true,
    })
    const read = readJsonGraph(writeJsonGraph(graph))
    expect(byId(read.nodes)).toEqual(byId(graph.nodes))
    expect(read.edges).toEqual(graph.edges)
  })
})
