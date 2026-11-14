import { panBy, toScreen, zoomAround } from '../core/view'
import type { GraphDefinition } from '../types'
import type { FocusControl } from './focus-control'
import { keyDuration } from './focus-control'
import type { FoldControl } from './folding'
import type { GraphState } from './graph-instance'
import { keyAction } from './keyboard'
import type { PointerTool } from './pointer-tool'
import type { SelectionControl } from './selection-control'
import type { ViewControl } from './view-control'

const keyPan = 0.1

export interface KeyboardSource {
  readonly element: HTMLElement
  readonly views: ViewControl
  readonly focus: FocusControl
  readonly selection: SelectionControl
  readonly folds: FoldControl
  state(): GraphState
  definition(): GraphDefinition
  cancelLasso(): boolean
  prepare(): void
  tool(): PointerTool | null
}

export class KeyboardInput {
  readonly #source: KeyboardSource

  constructor(source: KeyboardSource) {
    this.#source = source
  }

  #run(event: KeyboardEvent): boolean {
    const action = keyAction(event)
    if (!action) return false
    const { views, focus, selection, folds } = this.#source
    this.#source.prepare()
    const definition = this.#source.definition()
    const { interaction } = definition
    const { focused } = this.#source.state()
    const view = views.base()
    const size = views.viewport()
    switch (action.type) {
      case 'move':
        focus.move(action.direction)
        return true
      case 'pan': {
        if (!interaction.pan) return false
        const step = Math.min(size.width, size.height) * keyPan
        views.commit(panBy(view, -action.direction.x * step, -action.direction.y * step), 'user')
        return true
      }
      case 'zoom': {
        if (!interaction.zoom) return false
        const point = focused ? focus.point(focused) : null
        const anchor = point
          ? toScreen(view, size, point)
          : { x: size.width / 2, y: size.height / 2 }
        const zoomed = zoomAround(view, size, anchor, action.factor, definition.view)
        views.animateTo(zoomed, keyDuration, 'user')
        return true
      }
      case 'fit': {
        if (!interaction.pan || !interaction.zoom) return false
        const fitted = views.fitView(views.wholeFit)
        if (!fitted) return false
        views.animateTo(fitted, keyDuration, 'userFit')
        views.framedNow()
        return true
      }
      case 'activate':
        if (
          action.toggle &&
          interaction.fold &&
          focused?.kind === 'node' &&
          folds.isGroup(focused.key)
        ) {
          folds.toggle(focused.key)
          return true
        }
        if (!focused || interaction.select === false) return false
        selection.select(focused, action.additive)
        return true
      case 'escape': {
        if (this.#source.cancelLasso()) return true
        const current = selection.base()
        const count = current.nodes.length + current.edges.length + (current.shapes?.length ?? 0)
        if (interaction.select !== false && count > 0) {
          selection.clear()
          return true
        }
        if (!focused) return false
        focus.set(null)
        return true
      }
    }
  }

  readonly onKeyDown = (event: KeyboardEvent): void => {
    const source = this.#source
    if (event.target !== source.element) return
    if (source.tool()?.key(event)) {
      event.preventDefault()
      return
    }
    if (source.definition().interaction.keyboard && this.#run(event)) event.preventDefault()
  }
}
