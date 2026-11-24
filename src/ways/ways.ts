import { type Adjacency, linkStride } from '../core/graph-model'
import type { PathGroups } from '../core/paths'

export interface WaysRules {
  readonly failure: 'node' | 'edge'
  readonly exit: Uint8Array
  readonly nodeOk: ((index: number) => boolean) | null
  readonly edgeOk: ((id: number) => boolean) | null
  readonly groups: PathGroups | null
}

export interface ChainFound {
  readonly nodes: readonly number[]
  readonly edges: readonly number[]
  readonly ends: readonly [number, number]
  readonly covered: boolean
}

export interface WaysFound {
  readonly exits: readonly number[]
  readonly two: readonly number[]
  readonly one: readonly number[]
  readonly oneThrough: readonly number[]
  readonly none: readonly number[]
  readonly chains: readonly ChainFound[]
  readonly weakNodes: readonly number[]
  readonly weakEdges: readonly number[]
}

export interface PairRules {
  readonly failure: 'node' | 'edge'
  readonly exit: Uint8Array
  readonly nodeOk: ((index: number) => boolean) | null
  readonly groups: PathGroups | null
  readonly from: number
  readonly cost: ((id: number) => number) | null
}

export interface PairPath {
  readonly nodes: readonly number[]
  readonly edges: readonly number[]
  readonly costs: readonly number[]
}

function grownInt(array: Int32Array, length: number): Int32Array {
  if (array.length >= length) return array
  const next = new Int32Array(Math.max(64, array.length * 2, length))
  next.set(array)
  return next
}

function grownUint(array: Uint32Array, length: number): Uint32Array {
  if (array.length >= length) return array
  const next = new Uint32Array(Math.max(64, array.length * 2, length))
  next.set(array)
  return next
}

function grownFlags(array: Uint8Array, length: number): Uint8Array {
  if (array.length >= length) return array
  return new Uint8Array(Math.max(64, array.length * 2, length))
}

function grownFloats(array: Float64Array, length: number): Float64Array {
  if (array.length >= length) return array
  return new Float64Array(Math.max(64, array.length * 2, length))
}

function grownBytes(array: Int8Array, length: number): Int8Array {
  if (array.length >= length) return array
  return new Int8Array(Math.max(64, array.length * 2, length))
}

function eachEnd(
  adjacency: Adjacency,
  groups: PathGroups | null,
  node: number,
  visit: (end: number) => void,
): void {
  const own = adjacency.nodeEnd[node] ?? -1
  if (own >= 0) visit(own)
  if (groups !== null) {
    groups.forEachMember(node, (member) => {
      const end = adjacency.nodeEnd[member] ?? -1
      if (end >= 0 && end !== own) visit(end)
    })
  }
}

export class WaysSearch {
  #generation = 0
  #round = 0
  #disc: Int32Array = new Int32Array(0)
  #low: Int32Array = new Int32Array(0)
  #parent: Int32Array = new Int32Array(0)
  #parentEdge: Int32Array = new Int32Array(0)
  #cursor: Int32Array = new Int32Array(0)
  #rootOf: Int32Array = new Int32Array(0)
  #discOrder: Int32Array = new Int32Array(0)
  #walk: Int32Array = new Int32Array(0)
  #edgeStack: Int32Array = new Int32Array(0)
  #children: Int32Array = new Int32Array(0)
  #two: Uint8Array = new Uint8Array(0)
  #hasBridge: Uint8Array = new Uint8Array(0)
  #exitCut: Uint8Array = new Uint8Array(0)
  #weakNode: Uint8Array = new Uint8Array(0)
  #weakEdgeStamp: Uint32Array = new Uint32Array(0)
  #weakEdge: Uint8Array = new Uint8Array(0)
  #labeled: Uint32Array = new Uint32Array(0)
  #settled: Uint32Array = new Uint32Array(0)
  #dist: Float64Array = new Float64Array(0)
  #pi: Float64Array = new Float64Array(0)
  #piStamp: Uint32Array = new Uint32Array(0)
  #predV: Int32Array = new Int32Array(0)
  #predM: Int32Array = new Int32Array(0)
  #items: Int32Array = new Int32Array(0)
  #place: Int32Array = new Int32Array(0)
  #flowStamp: Uint32Array = new Uint32Array(0)
  #flow: Int8Array = new Int8Array(0)
  #usedStamp: Uint32Array = new Uint32Array(0)
  #used: Int32Array = new Int32Array(0)
  #vflowStamp: Uint32Array = new Uint32Array(0)
  #vflow: Int8Array = new Int8Array(0)
  #endList: Int32Array = new Int32Array(0)
  #endAt: Int32Array = new Int32Array(0)
  #endStop: Int32Array = new Int32Array(0)
  #cursorId: Int32Array = new Int32Array(0)
  #deg: Int32Array = new Int32Array(0)
  #exitInc: Int32Array = new Int32Array(0)
  #exitEdgeA: Int32Array = new Int32Array(0)
  #exitEdgeB: Int32Array = new Int32Array(0)
  #uf: Int32Array = new Int32Array(0)
  #ufSize: Int32Array = new Int32Array(0)
  #compSize: Int32Array = new Int32Array(0)
  #compStart: Int32Array = new Int32Array(0)
  #compFill: Int32Array = new Int32Array(0)
  #compNodes: Int32Array = new Int32Array(0)
  #blockOf: Int32Array = new Int32Array(0)
  #blockCount = 0
  #blockSize: Int32Array = new Int32Array(0)
  #blockAtV: Uint8Array = new Uint8Array(0)
  #bFlag: Uint8Array = new Uint8Array(0)
  #bedgeStart: Int32Array = new Int32Array(0)
  #bedgeFill: Int32Array = new Int32Array(0)
  #bedgeList: Int32Array = new Int32Array(0)
  #bdeg: Int32Array = new Int32Array(0)

