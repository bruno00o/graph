import type { BuiltInState, StateKindStyles, StateStyle } from '../types'

export const builtInStates: readonly BuiltInState[] = ['selected', 'hovered', 'focused']

export const maxFreeStates: number = 32 - builtInStates.length

export function isBuiltInState(name: string): name is BuiltInState {
  return (builtInStates as readonly string[]).includes(name)
}

export function freeStateNames(states: Readonly<Record<string, unknown>>): string[] {
  return Object.keys(states).filter((name) => !isBuiltInState(name))
}

export function byKind(value: StateStyle | StateKindStyles): value is StateKindStyles {
  return value.nodes !== undefined || value.edges !== undefined || value.shapes !== undefined
}

export function styleFor(
  value: StateStyle | StateKindStyles | undefined,
  kind: 'nodes' | 'edges' | 'shapes',
): StateStyle | undefined {
  if (value === undefined) return undefined
  return byKind(value) ? value[kind] : value
}
