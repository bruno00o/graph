import type { Point } from '../types'
import type { GraphTarget } from './events'

export interface ToolPointer {
  readonly event: PointerEvent
  readonly point: Point
  readonly hit: GraphTarget | null
}

export interface PointerTool {
  down(pointer: ToolPointer): boolean
  move(pointer: ToolPointer): void
  up(pointer: ToolPointer, cancelled: boolean): boolean
  cursor(pointer: ToolPointer): string | null
  key(event: KeyboardEvent): boolean
}