  #reserve(nodes: number, edges: number): void {
    const vertices = 2 * (nodes + 1)
    this.#disc = grownInt(this.#disc, nodes + 1)
    this.#low = grownInt(this.#low, nodes + 1)
    this.#parent = grownInt(this.#parent, nodes + 1)
    this.#parentEdge = grownInt(this.#parentEdge, nodes + 1)
    this.#cursor = grownInt(this.#cursor, nodes + 1)
    this.#rootOf = grownInt(this.#rootOf, nodes + 1)
    this.#discOrder = grownInt(this.#discOrder, nodes + 1)
    this.#walk = grownInt(this.#walk, nodes + 1)
    this.#edgeStack = grownInt(this.#edgeStack, Math.max(edges + 1, 64))
    this.#children = grownInt(this.#children, nodes + 1)
    this.#two = grownFlags(this.#two, nodes + 1)
    this.#hasBridge = grownFlags(this.#hasBridge, nodes + 1)
    this.#exitCut = grownFlags(this.#exitCut, nodes + 1)
    this.#weakNode = grownFlags(this.#weakNode, nodes + 1)
    this.#weakEdgeStamp = grownUint(this.#weakEdgeStamp, edges)
    this.#weakEdge = grownFlags(this.#weakEdge, edges)
    this.#labeled = grownUint(this.#labeled, vertices)
    this.#settled = grownUint(this.#settled, vertices)
    this.#dist = grownFloats(this.#dist, vertices)
    this.#pi = grownFloats(this.#pi, vertices)
    this.#piStamp = grownUint(this.#piStamp, vertices)
    this.#predV = grownInt(this.#predV, vertices)
    this.#predM = grownInt(this.#predM, vertices)
    this.#items = grownInt(this.#items, vertices)
    this.#place = grownInt(this.#place, vertices)
    this.#flowStamp = grownUint(this.#flowStamp, edges)
    this.#flow = grownBytes(this.#flow, edges)
    this.#usedStamp = grownUint(this.#usedStamp, nodes + 1)
    this.#used = grownInt(this.#used, nodes + 1)
    this.#vflowStamp = grownUint(this.#vflowStamp, nodes)
    this.#vflow = grownBytes(this.#vflow, nodes)
    this.#endList = grownInt(this.#endList, Math.max(64, nodes * 2 + edges))
    this.#endAt = grownInt(this.#endAt, nodes + 1)
    this.#endStop = grownInt(this.#endStop, nodes + 1)
    this.#cursorId = grownInt(this.#cursorId, nodes + 1)
    this.#deg = grownInt(this.#deg, nodes + 1)
    this.#exitInc = grownInt(this.#exitInc, nodes + 1)
    this.#exitEdgeA = grownInt(this.#exitEdgeA, nodes + 1)
    this.#exitEdgeB = grownInt(this.#exitEdgeB, nodes + 1)
    this.#uf = grownInt(this.#uf, nodes + 1)
    this.#ufSize = grownInt(this.#ufSize, nodes + 1)
    this.#compSize = grownInt(this.#compSize, nodes + 1)
    this.#compStart = grownInt(this.#compStart, nodes + 1)
    this.#compFill = grownInt(this.#compFill, nodes + 1)
    this.#compNodes = grownInt(this.#compNodes, nodes + 1)
    this.#blockOf = grownInt(this.#blockOf, edges)
    this.#blockSize = grownInt(this.#blockSize, nodes + 2)
    this.#blockAtV = grownFlags(this.#blockAtV, nodes + 2)
    this.#bFlag = grownFlags(this.#bFlag, nodes + 2)
    this.#bedgeStart = grownInt(this.#bedgeStart, nodes + 2)
    this.#bedgeFill = grownInt(this.#bedgeFill, nodes + 2)
    this.#bedgeList = grownInt(this.#bedgeList, edges)
    this.#bdeg = grownInt(this.#bdeg, nodes + 1)
  }

  #stamp(): number {
    this.#generation = (this.#generation + 1) >>> 0
    if (this.#generation === 0) {
      this.#weakEdgeStamp.fill(0)
      this.#flowStamp.fill(0)
      this.#usedStamp.fill(0)
      this.#vflowStamp.fill(0)
      this.#piStamp.fill(0)
      this.#generation = 1
    }
    return this.#generation
  }

  analyze(adjacency: Adjacency, rules: WaysRules): WaysFound {
    const gen = this.#stamp()
    const { endNode, endHead, nodeEnd, links } = adjacency
    const nodeCount = nodeEnd.length
    const virtual = nodeCount
    const edgeCount = Math.floor(links.length / linkStride)
    this.#reserve(nodeCount, edgeCount)
    const { exit, nodeOk, edgeOk, groups, failure } = rules
    const disc = this.#disc
    const low = this.#low
    const parent = this.#parent
    const parentEdge = this.#parentEdge
    const cursor = this.#cursor
    const rootOf = this.#rootOf
    const discOrder = this.#discOrder
    const walk = this.#walk
    const edgeStack = this.#edgeStack
    const children = this.#children
    const two = this.#two
    const hasBridge = this.#hasBridge
    const exitCut = this.#exitCut
    const weakNode = this.#weakNode
    const weakEdge = this.#weakEdge
    const weakEdgeStamp = this.#weakEdgeStamp
    const blockOf = this.#blockOf
    const blockSize = this.#blockSize
    const blockAtV = this.#blockAtV
    two.fill(0, 0, nodeCount + 1)
    hasBridge.fill(0, 0, nodeCount + 1)
    exitCut.fill(0, 0, nodeCount + 1)
    weakNode.fill(0, 0, nodeCount + 1)
    children.fill(0, 0, nodeCount + 1)
    disc.fill(-1, 0, nodeCount + 1)
    blockOf.fill(-1, 0, edgeCount)
    const exitsList: number[] = []
    const exitSlot = new Int32Array(nodeCount + 1).fill(-1)
    for (let node = 0; node < nodeCount; node++) {
      if (exit[node] === 1) {
        exitSlot[node] = exitsList.length
        exitsList.push(node)
      }
    }
    let clock = 0
    let edgeTop = 0
    let blockCount = 0
    let endTop = 0
    const endList = this.#endList
    const endAt = this.#endAt
    const endStop = this.#endStop
    const cursorId = this.#cursorId
    const placeEnds = (node: number): void => {
      endAt[node] = endTop
      eachEnd(adjacency, groups, node, (end) => {
        endList[endTop++] = end
      })
      endStop[node] = endTop
      cursor[node] = endAt[node]
      cursorId[node] = endHead[endList[cursor[node]] ?? -1] ?? -1
    }
    for (let step = -1; step < nodeCount; step++) {
      const isVirtual = step === -1
      const root = isVirtual ? nodeCount : step
      if ((disc[root] ?? -1) >= 0) continue
      if (!isVirtual) {
        const end = nodeEnd[root] ?? -1
        if (end < 0 || endNode[end] !== root) continue
        if (groups !== null && groups.representative(root) !== root) continue
        if (nodeOk !== null && !nodeOk(root)) continue
      }
      disc[root] = low[root] = clock
      discOrder[clock] = root
      clock++
      parent[root] = -1
      parentEdge[root] = -1
      rootOf[root] = root
      if (isVirtual) {
        cursor[root] = 0
      } else {
        placeEnds(root)
      }
      let walkTop = 1
      walk[0] = root
      while (walkTop > 0) {
        const at = walk[walkTop - 1] ?? 0
        let pushed = false
        if (at === virtual) {
          while ((cursor[at] ?? 0) < exitsList.length) {
            const k = cursor[at] ?? 0
            cursor[at] = k + 1
            const v = exitsList[k] ?? 0
            const e = -(k + 1)
            if ((disc[v] ?? -1) >= 0) {
              if ((disc[v] ?? 0) < (disc[at] ?? 0) && e !== parentEdge[at]) {
                edgeStack[edgeTop++] = e
                if ((disc[v] ?? 0) < (low[at] ?? 0)) low[at] = disc[v] ?? 0
              }
            } else {
              parent[v] = at
              parentEdge[v] = e
              rootOf[v] = virtual
              disc[v] = low[v] = clock
              discOrder[clock] = v
              clock++
              placeEnds(v)
              children[at] = (children[at] ?? 0) + 1
              edgeStack[edgeTop++] = e
              walk[walkTop++] = v
              pushed = true
              break
            }
          }
        } else {
          while (!pushed && (cursor[at] ?? 0) < (endStop[at] ?? 0)) {
            const end = endList[cursor[at] ?? 0] ?? -1
            let id = cursorId[at] ?? -1
            while (id !== -1) {
              const edge = id
              const at6 = edge * linkStride
              const source = links[at6] ?? -1
              const target = links[at6 + 1] ?? -1
              const outgoing = source === end
              const next = links[at6 + (outgoing ? 2 : 4)] ?? -1
              cursorId[at] = next
              id = next
              if (source === target) continue
              if (edgeOk !== null && !edgeOk(edge)) continue
              let v = endNode[outgoing ? target : source] ?? -1
              if (v < 0) continue
              if (groups !== null) {
                const mapped = groups.representative(v)
                if (mapped < 0 || mapped === at) continue
                v = mapped
              }
              if (nodeOk !== null && !nodeOk(v)) continue
              if ((disc[v] ?? -1) >= 0) {
                if ((disc[v] ?? 0) < (disc[at] ?? 0) && edge !== parentEdge[at]) {
                  edgeStack[edgeTop++] = edge
                  if ((disc[v] ?? 0) < (low[at] ?? 0)) low[at] = disc[v] ?? 0
                }
              } else {
                parent[v] = at
                parentEdge[v] = edge
                rootOf[v] = rootOf[at] ?? -1
                disc[v] = low[v] = clock
                discOrder[clock] = v
                clock++
                placeEnds(v)
                children[at] = (children[at] ?? 0) + 1
                edgeStack[edgeTop++] = edge
                walk[walkTop++] = v
                pushed = true
                break
              }
            }
            if (!pushed) {
              cursor[at] = (cursor[at] ?? 0) + 1
              cursorId[at] =
                (cursor[at] ?? 0) < (endStop[at] ?? 0)
                  ? (endHead[endList[cursor[at] ?? 0] ?? -1] ?? -1)
                  : -1
            }
          }
          const slot = exitSlot[at] ?? -1
          if (slot >= 0 && !pushed) {
            const e = -(slot + 1)
            if (e !== parentEdge[at] && (disc[virtual] ?? -1) >= 0) {
              edgeStack[edgeTop++] = e
              if ((disc[virtual] ?? 0) < (low[at] ?? 0)) low[at] = disc[virtual] ?? 0
            }
          }
        }
        if (pushed) continue
        walkTop--
        const up = parent[at] ?? -1
        if (up < 0) continue
        if ((low[at] ?? 0) < (low[up] ?? 0)) low[up] = low[at] ?? 0
        const pe = parentEdge[at] ?? -1
        if ((low[at] ?? 0) > (disc[up] ?? 0) && pe >= 0) {
          weakEdgeStamp[pe] = gen
          weakEdge[pe] = 1
        }
        if ((low[at] ?? 0) >= (disc[up] ?? 0)) {
          if (up !== virtual && (parent[up] ?? -1) !== -1) weakNode[up] = 1
          const start = edgeTop
          while (edgeTop > 0 && edgeStack[edgeTop - 1] !== pe) edgeTop--
          if (edgeTop > 0) edgeTop--
          const bid = blockCount++
          blockSize[bid] = start - edgeTop
          blockAtV[bid] = up === virtual ? 1 : 0
          for (let i = edgeTop; i < start; i++) {
            const ce = edgeStack[i] ?? -1
            if (ce >= 0) blockOf[ce] = bid
          }
          if (up === virtual && start - edgeTop >= 3 && failure === 'node') {
            for (let i = edgeTop; i < start; i++) {
              const ce = edgeStack[i] ?? -1
              if (ce >= 0) {
                const ce6 = ce * linkStride
                let a = endNode[links[ce6] ?? -1] ?? -1
                let b = endNode[links[ce6 + 1] ?? -1] ?? -1
                if (groups !== null) {
                  if (a >= 0) a = groups.representative(a)
                  if (b >= 0) b = groups.representative(b)
                }
                if (a >= 0) two[a] = 1
                if (b >= 0) two[b] = 1
              } else {
                two[exitsList[-ce - 1] ?? 0] = 1
              }
            }
          }
        }
      }
    }
    for (let d = 0; d < clock; d++) {
      const n = discOrder[d] ?? -1
      const p = parent[n] ?? -1
      if (p < 0) continue
      if ((low[n] ?? 0) > (disc[p] ?? 0) || hasBridge[p] === 1) hasBridge[n] = 1
      if ((exit[p] === 1 && (low[n] ?? 0) >= (disc[p] ?? 0)) || exitCut[p] === 1) exitCut[n] = 1
    }
    if (failure === 'edge') {
      for (let n = 0; n < nodeCount; n++) {
        if (
          (disc[n] ?? -1) >= 0 &&
          rootOf[n] === virtual &&
          exit[n] !== 1 &&
          hasBridge[n] === 0 &&
          exitCut[n] === 0
        ) {
          two[n] = 1
        }
      }
    }
    for (let root = 0; root < nodeCount; root++) {
      if ((disc[root] ?? -1) >= 0 && parent[root] === -1 && (children[root] ?? 0) >= 2)
        weakNode[root] = 1
    }
    const twoList: number[] = []
    const oneList: number[] = []
    const oneThrough: number[] = []
    const noneList: number[] = []
    for (let n = 0; n < nodeCount; n++) {
      if ((disc[n] ?? -1) < 0 || exit[n] === 1) continue
      if (two[n] === 1) {
        twoList.push(n)
        continue
      }
      if (rootOf[n] === virtual) {
        let up = parent[n] ?? -1
        while (up >= 0 && two[up] !== 1 && exit[up] !== 1) up = parent[up] ?? -1
        if (up >= 0) {
          oneList.push(n)
          oneThrough.push(up)
        } else noneList.push(n)
      } else noneList.push(n)
    }
    const weakNodes: number[] = []
    for (let n = 0; n < nodeCount; n++) if (weakNode[n] === 1) weakNodes.push(n)
    const weakEdges: number[] = []
    for (let id = 0; id < edgeCount; id++) {
      if (weakEdgeStamp[id] === gen && weakEdge[id] === 1) weakEdges.push(id)
    }
    this.#blockCount = blockCount
    const chains = this.#chains(adjacency, rules)
    return {
      exits: exitsList,
      two: twoList,
      one: oneList,
      oneThrough,
      none: noneList,
      chains,
      weakNodes,
      weakEdges,
    }
  }

  #ufFind(uf: Int32Array, x: number): number {
    let r = x
    while ((uf[r] ?? r) !== r) r = uf[r] ?? r
    while ((uf[x] ?? x) !== r) {
      const next = uf[x] ?? x
      uf[x] = r
      x = next
    }
    return r
  }

  #chains(adjacency: Adjacency, rules: WaysRules): ChainFound[] {
    const { endNode, endHead, nodeEnd, links } = adjacency
    const nodeCount = nodeEnd.length
    const edgeCount = Math.floor(links.length / linkStride)
    const { exit, groups } = rules
    const blockOf = this.#blockOf
    const blockCount = this.#blockCount
    const blockAtV = this.#blockAtV
    const blockSize = this.#blockSize
    const bFlag = this.#bFlag
    const bedgeStart = this.#bedgeStart
    const bedgeFill = this.#bedgeFill
    const bedgeList = this.#bedgeList
    const bdeg = this.#bdeg
    const deg = this.#deg
    const exitInc = this.#exitInc
    const exitEdgeA = this.#exitEdgeA
    const exitEdgeB = this.#exitEdgeB
    const uf = this.#uf
    const ufSize = this.#ufSize
    const compSize = this.#compSize
    const compStart = this.#compStart
    const compFill = this.#compFill
    const compNodes = this.#compNodes
    const ufFind = (x: number): number => this.#ufFind(uf, x)
    const endsOf = (a: number, b: number): [number, number] => {
      if (groups !== null) {
        a = groups.representative(a)
        b = groups.representative(b)
      }
      return [a, b]
    }
    const exitNodeOf = (id: number): number => {
      const at6 = id * linkStride
      const [a, b] = endsOf(endNode[links[at6] ?? -1] ?? -1, endNode[links[at6 + 1] ?? -1] ?? -1)
      return exit[a] === 1 ? a : b
    }
    bFlag.fill(0, 0, blockCount)
    for (let bid = 0; bid < blockCount; bid++) {
      if (blockAtV[bid] === 1 && (blockSize[bid] ?? 0) >= 3) bFlag[bid] = 1
    }
    bedgeStart.fill(0, 0, blockCount)
    for (let e = 0; e < edgeCount; e++) {
      const bid = blockOf[e] ?? -1
      if (bid >= 0) bedgeStart[bid] = (bedgeStart[bid] ?? 0) + 1
    }
    let acc = 0
    for (let bid = 0; bid < blockCount; bid++) {
      const count = bedgeStart[bid] ?? 0
      bedgeStart[bid] = acc
      bedgeFill[bid] = acc
      acc += count
    }
    for (let e = 0; e < edgeCount; e++) {
      const bid = blockOf[e] ?? -1
      if (bid >= 0) {
        const at = bedgeFill[bid] ?? 0
        bedgeList[at] = e
        bedgeFill[bid] = at + 1
      }
    }
    const found: { chain: ChainFound; covered: boolean; order: number }[] = []
    let order = 0
    deg.fill(0, 0, nodeCount)
    exitInc.fill(0, 0, nodeCount)
    exitEdgeA.fill(-1, 0, nodeCount)
    exitEdgeB.fill(-1, 0, nodeCount)
    for (let n = 0; n < nodeCount; n++) {
      uf[n] = n
      ufSize[n] = 1
    }
    for (let e = 0; e < edgeCount; e++) {
      const bid = blockOf[e] ?? -1
      if (bid < 0 || bFlag[bid] !== 1) continue
      const at6 = e * linkStride
      const [a, b] = endsOf(endNode[links[at6] ?? -1] ?? -1, endNode[links[at6 + 1] ?? -1] ?? -1)
      if (a < 0 || b < 0 || a === b) continue
      deg[a] = (deg[a] ?? 0) + 1
      deg[b] = (deg[b] ?? 0) + 1
      if (exit[a] === 1) {
        exitInc[b] = (exitInc[b] ?? 0) + 1
        if ((exitEdgeA[b] ?? -1) === -1) exitEdgeA[b] = e
        else if ((exitEdgeB[b] ?? -1) === -1) exitEdgeB[b] = e
      } else if (exit[b] === 1) {
        exitInc[a] = (exitInc[a] ?? 0) + 1
        if ((exitEdgeA[a] ?? -1) === -1) exitEdgeA[a] = e
        else if ((exitEdgeB[a] ?? -1) === -1) exitEdgeB[a] = e
      } else {
        const ra = ufFind(a)
        const rv = ufFind(b)
        if (ra !== rv) {
          const sa = ufSize[ra] ?? 0
          const sb = ufSize[rv] ?? 0
          if (sa < sb) uf[ra] = rv
          else {
            uf[rv] = ra
            if (sa === sb) ufSize[ra] = sa + 1
          }
        }
      }
    }
    compSize.fill(0, 0, nodeCount)
    const rootsList: number[] = []
    for (let n = 0; n < nodeCount; n++) {
      if (exit[n] === 1 || (deg[n] ?? 0) === 0) continue
      const r = ufFind(n)
      if ((compSize[r] ?? 0) === 0) rootsList.push(r)
      compSize[r] = (compSize[r] ?? 0) + 1
    }
    let next = 0
    for (const r of rootsList) {
      compStart[r] = next
      compFill[r] = next
      next += compSize[r] ?? 0
    }
    for (let n = 0; n < nodeCount; n++) {
      if (exit[n] === 1 || (deg[n] ?? 0) === 0) continue
      const r = ufFind(n)
      const at = compFill[r] ?? 0
      compNodes[at] = n
      compFill[r] = at + 1
    }
    for (const root of rootsList) {
      const base = compStart[root] ?? 0
      const count = compSize[root] ?? 0
      let exitsOnSpine = 0
      let valid = true
      for (let i = 0; i < count; i++) {
        const u = compNodes[base + i] ?? 0
        if ((deg[u] ?? 0) !== 2) {
          valid = false
          break
        }
        exitsOnSpine += exitInc[u] ?? 0
      }
      if (!valid || exitsOnSpine !== 2) continue
      let first = -1
      for (let i = 0; i < count; i++) {
        const u = compNodes[base + i] ?? 0
        if ((exitInc[u] ?? 0) > 0 && (first === -1 || u < first)) first = u
      }
      if (first === -1) continue
      const chainNodes: number[] = [first]
      const walkEdges: number[] = []
      let prev = -1
      let cur = first
      for (;;) {
        let nextNode = -1
        let nextEdge = -1
        eachEnd(adjacency, groups, cur, (end) => {
          let id = endHead[end] ?? -1
          while (id !== -1) {
            const edge = id
            const at6 = edge * linkStride
            const source = links[at6] ?? -1
            const target = links[at6 + 1] ?? -1
            const outgoing = source === end
            const step = links[at6 + (outgoing ? 2 : 4)] ?? -1
            id = step
            if (source === target) continue
            const bid = blockOf[edge] ?? -1
            if (bid < 0 || bFlag[bid] !== 1) continue
            let v = endNode[outgoing ? target : source] ?? -1
            if (v < 0) continue
            if (groups !== null) v = groups.representative(v)
            if (v < 0 || v === cur || v === prev || exit[v] === 1) continue
            if (nextNode === -1) {
              nextNode = v
              nextEdge = edge
            }
          }
        })
        if (nextNode === -1) break
        walkEdges.push(nextEdge)
        chainNodes.push(nextNode)
        prev = cur
        cur = nextNode
      }
      if (chainNodes.length !== count) continue
      let ends: [number, number]
      let chainEdges: number[]
      if (count === 1) {
        ends = [exitNodeOf(exitEdgeA[first] ?? -1), exitNodeOf(exitEdgeB[first] ?? -1)]
        chainEdges = [exitEdgeA[first] ?? -1, exitEdgeB[first] ?? -1]
      } else {
        const last = chainNodes[chainNodes.length - 1] ?? 0
        ends = [exitNodeOf(exitEdgeA[first] ?? -1), exitNodeOf(exitEdgeA[last] ?? -1)]
        chainEdges = [exitEdgeA[first] ?? -1, ...walkEdges, exitEdgeA[last] ?? -1]
      }
      if (ends[0] === ends[1]) continue
      found.push({
        chain: { nodes: chainNodes, edges: chainEdges, ends, covered: true },
        covered: true,
        order: order++,
      })
    }
    bdeg.fill(0, 0, nodeCount)
    for (let bid = 0; bid < blockCount; bid++) {
      if (blockAtV[bid] === 1) continue
      const count = blockSize[bid] ?? 0
      if (count < 2) continue
      const start = bedgeStart[bid] ?? 0
      let hasExit = -1
      let nodeTotal = 0
      for (let i = start; i < start + count; i++) {
        const e = bedgeList[i] ?? -1
        const at6 = e * linkStride
        const [a, b] = endsOf(endNode[links[at6] ?? -1] ?? -1, endNode[links[at6 + 1] ?? -1] ?? -1)
        if (a < 0 || b < 0 || a === b) continue
        if ((bdeg[a] ?? 0) === 0) nodeTotal++
        if ((bdeg[b] ?? 0) === 0) nodeTotal++
        bdeg[a] = (bdeg[a] ?? 0) + 1
        bdeg[b] = (bdeg[b] ?? 0) + 1
        if (exit[a] === 1) hasExit = a
        else if (exit[b] === 1) hasExit = b
      }
      let ok = hasExit >= 0 && nodeTotal === count
      for (let i = start; i < start + count; i++) {
        const e = bedgeList[i] ?? -1
        const at6 = e * linkStride
        const [a, b] = endsOf(endNode[links[at6] ?? -1] ?? -1, endNode[links[at6 + 1] ?? -1] ?? -1)
        if (a < 0 || b < 0 || a === b) continue
        if ((bdeg[a] ?? 0) !== 2 || (bdeg[b] ?? 0) !== 2) ok = false
      }
      for (let i = start; i < start + count; i++) {
        const e = bedgeList[i] ?? -1
        const at6 = e * linkStride
        const [a, b] = endsOf(endNode[links[at6] ?? -1] ?? -1, endNode[links[at6 + 1] ?? -1] ?? -1)
        if (a < 0 || b < 0 || a === b) continue
        bdeg[a] = 0
        bdeg[b] = 0
      }
      if (!ok) continue
      const exitNode = hasExit
      const chainNodes: number[] = []
      const chainEdges: number[] = []
      let prevEdge = -1
      let cur = exitNode
      for (;;) {
        let nextEdge = -1
        let nextNode = -1
        eachEnd(adjacency, groups, cur, (end) => {
          let id = endHead[end] ?? -1
          while (id !== -1) {
            const edge = id
            const at6 = edge * linkStride
            const source = links[at6] ?? -1
            const target = links[at6 + 1] ?? -1
            const outgoing = source === end
            const step = links[at6 + (outgoing ? 2 : 4)] ?? -1
            id = step
            if (source === target) continue
            if (edge === prevEdge) continue
            if ((blockOf[edge] ?? -1) !== bid) continue
            let v = endNode[outgoing ? target : source] ?? -1
            if (v < 0) continue
            if (groups !== null) v = groups.representative(v)
            if (v < 0 || v === cur) continue
            if (nextEdge === -1) {
              nextEdge = edge
              nextNode = v
            }
          }
        })
        if (nextEdge === -1) break
        chainEdges.push(nextEdge)
        if (nextNode === exitNode) break
        chainNodes.push(nextNode)
        prevEdge = nextEdge
        cur = nextNode
      }
      if (chainNodes.length !== count - 1) continue
      found.push({
        chain: {
          nodes: chainNodes,
          edges: chainEdges,
          ends: [exitNode, exitNode],
          covered: false,
        },
        covered: false,
        order: order++,
      })
    }
    found.sort((a, b) => (a.covered === b.covered ? a.order - b.order : a.covered ? -1 : 1))
    return found.map((each) => each.chain)
  }

  pair(adjacency: Adjacency, rules: PairRules): readonly [PairPath, PairPath] | null {
    const gen = this.#stamp()
    const { endNode, endHead, nodeEnd, links } = adjacency
    const nodeCount = nodeEnd.length
    const virtual = nodeCount
    const vertices = 2 * (nodeCount + 1)
    const edgeCount = Math.floor(links.length / linkStride)
    this.#reserve(nodeCount, edgeCount)
    const { exit, nodeOk, groups, failure, from, cost } = rules
    const offset = Math.max(edgeCount, nodeCount + 1) + 1
    const labeled = this.#labeled
    const settled = this.#settled
    const dist = this.#dist
    const pi = this.#pi
    const piStamp = this.#piStamp
    const predV = this.#predV
    const predM = this.#predM
    const items = this.#items
    const place = this.#place
    const flow = this.#flow
    const flowStamp = this.#flowStamp
    const used = this.#used
    const usedStamp = this.#usedStamp
    const vflow = this.#vflow
    const vflowStamp = this.#vflowStamp
    const source = 2 * from
    const sink = 2 * virtual
    const capOf = (u: number): number => {
      if (u === from) return 2
      if (failure === 'node') return 1
      return exit[u] === 1 ? 1 : 2
    }
    const usedOf = (u: number): number => (usedStamp[u] === gen ? (used[u] ?? 0) : 0)
    const flowOf = (id: number): number => (flowStamp[id] === gen ? (flow[id] ?? 0) : 0)
    const vflowOf = (u: number): number => (vflowStamp[u] === gen ? (vflow[u] ?? 0) : 0)
    const piOf = (v: number): number => (piStamp[v] === gen ? (pi[v] ?? 0) : 0)
    const edgeCost = (id: number): number => {
      if (cost === null) return 1
      return cost(id)
    }
    for (let round = 0; round < 2; round++) {
      this.#round = (this.#round + 1) >>> 0
      if (this.#round === 0) {
        labeled.fill(0)
        settled.fill(0)
        this.#round = 1
      }
      const stamp = this.#round
      const head = 0
      let size = 0
      const push = (item: number): void => {
        items[size] = item
        place[item] = size
        size++
        let at = size - 1
        while (at > 0) {
          const above = (at - 1) >> 1
          if ((dist[items[above] ?? 0] ?? 0) <= (dist[item] ?? 0)) break
          items[at] = items[above] ?? 0
          place[items[at] ?? 0] = at
          at = above
        }
        items[at] = item
        place[item] = at
      }
      const pop = (): number => {
        const top = items[0] ?? -1
        const last = items[--size] ?? -1
        if (size > 0) {
          items[0] = last
          place[last] = 0
          let at = 0
          for (;;) {
            let child = 2 * at + 1
            if (child >= size) break
            const right = child + 1
            if (right < size && (dist[items[right] ?? 0] ?? 0) < (dist[items[child] ?? 0] ?? 0)) {
              child = right
            }
            if ((dist[items[child] ?? 0] ?? 0) >= (dist[last] ?? 0)) break
            items[at] = items[child] ?? 0
            place[items[at] ?? 0] = at
            at = child
          }
          items[at] = last
          place[last] = at
        }
        return top
      }
      labeled[source] = stamp
      dist[source] = 0
      predV[source] = -1
      predM[source] = -1
      push(source)
      let reached = false
      while (head < size) {
        const v = pop()
        if (settled[v] === stamp) continue
        settled[v] = stamp
        if (v === sink) {
          reached = true
          break
        }
        const u = v >> 1
        const base = dist[v] ?? 0
        const piV = piOf(v)
        const relax = (target: number, weight: number, move: number): void => {
          const next = base + weight + piV - piOf(target)
          if (labeled[target] !== stamp) {
            labeled[target] = stamp
            dist[target] = next
            predV[target] = v
            predM[target] = move
            push(target)
          } else if (next < (dist[target] ?? Number.POSITIVE_INFINITY)) {
            dist[target] = next
            predV[target] = v
            predM[target] = move
            let at = place[target] ?? 0
            while (at > 0) {
              const above = (at - 1) >> 1
              if ((dist[items[above] ?? 0] ?? 0) <= next) break
              items[at] = items[above] ?? 0
              place[items[at] ?? 0] = at
              at = above
            }
            items[at] = target
            place[target] = at
          }
        }
        if ((v & 1) === 0) {
          if (usedOf(u) < capOf(u)) relax(2 * u + 1, 0, u)
          if (u !== virtual) {
            eachEnd(adjacency, groups, u, (end) => {
              let id = endHead[end] ?? -1
              while (id !== -1) {
                const edge = id
                const at6 = edge * linkStride
                const s = links[at6] ?? -1
                const t = links[at6 + 1] ?? -1
                const outgoing = s === end
                const next = links[at6 + (outgoing ? 2 : 4)] ?? -1
                id = next
                if (s === t) continue
                const f = flowOf(edge)
                if (f === 0) continue
                let x = endNode[outgoing ? t : s] ?? -1
                if (x < 0) continue
                if (groups !== null) {
                  const mapped = groups.representative(x)
                  if (mapped < 0 || mapped === u) continue
                  x = mapped
                }
                const toward = outgoing ? f === -1 : f === 1
                if (!toward) continue
                const w = edgeCost(edge)
                if (!(w >= 0)) continue
                relax(2 * x + 1, -w, 3 * offset + edge)
              }
            })
          }
        } else {
          if (usedOf(u) > 0) relax(2 * u, 0, offset + u)
          if (u < nodeCount && exit[u] === 1 && vflowOf(u) === 0) relax(sink, 0, 4 * offset + u)
          eachEnd(adjacency, groups, u, (end) => {
            let id = endHead[end] ?? -1
            while (id !== -1) {
              const edge = id
              const at6 = edge * linkStride
              const s = links[at6] ?? -1
              const t = links[at6 + 1] ?? -1
              const outgoing = s === end
              const next = links[at6 + (outgoing ? 2 : 4)] ?? -1
              id = next
              if (s === t) continue
              let x = endNode[outgoing ? t : s] ?? -1
              if (x < 0) continue
              if (groups !== null) {
                const mapped = groups.representative(x)
                if (mapped < 0 || mapped === u) continue
                x = mapped
              }
              if (nodeOk !== null && !nodeOk(x)) continue
              if (flowOf(edge) !== 0) continue
              const w = edgeCost(edge)
              if (!(w >= 0)) continue
              relax(2 * x, w, 2 * offset + edge)
            }
          })
        }
      }
      if (!reached) return null
      const limit = dist[sink] ?? Number.POSITIVE_INFINITY
      let v = sink
      while (v !== source) {
        const move = predM[v] ?? -1
        const p = predV[v] ?? -1
        if (p < 0 || move < 0) return null
        const kind = Math.floor(move / offset)
        const payload = move - kind * offset
        if (kind === 0 || kind === 1) {
          const before = usedStamp[payload] === gen ? (used[payload] ?? 0) : 0
          usedStamp[payload] = gen
          used[payload] = kind === 0 ? before + 1 : before - 1
        } else if (kind === 2) {
          flowStamp[payload] = gen
          flow[payload] = p >> 1 === (endNode[links[payload * linkStride] ?? -1] ?? -1) ? 1 : -1
        } else if (kind === 3) {
          flowStamp[payload] = gen
          flow[payload] = 0
        } else if (kind === 4) {
          vflowStamp[payload] = gen
          vflow[payload] = 1
        } else {
          vflowStamp[payload] = gen
          vflow[payload] = 0
        }
        v = p
      }
      for (let x = 0; x < vertices; x++) {
        const d =
          labeled[x] === stamp ? (dist[x] ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY
        pi[x] = piOf(x) + Math.min(d, limit)
        piStamp[x] = gen
      }
    }
    const paths: PairPath[] = []
    for (let k = 0; k < 2; k++) {
      const nodes = [from]
      const edges: number[] = []
      const costs = [0]
      used[from] = (usedStamp[from] === gen ? (used[from] ?? 0) : 0) - 1
      usedStamp[from] = gen
      let u = from
      let guard = vertices
      for (;;) {
        if (u < nodeCount && exit[u] === 1 && vflowOf(u) === 1) {
          vflowStamp[u] = gen
          vflow[u] = 0
          break
        }
        let found = -1
        let foundOutgoing = false
        eachEnd(adjacency, groups, u, (end) => {
          let id = endHead[end] ?? -1
          while (id !== -1) {
            const edge = id
            const at6 = edge * linkStride
            const s = links[at6] ?? -1
            const t = links[at6 + 1] ?? -1
            const outgoing = s === end
            const next = links[at6 + (outgoing ? 2 : 4)] ?? -1
            id = next
            if (s === t) continue
            const f = flowOf(edge)
            if (f === 0) continue
            if (outgoing ? f !== 1 : f !== -1) continue
            found = edge
            foundOutgoing = outgoing
            break
          }
        })
        if (found < 0 || guard-- <= 0) return null
        const at6 = found * linkStride
        const s = links[at6] ?? -1
        const t = links[at6 + 1] ?? -1
        const outgoing = foundOutgoing
        let x = endNode[outgoing ? t : s] ?? -1
        if (x < 0) return null
        if (groups !== null) {
          const mapped = groups.representative(x)
          if (mapped < 0) return null
          x = mapped
        }
        flowStamp[found] = gen
        flow[found] = 0
        const w = edgeCost(found)
        edges.push(found)
        nodes.push(x)
        costs.push((costs[costs.length - 1] ?? 0) + Math.max(w, 0))
        used[x] = (usedStamp[x] === gen ? (used[x] ?? 0) : 0) - 1
        usedStamp[x] = gen
        u = x
      }
      paths.push({ nodes, edges, costs })
    }
    return [paths[0] as PairPath, paths[1] as PairPath]
  }
}
