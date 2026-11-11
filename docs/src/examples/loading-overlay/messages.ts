const numbers = new Intl.NumberFormat('en-US')

function count(value: number, one: string, other: string): string {
  return `${numbers.format(value)} ${value === 1 ? one : other}`
}

export const messages = {
  graphLabel: 'Graph of 120 nodes loaded from a collection in three batches',
  loading: (nodes: number, total: number) =>
    `Loading the data: ${numbers.format(nodes)} of ${count(total, 'node', 'nodes')}`,
  loaded: (nodes: number, edges: number) =>
    `Loaded ${count(nodes, 'node', 'nodes')} and ${count(edges, 'edge', 'edges')}.`,
  failed: (nodes: number, total: number) =>
    `The load failed after ${numbers.format(nodes)} of ${count(total, 'node', 'nodes')}: the graph keeps what arrived.`,
  serverError: 'The server stopped answering',
  reload: 'Load again',
  reloadFailing: 'Load with an error',
} as const
