export const messages = {
  between: (mode: 'members' | 'groups') =>
    `Between sectors: ${mode === 'groups' ? 'one line' : 'items'}`,
  fill: (percent: number) => `Sector fill: ${percent}%`,
} as const
