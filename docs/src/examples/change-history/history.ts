import { random } from '../shared/random'

export type ChangeKind = 'added' | 'changed' | 'removed'

export interface Change {
  readonly id: string
  readonly at: number
  readonly kind: ChangeKind
  readonly node: string
}

export interface Member {
  readonly id: string
  readonly label: string
  readonly start: number | null
  readonly end: number | null
}

export interface Tie {
  readonly id: string
  readonly from: string
  readonly to: string
}

export interface History {
  readonly members: readonly Member[]
  readonly ties: readonly Tie[]
  readonly changes: readonly Change[]
}

export const day = 86_400_000
const hour = 3_600_000

interface Draft {
  id: string
  label: string
  start: number | null
  end: number | null
}

export function createHistory(first: number, days: number, seed = 29): History {
  const next = random(seed)
  const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)] as T
  const members: Draft[] = []
  const ties: Tie[] = []
  const changes: Change[] = []
  const alive: Draft[] = []
  const tie = (from: string, to: string) => ties.push({ id: `t${ties.length}`, from, to })
  const member = (start: number | null): Draft => {
    const index = members.length
    const parent = alive.length > 0 ? pick(alive) : null
    const created: Draft = {
      id: `n${index}`,
      label: `n${index}`,
      start,
      end: null,
    }
    members.push(created)
    if (parent) tie(parent.id, created.id)
    if (alive.length > 6 && next() < 0.3) tie(pick(alive).id, created.id)
    alive.push(created)
    return created
  }
  for (let index = 0; index < 60; index++) member(null)
  for (let offset = 0; offset < days; offset++) {
    const weekday = new Date(first + offset * day).getUTCDay()
    const quiet = weekday === 0 || weekday === 6
    const count = quiet ? 1 + Math.floor(next() * 3) : 6 + Math.floor(next() * 9)
    const times = Array.from(
      { length: count },
      () => first + offset * day + Math.round((8 + next() * 10) * 60) * (hour / 60),
    ).sort((a, b) => a - b)
    for (const at of times) {
      const roll = next()
      const push = (kind: ChangeKind, node: Draft) =>
        changes.push({ id: `c${changes.length}`, at, kind, node: node.id })
      if (roll < 0.42 || alive.length < 12) {
        push('added', member(at))
      } else if (roll < 0.84) {
        push('changed', pick(alive))
      } else {
        const node = pick(alive)
        node.end = at
        alive.splice(alive.indexOf(node), 1)
        push('removed', node)
      }
    }
  }
  return { members, ties, changes }
}
