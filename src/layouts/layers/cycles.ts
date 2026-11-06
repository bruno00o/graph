import { adjacency, degree } from './adjacency'

export function acyclicRanks(
  count: number,
  from: Int32Array,
  to: Int32Array,
  roots: Int32Array,
): Int32Array {
  const edgeCount = from.length
  const out = adjacency(count, from, to)
  const into = adjacency(count, to, from)
  const outDegree = new Int32Array(count)
  const inDegree = new Int32Array(count)
  for (let node = 0; node < count; node++) {
    outDegree[node] = degree(out, node)
    inDegree[node] = degree(into, node)
  }
  const offset = edgeCount + 2
  const head = new Int32Array(2 * edgeCount + 3).fill(-1)
  const next = new Int32Array(count)
  const previous = new Int32Array(count)
  const bin = new Int32Array(count)
  const removed = new Uint8Array(count)
  let top = 1
  const link = (node: number) => {
    const outs = outDegree[node] ?? 0
    const ins = inDegree[node] ?? 0
    const b = outs === 0 ? 0 : ins === 0 ? 1 : outs - ins + offset
    const first = head[b] ?? -1
    bin[node] = b
    previous[node] = -1
    next[node] = first
    if (first >= 0) previous[first] = node
    head[b] = node
    if (b > top) top = b
  }
  const unlink = (node: number) => {
    const before = previous[node] ?? -1
    const after = next[node] ?? -1
    if (before >= 0) next[before] = after
    else head[bin[node] ?? 0] = after
    if (after >= 0) previous[after] = before
  }
  const remove = (node: number) => {
    unlink(node)
    removed[node] = 1
    for (let at = out.start[node] ?? 0; at < (out.start[node + 1] ?? 0); at++) {
      const target = out.items[at] ?? 0
      if (removed[target] === 1) continue
      unlink(target)
      inDegree[target] = (inDegree[target] ?? 0) - 1
      link(target)
    }
    for (let at = into.start[node] ?? 0; at < (into.start[node + 1] ?? 0); at++) {
      const source = into.items[at] ?? 0
      if (removed[source] === 1) continue
      unlink(source)
      outDegree[source] = (outDegree[source] ?? 0) - 1
      link(source)
    }
  }
  for (let node = count - 1; node >= 0; node--) link(node)
  const rank = new Int32Array(count)
  let front = 0
  let back = count - 1
  for (const root of roots) {
    if (removed[root] === 1) continue
    remove(root)
    rank[root] = front++
  }
  while (front <= back) {
    const sink = head[0] ?? -1
    if (sink >= 0) {
      remove(sink)
      rank[sink] = back--
      continue
    }
    let node = head[1] ?? -1
    if (node < 0) {
      while (top > 1 && (head[top] ?? -1) < 0) top--
      node = head[top] ?? 0
    }
    remove(node)
    rank[node] = front++
  }
  return rank
}
