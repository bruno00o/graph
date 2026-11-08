import { createStrata, type LayeredLink } from '../shared/data'
import { random } from '../shared/random'
import { messages } from './messages'

export interface Link extends LayeredLink {
  readonly name: string
  readonly capacity: number
}

export function createNetwork() {
  const strata = createStrata(12, 9)
  const next = random(11)
  const describe = (links: LayeredLink[], name: (order: number) => string): Link[] =>
    links.map((link, index) => ({
      ...link,
      name: name(index + 1),
      capacity: 10 + Math.round(next() * 90),
    }))
  return {
    places: strata.places,
    routes: describe(strata.upper, messages.names.upper),
    paths: describe(strata.middle, messages.names.middle),
    segments: describe(strata.lower, messages.names.lower),
  }
}
