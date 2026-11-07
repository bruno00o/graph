import { describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import type { AggregateEdge, GraphDefinitionOptions, Key } from '../types'
import { containerShape } from './columns'
import { createGraphModel } from './graph-model'
import { Projection } from './projection'
import { createScene } from './scene'

type Item = { id: string; parent: string | null; weight: number; kind: string }
type Link = { id: string; from: string; to: string; kind: string; weight: number }

function random(seed: number) {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4294967296
  }
}

const kinds = ['k0', 'k1', 'k2']
const groupIds = ['g0', 'g1', 'g2']
const leafIds = ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6']

let mergeMode = 0
const seeds = 80

function definition(items: Item[], links: Link[], directed: boolean): GraphDefinitionOptions {
  return {
    marks: [
      nodes<Item>(items, { parent: 'parent', size: 'weight', color: 'kind' }),
      edges<Link>(links, {
        source: 'from',
        target: 'to',
        color: 'kind',
        width: 'weight',
        merge:
          mergeMode === 0
            ? { by: 'kind', min: 2, directed }
            : mergeMode === 1
              ? { min: 3, directed }
              : undefined,
        aggregate: { width: (aggregate: AggregateEdge<Link>) => aggregate.count, stroke: 'black' },
      }),
    ],
    scales: { color: { domain: kinds } },
  }
}

function build(options: GraphDefinitionOptions, folded: Key[]) {
  const model = createGraphModel()
  const scene = createScene()
  const projection = new Projection(model)
  projection.setFolded(folded)
  const render = (next: GraphDefinitionOptions) => {
    const defined = defineGraph(next)
    model.setMarks(defined.marks)
    projection.setMarks(defined.marks)
    scene.setDefinition(defined)
    const result = projection.apply(model.flush())
    scene.apply(projection.view, result.scene)
    scene.takeDirty()
  }
  const fold = (keys: Key[]) => {
    projection.setFolded(keys)
    const result = projection.apply(model.flush())
    scene.apply(projection.view, result.scene)
    scene.takeDirty()
  }
  render(options)
  return { model, scene, projection, render, fold }
}

type Built = ReturnType<typeof build>

function picture({ scene, projection }: Built, directed: boolean) {
  const color = (id: number | undefined) => scene.palette.colors[id ?? -1]
  const nodeRows: string[] = []
  for (let index = 0; index < scene.nodes.capacity; index++) {
    if (scene.nodes.alive[index] !== 1) continue
    const container = scene.nodes.shape[index] === containerShape
    nodeRows.push(
      [
        scene.nodes.keys[index],
        container ? 'box' : (scene.nodes.size[index] ?? 0).toFixed(3),
        color(scene.nodes.fill[index]),
      ].join(' '),
    )
  }
  const edgeRows: string[] = []
  const lanes = new Map<string, number[]>()
  for (let index = 0; index < scene.edges.capacity; index++) {
    if (scene.edges.alive[index] !== 1) continue
    const source = scene.edges.source[index] ?? 0
    const target = scene.edges.target[index] ?? 0
    const ends = [scene.nodes.keys[source], scene.nodes.keys[target]].map(String)
    const pair = directed ? ends.join('>') : [...ends].sort().join('-')
    const members = [...(projection.keysAt(index) ?? [scene.edges.keys[index]])].map(String)
    edgeRows.push(
      [
        pair,
        members.join(','),
        color(scene.edges.color[index]),
        (scene.edges.width[index] ?? 0).toFixed(3),
      ].join(' '),
    )
    if (source !== target) {
      const lane = [...ends].sort().join('-')
      const low = scene.nodes.keys[Math.min(source, target)]
      const sign = (source < target ? 1 : -1) * (String(low) === [...ends].sort()[0] ? 1 : -1)
      const list = lanes.get(lane) ?? []
      list.push(Math.round((scene.edges.bend[index] ?? 0) * sign * 1e4))
      lanes.set(lane, list)
    }
  }
  const laneRows = [...lanes].map(([lane, bends]) => `${lane} ${bends.sort((a, b) => a - b)}`)
  return {
    nodes: nodeRows.sort(),
    edges: edgeRows.sort(),
    lanes: laneRows.sort(),
  }
}

