import type { Point } from '../types'

export type KeyAction =
  | { readonly type: 'move'; readonly direction: Point }
  | { readonly type: 'pan'; readonly direction: Point }
  | { readonly type: 'activate'; readonly additive: boolean }
  | { readonly type: 'escape' }
  | { readonly type: 'zoom'; readonly factor: number }
  | { readonly type: 'fit' }

const arrows: Readonly<Record<string, Point>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
}

export const keyZoom = 1.5

export function keyAction(event: KeyboardEvent): KeyAction | null {
  if (event.altKey) return null
  const command = event.ctrlKey || event.metaKey
  const direction = arrows[event.key]
  if (direction) {
    if (command) return null
    return event.shiftKey ? { type: 'pan', direction } : { type: 'move', direction }
  }
  switch (event.key) {
    case 'Enter':
    case ' ':
      return { type: 'activate', additive: event.shiftKey || command }
    case 'Escape':
      return { type: 'escape' }
  }
  if (command) return null
  switch (event.key) {
    case '+':
    case '=':
      return { type: 'zoom', factor: keyZoom }
    case '-':
    case '_':
      return { type: 'zoom', factor: 1 / keyZoom }
    case '0':
      return { type: 'fit' }
  }
  return null
}
