function list(names: readonly string[]): string {
  return names.length <= 2 ? names.join(' and ') : `${names.length} nodes`
}

export const messages = {
  graphLabel: 'Graph whose node positions are saved to a slow server',
  server: (refusing: boolean) => (refusing ? 'Server: refuses' : 'Server: accepts'),
  idle: 'Drag a node: its ring shows a write in flight.',
  saving: (names: readonly string[]) => `Saving ${list(names)}…`,
  saved: (names: readonly string[]) => `Saved ${list(names)}.`,
  refused: (names: readonly string[]) => `The server refused ${list(names)}: rolled back.`,
} as const
