import type { GraphData, LiveSource } from '../types'

export function isLiveSource<T>(data: GraphData<T>): data is LiveSource<T> {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as Partial<LiveSource<T>>).subscribeChanges === 'function'
  )
}
