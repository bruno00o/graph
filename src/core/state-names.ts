export const builtInStates = ['selected', 'hovered', 'focused'] as const

export type BuiltInState = (typeof builtInStates)[number]

export const maxFreeStates: number = 32 - builtInStates.length

export function isBuiltInState(name: string): name is BuiltInState {
  return (builtInStates as readonly string[]).includes(name)
}

export function freeStateNames(states: Readonly<Record<string, unknown>>): string[] {
  return Object.keys(states).filter((name) => !isBuiltInState(name))
}
