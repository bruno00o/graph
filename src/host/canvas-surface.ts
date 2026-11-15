import type { HostSurface, SurfaceCapabilities } from './graph-instance'

const elementStyle =
  'position:relative;width:100%;height:100%;overflow:hidden;outline:none;outline-offset:-2px'
const canvasStyle =
  'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none'

export const canvasCapabilities: SurfaceCapabilities = Object.freeze({
  name: 'canvas',
  ownCanvas: true,
  ownCamera: true,
  viewGestures: true,
  layouts: true,
  lens: true,
  minimap: true,
  onMap: false,
  screenPadding: false,
  groupFillOpacity: null,
})

function nothing(): void {}

export function canvasSurface(): HostSurface {
  const canvas = document.createElement('canvas')
  canvas.style.cssText = canvasStyle
  return {
    ...canvasCapabilities,
    events: canvas,
    place: (element, container) => {
      element.style.cssText = elementStyle
      canvas.style.display = 'block'
      if (canvas.parentNode !== element) element.prepend(canvas)
      if (element.parentNode !== container) container.append(element)
    },
    unplace: () => {
      canvas.style.display = 'none'
      canvas.style.cursor = ''
    },
    camera: () => null,
    schedule: (frame) => requestAnimationFrame(frame),
    cancel: (request) => cancelAnimationFrame(request),
    claim: nothing,
    hover: nothing,
    move: nothing,
    adapt: (definition) => definition,
    bind: nothing,
    release: nothing,
  }
}
