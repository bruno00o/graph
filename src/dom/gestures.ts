export interface PinchGesture {
  readonly factor: number
  readonly clientX: number | null
  readonly clientY: number | null
}

export interface PinchListener {
  start(): boolean
  change(gesture: PinchGesture): void
}

export interface PinchGestures {
  readonly active: boolean
  stop(): void
}

interface GestureLike extends Event {
  readonly scale?: unknown
  readonly clientX?: unknown
  readonly clientY?: unknown
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function listenPinch(target: EventTarget, listener: PinchListener): PinchGestures {
  let scale = 0
  const onStart = (event: Event) => {
    scale = 0
    if (!listener.start()) return
    event.preventDefault()
    const value = finite((event as GestureLike).scale)
    scale = value !== null && value > 0 ? value : 1
  }
  const onChange = (event: Event) => {
    if (scale === 0) return
    event.preventDefault()
    const gesture = event as GestureLike
    const value = finite(gesture.scale)
    if (value === null || value <= 0) return
    const factor = value / scale
    scale = value
    if (factor === 1) return
    listener.change({ factor, clientX: finite(gesture.clientX), clientY: finite(gesture.clientY) })
  }
  const onEnd = (event: Event) => {
    if (scale === 0) return
    event.preventDefault()
    scale = 0
  }
  const listeners = [
    ['gesturestart', onStart],
    ['gesturechange', onChange],
    ['gestureend', onEnd],
  ] as const
  for (const [name, handler] of listeners) target.addEventListener(name, handler)
  return {
    get active() {
      return scale !== 0
    },
    stop() {
      for (const [name, handler] of listeners) target.removeEventListener(name, handler)
      scale = 0
    },
  }
}
