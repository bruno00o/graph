import { sideOf } from '../core/geo-arc'
import { type GlobeCamera, globeScreen, globeWorld } from '../core/globe'
import type { Positions } from '../core/positions'
import { toScreen, toWorld } from '../core/view'
import type { Point, View } from '../types'
import type { GraphState } from './graph-instance'
import { type GraphLensState, lensContains, lensView } from './lens'

export interface CameraSource {
  readonly positions: Positions
  state(): GraphState
  viewport(): { width: number; height: number }
  lens(): GraphLensState | null
}

export class HostCamera {
  globe: GlobeCamera | null = null
  readonly #source: CameraSource

  constructor(source: CameraSource) {
    this.#source = source
  }

  sphere(): GlobeCamera | null {
    const globe = this.globe
    return globe && globe.mix > 0 ? globe : null
  }

  worldAt(point: Point, view: View = this.viewAt(point)): Point {
    const camera = this.sphere()
    const found = camera ? globeWorld(camera, point.x, point.y) : null
    return found ?? toWorld(view, this.#source.viewport(), point)
  }

  screenAt(point: Point): Point {
    const camera = this.sphere()
    if (!camera) return toScreen(this.#source.state().view, this.#source.viewport(), point)
    const out = { x: 0, y: 0 }
    globeScreen(camera, point.x, point.y, out)
    return out
  }

  readonly facing = (index: number): boolean => {
    const camera = this.sphere()
    const positions = this.#source.positions
    return !camera || sideOf(camera, positions.x(index), positions.y(index)) >= 0
  }

  viewAt(point: Point): View {
    const current = this.#source.state().view
    const lens = this.#source.lens()
    return lens && lensContains(lens, point)
      ? lensView(current, this.#source.viewport(), lens)
      : current
  }

  dragView(inLens: boolean): View {
    const current = this.#source.state().view
    const lens = this.#source.lens()
    return inLens && lens ? lensView(current, this.#source.viewport(), lens) : current
  }
}
