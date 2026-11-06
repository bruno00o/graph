import type { ForceGraph, ForceSettings } from './simulation'

export type ToWorker =
  | { readonly type: 'start'; readonly graph: ForceGraph; readonly settings: ForceSettings }
  | { readonly type: 'pin'; readonly index: number; readonly x: number; readonly y: number }

export type FromWorker =
  | { readonly type: 'progress'; readonly xy: Float32Array; readonly progress: number }
  | { readonly type: 'end'; readonly xy: Float32Array }