function mutate(
  next: () => number,
  items: Item[],
  links: Link[],
  serial: { value: number; stash: Item[] },
) {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)] as T
  const roll = next()
  if (roll < 0.25) {
    const id = pick(leafIds)
    return {
      items: items.map((item) =>
        item.id === id ? { ...item, parent: next() < 0.3 ? null : pick(groupIds) } : item,
      ),
      links,
    }
  }
  if (roll < 0.35) {
    const id = pick(leafIds)
    return {
      items: items.map((item) => (item.id === id ? { ...item, weight: 1 + next() * 9 } : item)),
      links,
    }
  }
  if (roll < 0.55) {
    const ends = [...leafIds, ...groupIds]
    serial.value++
    return {
      items,
      links: [
        ...links,
        { id: `e${serial.value}`, from: pick(ends), to: pick(ends), kind: pick(kinds), weight: 1 },
      ],
    }
  }
  if (roll < 0.7 && links.length > 0) {
    const gone = pick(links).id
    return { items, links: links.filter((link) => link.id !== gone) }
  }
  if (roll < 0.85 && links.length > 0) {
    const id = pick(links).id
    const ends = [...leafIds, ...groupIds]
    return {
      items,
      links: links.map((link) =>
        link.id !== id
          ? link
          : next() < 0.5
            ? { ...link, from: link.to, to: link.from }
            : next() < 0.5
              ? { ...link, kind: pick(kinds) }
              : { ...link, to: pick(ends) },
      ),
    }
  }
  if (roll < 0.93 && items.length > 1) {
    const gone = pick(items)
    serial.stash.push(gone)
    return { items: items.filter((item) => item !== gone), links }
  }
  const back = serial.stash.pop()
  if (back) return { items: [...items, back], links }
  return { items, links }
}

function initial(next: () => number) {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)] as T
  const items: Item[] = [
    { id: 'g0', parent: null, weight: 5, kind: 'k0' },
    { id: 'g1', parent: next() < 0.5 ? 'g0' : null, weight: 5, kind: 'k1' },
    { id: 'g2', parent: null, weight: 5, kind: 'k2' },
    ...leafIds.map((id) => ({
      id,
      parent: next() < 0.3 ? null : pick(groupIds),
      weight: 1 + Math.floor(next() * 9),
      kind: pick(kinds),
    })),
  ]
  const ends = [...leafIds, ...groupIds]
  const links: Link[] = []
  for (let at = 0; at < 10; at++) {
    links.push({ id: `l${at}`, from: pick(ends), to: pick(ends), kind: pick(kinds), weight: 1 })
  }
  return { items, links }
}

describe('incremental projection and scene against a fresh build', () => {
  for (const directed of [true, false]) {
    it(`matches a fresh build after random changes (directed ${directed})`, () => {
      const failures: string[] = []
      for (let seed = 1; seed <= seeds && failures.length === 0; seed++) {
        const next = random(seed * 7919)
        let { items, links } = initial(next)
        mergeMode = Math.floor(next() * 3)
        if (next() < 0.3) {
          items = items.map((item) => ({ ...item, parent: null }))
          mergeMode = 2
        }
        let folded: string[] = groupIds.filter(() => next() < 0.4)
        const serial = { value: 0, stash: [] as Item[] }
        const live = build(definition(items, links, directed), folded)
        for (let step = 0; step < 30; step++) {
          if (next() < 0.1) {
            mergeMode = Math.floor(next() * 3)
            live.render(definition(items, links, directed))
          } else if (next() < 0.25) {
            folded = groupIds.filter(() => next() < 0.5)
            live.fold(folded)
          } else {
            ;({ items, links } = mutate(next, items, links, serial))
            live.render(definition(items, links, directed))
          }
          const fresh = build(definition(items, links, directed), folded)
          const got = picture(live, directed)
          const want = picture(fresh, directed)
          if (JSON.stringify(got) !== JSON.stringify(want)) {
            const diff = (key: 'nodes' | 'edges' | 'lanes') => ({
              extra: got[key].filter((row) => !want[key].includes(row)),
              missing: want[key].filter((row) => !got[key].includes(row)),
            })
            failures.push(
              [
                `seed ${seed} step ${step} folded ${folded}`,
                `items ${items.map((item) => `${item.id}<${item.parent}`).join(' ')}`,
                `links ${links.map((link) => `${link.id}:${link.from}>${link.to}:${link.kind}`).join(' ')}`,
                `nodes ${JSON.stringify(diff('nodes'))}`,
                `edges ${JSON.stringify(diff('edges'))}`,
                `lanes ${JSON.stringify(diff('lanes'))}`,
              ].join('\n'),
            )
            break
          }
        }
      }
      expect(failures[0]).toBeUndefined()
    })
  }
})
