export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${nodes} nodes linked by ${edges} edges of three kinds`,
  node: (index: number) => `Node ${index}`,
  mode: (name: string) => `Merge: ${name}`,
  modes: { kind: 'by kind', all: 'every kind together', off: 'off' },
  min: (count: number) => `Fewest edges that merge: ${count}`,
  merged: (count: number, kind: string | null, from: string, to: string) =>
    `${count} ${count === 1 ? 'edge' : 'edges'}${kind === null ? '' : ` of kind ${kind}`} between ${from} and ${to}`,
  single: (kind: string, from: string, to: string) => `Edge of kind ${kind} from ${from} to ${to}`,
} as const
