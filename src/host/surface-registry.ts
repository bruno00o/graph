import type { GraphSurface, HostSurface } from './graph-instance'

const hosts = new WeakMap<object, HostSurface>()

export function exposeSurface(surface: GraphSurface, host: HostSurface): void {
  hosts.set(surface, host)
}

export function hostSurfaceOf(surface: GraphSurface | null | undefined): HostSurface | null {
  if (surface === null || surface === undefined) return null
  const host = typeof surface === 'object' ? hosts.get(surface) : undefined
  if (!host) throw new TypeError('graph: surface must come from mapSurface, or be null')
  return host
}
