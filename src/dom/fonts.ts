import { familyName, type LoadedFamilies } from '../core/font-family'

interface FaceLike {
  readonly family: string
  readonly status?: string
}

interface FontSet extends EventTarget {
  readonly status?: string
  readonly ready?: Promise<unknown>
  [Symbol.iterator]?: () => Iterator<FaceLike>
}

function fontSet(): FontSet | null {
  if (typeof document === 'undefined') return null
  const set = (document as { fonts?: FontSet }).fonts
  return set && typeof set.addEventListener === 'function' ? set : null
}

export function watchFonts(onLoaded: (families: LoadedFamilies) => void): (() => void) | null {
  const set = fontSet()
  if (!set) return null
  const pending = new Set<FaceLike>()
  let stopped = false
  let waiting = false

  const iterable = (): boolean => typeof set[Symbol.iterator] === 'function'

  const collect = (): void => {
    if (!iterable()) return
    for (const face of set as Iterable<FaceLike>) {
      if (face.status === 'loading') pending.add(face)
    }
  }

  const settle = (ready: Promise<unknown>): void => {
    waiting = false
    if (stopped) return
    const families = new Set<string>()
    for (const face of pending) {
      if (face.status === 'loading') continue
      pending.delete(face)
      if (face.status === 'loaded') families.add(familyName(face.family))
    }
    if (families.size > 0) onLoaded(families)
    else if (!iterable()) onLoaded(null)
    if (set.status === 'loading' && set.ready !== ready) wait()
  }

  const wait = (): void => {
    collect()
    const ready = set.ready
    if (waiting || !ready) return
    waiting = true
    const done = (): void => settle(ready)
    ready.then(done, done)
  }

  set.addEventListener('loading', wait)
  if (set.status === 'loading') wait()
  return () => {
    stopped = true
    set.removeEventListener('loading', wait)
  }
}
