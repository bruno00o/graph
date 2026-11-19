import { toWorld } from '../core/view'
import { createTextWidths } from '../dom/text-width'
import { ThemeResolver } from '../dom/theme'
import { defaultFont } from '../theme/tokens'
import type { LayoutWork, Mark } from '../types'
import { createWebglRenderer } from '../webgl/renderer'
import { createAnchorHost } from './anchor-host'
import { canvasCapabilities, canvasSurface } from './canvas-surface'
import type { FrameClock } from './environment'
import { createFlowWatch } from './flows'
import { FocusControl } from './focus-control'
import { createGraphCore, type HostParts, type PageApi, type PageControls } from './graph-core'
import type {
  GraphInstance,
  HostSurface,
  MountGraphOptions,
  RendererFactory,
} from './graph-instance'
import { KeyboardInput } from './keyboard-input'
import { LensControl } from './lens-control'
import { afterDestroy, FrameWaiters, graphElement, stillborn } from './page-lifecycle'
import { PointerInput } from './pointer-input'
import { reducedMotion } from './reduced-motion'
import { RenderHost } from './render-host'
import { hostSurfaceOf } from './surface-registry'

export type {
  ElementDatum,
  FitOptions,
  GraphBundling,
  GraphBundlingStatus,
  GraphCore,
  GraphCoreUpdateOptions,
  GraphCount,
  GraphCountOf,
  GraphElement,
  GraphFocus,
  GraphGroups,
  GraphHistory,
  GraphInstance,
  GraphLayers,
  GraphLayout,
  GraphLayoutStatus,
  GraphOptions,
  GraphPositions,
  GraphRouting,
  GraphRoutingStatus,
  GraphSelection,
  GraphShapeCount,
  GraphShownCount,
  GraphShownShapeCount,
  GraphSize,
  GraphState,
  GraphStates,
  GraphStore,
  GraphSurface,
  GraphTime,
  GraphUpdateOptions,
  GraphView,
  HostDriver,
  HostSurface,
  LayoutComputeOptions,
  LayoutOthers,
  LayoutRunOptions,
  MountGraphOptions,
  PositionResetOptions,
  PositionSnapshotOptions,
  RendererFactory,
  SurfaceCamera,
  SurfaceCapabilities,
  ViewOptions,
} from './graph-instance'

type Listeners = ReadonlyArray<readonly [string, (event: never) => void]>

const visuallyHidden =
  'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap'

function listen(target: EventTarget, listeners: Listeners, on: boolean): void {
  for (const [name, listener] of listeners) {
    if (on) target.addEventListener(name, listener as EventListener)
    else target.removeEventListener(name, listener as EventListener)
  }
}

const pageWork: LayoutWork = Object.freeze({ slice: 8, workers: true })

const frames: FrameClock = {
  request: (frame) => requestAnimationFrame(frame),
  cancel: (request) => cancelAnimationFrame(request),
}

