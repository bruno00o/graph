import { type Adjacency, adjacency } from './adjacency'

export interface Layered {
  readonly real: number
  readonly count: number
  readonly half: Float64Array
  readonly upper: Int32Array
  readonly lower: Int32Array
  up: Adjacency
  down: Adjacency
  readonly slots: Int32Array
  readonly slotOf: Int32Array
  readonly order: Int32Array
  readonly position: Int32Array
  readonly componentSlots: Int32Array
}

export function expand(
  real: number,
  layer: Int32Array,
  component: Int32Array,
  successors: Adjacency,
  radius: Float64Array,
): Layered {
  let dummies = 0
  let segments = 0
  for (let node = 0; node < real; node++) {
    for (let k = successors.start[node] ?? 0; k < (successors.start[node + 1] ?? 0); k++) {
      const span = (layer[successors.items[k] ?? 0] ?? 0) - (layer[node] ?? 0)
      dummies += span - 1
      segments += span
    }
  }
  const count = real + dummies
  const layers = new Int32Array(count)
  const components = new Int32Array(count)
  const half = new Float64Array(count)
  layers.set(layer.subarray(0, real))
  components.set(component.subarray(0, real))
  half.set(radius.subarray(0, real))
  const upper = new Int32Array(segments)
  const lower = new Int32Array(segments)
  let next = real
  let segment = 0
  for (let node = 0; node < real; node++) {
    const from = layer[node] ?? 0
    for (let k = successors.start[node] ?? 0; k < (successors.start[node + 1] ?? 0); k++) {
      const target = successors.items[k] ?? 0
      let previous = node
      for (let level = from + 1; level < (layer[target] ?? 0); level++) {
        layers[next] = level
        components[next] = component[node] ?? 0
        upper[segment] = previous
        lower[segment] = next
        segment++
        previous = next++
      }
      upper[segment] = previous
      lower[segment] = target
      segment++
    }
  }
  const { componentSlots, slots, slotOf, order, position } = slotted(
    real,
    count,
    layer,
    component,
    layers,
    components,
  )
  const ids = Int32Array.from({ length: segments }, (_, at) => at)
  return {
    real,
    count,
    half,
    upper,
    lower,
    up: adjacency(count, lower, ids),
    down: adjacency(count, upper, ids),
    slots,
    slotOf,
    order,
    position,
    componentSlots,
  }
}

export interface Slotted {
  readonly componentSlots: Int32Array
  readonly slots: Int32Array
  readonly slotOf: Int32Array
  readonly order: Int32Array
  readonly position: Int32Array
}

export function slotted(
  real: number,
  count: number,
  layer: Int32Array,
  component: Int32Array,
  layers: Int32Array,
  components: Int32Array,
): Slotted {
  let componentCount = 0
  for (let node = 0; node < real; node++) {
    componentCount = Math.max(componentCount, (component[node] ?? 0) + 1)
  }
  const depth = new Int32Array(componentCount)
  for (let node = 0; node < real; node++) {
    const c = component[node] ?? 0
    depth[c] = Math.max(depth[c] ?? 0, (layer[node] ?? 0) + 1)
  }
  const componentSlots = new Int32Array(componentCount + 1)
  for (let c = 0; c < componentCount; c++) {
    componentSlots[c + 1] = (componentSlots[c] ?? 0) + (depth[c] ?? 0)
  }
  const slotCount = componentSlots[componentCount] ?? 0
  const slotOf = new Int32Array(count)
  const slots = new Int32Array(slotCount + 1)
  for (let node = 0; node < count; node++) {
    const slot = (componentSlots[components[node] ?? 0] ?? 0) + (layers[node] ?? 0)
    slotOf[node] = slot
    slots[slot + 1] = (slots[slot + 1] ?? 0) + 1
  }
  for (let slot = 0; slot < slotCount; slot++) {
    slots[slot + 1] = (slots[slot + 1] ?? 0) + (slots[slot] ?? 0)
  }
  const fill = slots.slice(0, slotCount)
  const order = new Int32Array(count)
  const position = new Int32Array(count)
  for (let node = 0; node < count; node++) {
    const slot = slotOf[node] ?? 0
    const at = fill[slot] ?? 0
    order[at] = node
    position[node] = at - (slots[slot] ?? 0)
    fill[slot] = at + 1
  }
  return { componentSlots, slots, slotOf, order, position }
}

export function sortAdjacency(graph: Layered): void {
  const { count, order, upper, lower } = graph
  const segments = upper.length
  const up = new Int32Array(segments)
  const down = new Int32Array(segments)
  const upFill = graph.up.start.slice(0, count)
  const downFill = graph.down.start.slice(0, count)
  for (let at = 0; at < count; at++) {
    const node = order[at] ?? 0
    for (let k = graph.down.start[node] ?? 0; k < (graph.down.start[node + 1] ?? 0); k++) {
      const segment = graph.down.items[k] ?? 0
      const target = lower[segment] ?? 0
      const slot = upFill[target] ?? 0
      up[slot] = segment
      upFill[target] = slot + 1
    }
    for (let k = graph.up.start[node] ?? 0; k < (graph.up.start[node + 1] ?? 0); k++) {
      const segment = graph.up.items[k] ?? 0
      const source = upper[segment] ?? 0
      const slot = downFill[source] ?? 0
      down[slot] = segment
      downFill[source] = slot + 1
    }
  }
  graph.up = { start: graph.up.start, items: up }
  graph.down = { start: graph.down.start, items: down }
}
