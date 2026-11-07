import { formatNumber, messages } from '../shared/messages'

export interface Place {
  readonly id: string
  readonly label: string
  readonly group: string
  readonly weight: number
  readonly longitude: number
  readonly latitude: number
}

export interface Route {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly far: boolean
}

const anchors: ReadonlyArray<readonly [number, number]> = [
  [2.35, 48.86],
  [-0.13, 51.51],
  [13.4, 52.52],
  [12.5, 41.9],
  [-3.7, 40.42],
  [4.9, 52.37],
  [16.37, 48.21],
  [14.42, 50.09],
  [21.01, 52.23],
  [18.07, 59.33],
  [10.75, 59.91],
  [12.57, 55.68],
  [24.94, 60.17],
  [-9.14, 38.72],
  [23.73, 37.98],
  [19.04, 47.5],
  [26.1, 44.43],
  [4.35, 50.85],
  [8.54, 47.37],
  [-6.26, 53.35],
  [28.98, 41.01],
  [30.52, 50.45],
  [24.11, 56.95],
  [5.37, 43.3],
  [9.19, 45.46],
  [11.58, 48.14],
  [2.17, 41.39],
  [-74.01, 40.71],
  [-118.24, 34.05],
  [-87.63, 41.88],
  [-99.13, 19.43],
  [-46.63, -23.55],
  [-58.38, -34.6],
  [-77.04, -12.05],
  [139.69, 35.69],
  [116.4, 39.9],
  [121.47, 31.23],
  [126.98, 37.57],
  [77.21, 28.61],
  [72.88, 19.08],
  [103.82, 1.35],
  [100.5, 13.76],
  [151.21, -33.87],
  [174.76, -36.85],
  [31.24, 30.04],
  [3.38, 6.52],
  [36.82, -1.29],
  [18.42, -33.92],
  [55.27, 25.2],
  [-79.38, 43.65],
  [-123.12, 49.28],
]

function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function distance(a: Place, b: Place): number {
  const dx = (a.longitude - b.longitude) * Math.cos(((a.latitude + b.latitude) * Math.PI) / 360)
  return Math.hypot(dx, a.latitude - b.latitude)
}

export const placeCount: number = anchors.length

export function createPlaces(
  count: number,
  edgeCount: number,
  seed = 3,
): { readonly places: Place[]; readonly routes: Route[] } {
  const next = random(seed)
  const gaussian = () => Math.sqrt(-2 * Math.log(next() || 1e-9)) * Math.cos(2 * Math.PI * next())
  const groups = 6
  const spread = count <= anchors.length ? 0 : Math.min(4, 0.4 + Math.sqrt(count) / 120)
  const places: Place[] = []
  const members: number[][] = anchors.map(() => [])
  const homes = new Int32Array(count)
  for (let index = 0; index < count; index++) {
    const home = index < anchors.length ? index : Math.floor(next() ** 1.6 * anchors.length)
    const [longitude, latitude] = anchors[home] ?? [0, 0]
    members[home]?.push(index)
    homes[index] = home
    places.push({
      id: `p${index}`,
      label: messages.place(formatNumber(index + 1)),
      group: messages.group(String.fromCharCode(65 + (home % groups))),
      weight:
        index < anchors.length ? 60 + Math.round(next() * 40) : Math.round(1 + next() ** 3 * 50),
      longitude: longitude + gaussian() * spread,
      latitude: Math.max(-80, Math.min(80, latitude + gaussian() * spread * 0.6)),
    })
  }
  const routes: Route[] = []
  if (count <= anchors.length) {
    for (const place of places) {
      const nearest = places
        .filter((other) => other !== place)
        .sort((a, b) => distance(place, a) - distance(place, b))
        .slice(0, 2)
      for (const other of nearest) {
        const [from, to] = place.id < other.id ? [place, other] : [other, place]
        const id = `${from.id}-${to.id}`
        if (!routes.some((route) => route.id === id)) {
          routes.push({ id, from: from.id, to: to.id, far: false })
        }
      }
    }
    for (let index = 0; index < places.length; index += 4) {
      const from = places[index]
      const to = places[(index + Math.floor(places.length / 2)) % places.length]
      if (from && to)
        routes.push({ id: `${from.id}-${to.id}-far`, from: from.id, to: to.id, far: true })
    }
    return { places, routes }
  }
  for (let index = 0; index < edgeCount; index++) {
    const source = Math.floor(next() * count)
    const local = next() < 0.92
    const pool = members[local ? (homes[source] ?? 0) : Math.floor(next() * anchors.length)] ?? []
    const target = pool[Math.floor(next() * pool.length)]
    if (target === undefined || target === source) continue
    routes.push({ id: `r${index}`, from: `p${source}`, to: `p${target}`, far: !local })
  }
  return { places, routes }
}
