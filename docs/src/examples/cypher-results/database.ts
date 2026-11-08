import { random } from '../shared/random'

export class Integer {
  readonly low: number
  readonly high: number

  constructor(value: number) {
    this.low = value | 0
    this.high = Math.floor(value / 4294967296)
  }

  toNumber(): number {
    return this.high * 4294967296 + (this.low >>> 0)
  }
}

export interface DatabaseNode {
  readonly identity: Integer
  readonly labels: string[]
  readonly properties: { readonly name: string; readonly rank: Integer }
  readonly elementId: string
}

export interface DatabaseRelationship {
  readonly identity: Integer
  readonly start: Integer
  readonly end: Integer
  readonly type: string
  readonly properties: { readonly weight: Integer }
  readonly elementId: string
  readonly startNodeElementId: string
  readonly endNodeElementId: string
}

export class DatabaseRecord {
  readonly keys: string[]
  readonly #values: Map<string, DatabaseNode | DatabaseRelationship | null>

  constructor(entries: Record<string, DatabaseNode | DatabaseRelationship | null>) {
    this.keys = Object.keys(entries)
    this.#values = new Map(Object.entries(entries))
  }

  get(key: string): DatabaseNode | DatabaseRelationship | null | undefined {
    return this.#values.get(key)
  }
}

export interface DatabaseResult {
  readonly records: DatabaseRecord[]
}

export const neighborsQuery =
  'MATCH (n) WHERE elementId(n) = $id OPTIONAL MATCH (n)-[r]-(m) RETURN n, r, m'

const families = ['Alpha', 'Beta', 'Gamma', 'Delta']
const types = ['LINKS', 'FOLLOWS']
const count = 160

const nodes: DatabaseNode[] = Array.from({ length: count }, (_, index) => ({
  identity: new Integer(index),
  labels: [families[index % families.length] as string],
  properties: { name: `Node ${index}`, rank: new Integer(1 + (index % 7)) },
  elementId: `4:demo:${index}`,
}))

const relationships: DatabaseRelationship[] = []
const next = random(7)
const connect = (from: number, to: number) => {
  const start = nodes[from] as DatabaseNode
  const end = nodes[to] as DatabaseNode
  const index = relationships.length
  relationships.push({
    identity: new Integer(index),
    start: start.identity,
    end: end.identity,
    type: types[index % types.length] as string,
    properties: { weight: new Integer(1 + Math.floor(next() * 5)) },
    elementId: `5:demo:${index}`,
    startNodeElementId: start.elementId,
    endNodeElementId: end.elementId,
  })
}
for (let index = 1; index < count; index++) connect(index, Math.floor(next() ** 2 * index))
for (let extra = 0; extra < 90; extra++) {
  const from = 1 + Math.floor(next() * (count - 1))
  const to = Math.floor(next() * count)
  if (from !== to) connect(from, to)
}

export const rootId: string = (nodes[0] as DatabaseNode).elementId

export async function run(
  text: string,
  parameters: { readonly id: string },
): Promise<DatabaseResult> {
  if (text !== neighborsQuery) throw new Error('This database only answers the neighbors query')
  await new Promise((resolve) => setTimeout(resolve, 250))
  const origin = nodes.find((item) => item.elementId === parameters.id)
  if (!origin) return { records: [] }
  const around = relationships.filter(
    (item) =>
      item.startNodeElementId === origin.elementId || item.endNodeElementId === origin.elementId,
  )
  if (around.length === 0) return { records: [new DatabaseRecord({ n: origin, r: null, m: null })] }
  return {
    records: around.map((relationship) => {
      const otherId =
        relationship.startNodeElementId === origin.elementId
          ? relationship.endNodeElementId
          : relationship.startNodeElementId
      const other = nodes.find((item) => item.elementId === otherId) as DatabaseNode
      return new DatabaseRecord({ n: origin, r: relationship, m: other })
    }),
  }
}