export function createGraphHost<S extends string = string, M extends Mark = Mark>(
  container: HTMLElement,
  options: MountGraphOptions<S, M>,
  createRenderer: RendererFactory,
  home: HostSurface = canvasSurface(),
): GraphInstance<S, M> {
  const element = graphElement(options.ariaLabel)
  const announcer = document.createElement('div')
  announcer.setAttribute('aria-live', 'polite')
  announcer.style.cssText = visuallyHidden
  element.append(announcer)
  const colors = new ThemeResolver(element)
  const textWidths = createTextWidths(defaultFont)
  let parts: HostParts
  let render: RenderHost
  let pointer: PointerInput
  let elementListeners: Listeners = []
  let windowListeners: Listeners = []

  function open(given: HostParts): PageControls {
    parts = given
    const { views, camera, emitter, bundles, state, patch, definition, request, destroyed } = given
    render = new RenderHost(
      {
        ...given,
        createRenderer,
        colors,
        textWidths,
        paths: () => bundles.paths,
        pixelRatio: () => definition().pixelRatio,
      },
      options.suspended === true,
      options.keepFrame !== false,
    )
    render.adoptLimits()
    const anchors = createAnchorHost({
      ...given,
      element,
      canvas: () => given.surface().events,
      paths: bundles.paths,
    })
    const focus = new FocusControl({ ...given, element, announcer })
    const lens = new LensControl({
      ...given,
      element,
      viewport: () => views.viewport(),
      focusAt: () => focus.lensPoint(),
    })
    pointer = new PointerInput({ ...given, element, lens, focus })
    const keyboard = new KeyboardInput({
      ...given,
      element,
      focus,
      cancelLasso: () => pointer.cancelLasso(),
      tool: () => pointer.tool,
    })
    const waiters = new FrameWaiters(
      () => given.due() || !render.renderer || render.contextLost || !!render.renderer.holding?.(),
    )

    function suspend(): void {
      if (destroyed() || render.suspended) return
      if (given.surface().ownCanvas) {
        pointer.abandon()
        if (destroyed()) return
        lens.leave()
        if (destroyed() || render.suspended) return
      }
      const draw = render.suspend()
      patch({ suspended: true })
      if (destroyed()) return
      emitter.emit('suspendchange', { suspended: true })
      if (destroyed() || !render.suspended || !draw) return
      if (given.framing()) {
        request()
        return
      }
      given.drawNow()
      if (!destroyed()) render.released()
    }

    function resume(): void {
      if (destroyed()) return
      if (!render.suspended) {
        render.recover()
        return
      }
      render.resume()
      patch({ suspended: false })
      if (destroyed()) return
      emitter.emit('suspendchange', { suspended: false })
    }

    const api: PageApi = {
      element,
      anchors: anchors.anchors,
      focus: {
        get: () => state().focused,
        set: (next) => {
          given.prepare()
          const resolved = next ? given.target(next.kind, next.key) : null
          if (next && (!resolved || given.concealed(resolved))) return
          focus.remembered = null
          focus.set(resolved, 'api')
          if (destroyed()) return
          if (resolved && definition().interaction.keyboard) {
            element.focus({ preventScroll: true })
          }
        },
      },
      lens: {
        get: () => lens.shown,
        set: (input) => lens.set(input),
        toWorld: (point) => toWorld(camera.viewAt(point), views.viewport(), point),
      },
      get drawsOnMap() {
        return given.surface().onMap
      },
      drawn: () => waiters.wait(),
      suspend,
      resume,
    }

    return {
      start() {
        render.watch(element)
        const flows = createFlowWatch({
          ...given,
          element,
          version: given.sceneVersion,
          wake: request,
          paths: bundles.paths,
        })
        pointer.listen(given.surface().events)
        render.listen(given.surface())
        elementListeners = [
          ['keydown', keyboard.onKeyDown],
          ['focus', focus.onFocus],
          ['blur', focus.onBlur],
        ]
        listen(element, elementListeners, true)
        windowListeners = [
          ['keydown', lens.onKeyDown],
          ['keyup', lens.onKeyUp],
          ['blur', lens.onBlur],
        ]
        listen(window, windowListeners, true)
        focus.applyKeyboard()
        return flows
      },
      render,
      pointer,
      focus,
      lens,
      anchors,
      waiters,
      api,
    }
  }

  return createGraphCore(
    options,
    { home, colors, textWidths, still: reducedMotion, work: pageWork, quiet: 150, frames },
    {
      createRenderer,
      place: (surface) => surface.place(element, container),
      unplace: (surface) => surface.unplace(element),
      open,
      focused: () => document.activeElement === element,
      focus: () => element.focus({ preventScroll: true }),
      measure() {
        const box = element.getBoundingClientRect()
        if (box.width > 0 && box.height > 0) return { width: box.width, height: box.height }
        return parts.state()
      },
      unlisten() {
        pointer.unlisten()
        render.unlisten()
        listen(element, elementListeners, false)
        listen(window, windowListeners, false)
      },
      remove: () => element.remove(),
      update(next) {
        if (next.ariaLabel !== undefined) element.setAttribute('aria-label', next.ariaLabel)
        if (next.keepFrame !== undefined) render.keepsFrame = next.keepFrame
      },
      dead: (store, signal, reason, shaped) => afterDestroy(store, element, signal, reason, shaped),
      title: () => element.getAttribute('aria-label'),
    },
  ) as GraphInstance<S, M>
}

/**
 * Mounts a graph into `container` and returns its instance. The graph fills the container: give the
 * container a size.
 */
export function mountGraph<S extends string = string, M extends Mark = Mark>(
  container: HTMLElement,
  options: MountGraphOptions<S, M>,
): GraphInstance<S, M> {
  if (options.signal?.aborted) {
    return stillborn(options, options.signal, hostSurfaceOf(options.surface) ?? canvasCapabilities)
  }
  return createGraphHost(container, options, createWebglRenderer)
}
