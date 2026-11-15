import { random } from '../shared/random'

export type Kind = 'A' | 'B' | 'C' | 'D'

export const kinds: readonly Kind[] = ['A', 'B', 'C', 'D']

export interface Part {
  readonly id: string
  readonly label: string
  readonly kind: Kind | null
}

export interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

export function createParts(seed = 11): { parts: Part[]; links: Link[] } {
  const next = random(seed)
  const sizes = [4, 9, 12, 8]
  const parts: Part[] = []
  const byKind: string[][] = kinds.map(() => [])
  kinds.forEach((kind, level) => {
    for (let at = 0; at < (sizes[level] ?? 0); at++) {
      const id = `${kind}${at + 1}`
      parts.push({ id, label: id, kind })
      byKind[level]?.push(id)
    }
  })
  for (let at = 0; at < 3; at++) {
    parts.push({ id: `x${at + 1}`, label: `x${at + 1}`, kind: null })
  }
  const links: Link[] = []
  const link = (from: string, to: string) => {
    links.push({ id: `e${links.length}`, from, to })
  }
  const pick = (ids: readonly string[]) => ids[Math.floor(next() * ids.length)] ?? ''
  for (let level = 1; level < kinds.length; level++) {
    for (const id of byKind[level] ?? []) {
      link(pick(byKind[level - 1] ?? []), id)
      if (next() < 0.25) link(pick(byKind[level - 1] ?? []), id)
      if (level >= 2 && next() < 0.15) link(pick(byKind[level - 2] ?? []), id)
      const peer = pick(byKind[level] ?? [])
      if (next() < 0.06 && peer !== id) link(id, peer)
    }
  }
  link('D2', 'B3')
  link('C7', 'A1')
  for (let at = 0; at < 3; at++) link(pick(byKind[2] ?? []), `x${at + 1}`)
  return { parts, links }
}
