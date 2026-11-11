import { random } from '../shared/random'

const adjectives = [
  'Amber',
  'Brisk',
  'Calm',
  'Dusky',
  'Ember',
  'Frosted',
  'Gilded',
  'Hazy',
  'Ivory',
  'Jade',
  'Keen',
  'Lunar',
  'Mossy',
  'Noble',
  'Opal',
  'Pâle',
] as const

const nouns = [
  'Atlas',
  'Brûlée',
  'Café',
  'Cañon',
  'Crème',
  'Éclair',
  'Étoile',
  'Façade',
  'Forêt',
  'Harbor',
  'Île',
  'Lantern',
  'Meadow',
  'Mosaïque',
  'Orchard',
  'Piñata',
  'Quartz',
  'Ridge',
  'Summit',
] as const

export function createLabels(count: number, seed = 3): string[] {
  const labels: string[] = adjectives.flatMap((adjective) =>
    nouns.map((noun) => `${adjective} ${noun}`),
  )
  const next = random(seed)
  for (let at = labels.length - 1; at > 0; at--) {
    const other = Math.floor(next() * (at + 1))
    const swap = labels[at] ?? ''
    labels[at] = labels[other] ?? ''
    labels[other] = swap
  }
  return labels.slice(0, count)
}
