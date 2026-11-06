export const defaultFlowSpeed = 40

export function flowSpeed(value: unknown): number {
  if (value === true) return defaultFlowSpeed
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return 0
}
