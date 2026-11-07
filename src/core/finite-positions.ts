const goldenTurn = 2.399963229728653

export interface PositionedGraph {
  readonly capacity: number
  readonly alive: Uint8Array
  readonly movable: Uint8Array
  readonly xy: Float32Array
  readonly radius: Float32Array
  readonly edges: Uint32Array
}

function finiteAt(xy: Float32Array, index: number): boolean {
  return Number.isFinite(xy[index * 2] ?? Number.NaN) && Number.isFinite(xy[index * 2 + 1] ?? 0)
}

export function withFinitePositions<G extends PositionedGraph>(graph: G): G {
  const { capacity, xy } = graph
  let strays = 0
  for (let index = 0; index < capacity; index++) {
    if (graph.alive[index] === 1 && !finiteAt(xy, index)) strays++
  }
  if (strays === 0) return graph
  const alive = graph.alive.slice()
  const movable = graph.movable.slice()
  const placed = xy.slice()
  const stray = new Uint8Array(capacity)
  let sumX = 0
  let sumY = 0
  let known = 0
  for (let index = 0; index < capacity; index++) {
    if (alive[index] !== 1) continue
    if (finiteAt(xy, index)) {
      sumX += xy[index * 2] ?? 0
      sumY += xy[index * 2 + 1] ?? 0
      known++
    } else if (movable[index] === 1) {
      stray[index] = 1
    } else {
      alive[index] = 0
      movable[index] = 0
    }
  }
  const nearX = new Float64Array(capacity)
  const nearY = new Float64Array(capacity)
  const near = new Uint32Array(capacity)
  const kept: number[] = []
  for (let at = 0; at + 1 < graph.edges.length; at += 2) {
    const source = graph.edges[at] ?? 0
    const target = graph.edges[at + 1] ?? 0
    if (alive[source] !== 1 || alive[target] !== 1) continue
    kept.push(source, target)
    for (const [from, to] of [
      [source, target],
      [target, source],
    ] as const) {
      if (stray[to] !== 1 || stray[from] === 1) continue
      nearX[to] = (nearX[to] ?? 0) + (xy[from * 2] ?? 0)
      nearY[to] = (nearY[to] ?? 0) + (xy[from * 2 + 1] ?? 0)
      near[to] = (near[to] ?? 0) + 1
    }
  }
  const centerX = known > 0 ? sumX / known : 0
  const centerY = known > 0 ? sumY / known : 0
  let order = 0
  for (let index = 0; index < capacity; index++) {
    if (stray[index] !== 1) continue
    const count = near[index] ?? 0
    const x = count > 0 ? (nearX[index] ?? 0) / count : centerX
    const y = count > 0 ? (nearY[index] ?? 0) / count : centerY
    const step = Math.max(graph.radius[index] ?? 0, 1) * 2
    const distance = step * Math.sqrt(order + 0.5)
    placed[index * 2] = x + Math.cos(order * goldenTurn) * distance
    placed[index * 2 + 1] = y + Math.sin(order * goldenTurn) * distance
    order++
  }
  return {
    ...graph,
    alive,
    movable,
    xy: placed,
    edges: kept.length === graph.edges.length ? graph.edges : Uint32Array.from(kept),
  }
}
