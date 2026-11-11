import { formatNumber } from '../shared/messages'

export const messages = {
  between: (mode: 'members' | 'groups') =>
    `Between sectors: ${mode === 'groups' ? 'one line' : 'items'}`,
  fill: (percent: number) => `Sector fill: ${percent}%`,
  direction: (from: string, to: string, count: number) =>
    `${from} to ${to}: ${formatNumber(count)} ${count === 1 ? 'exchange' : 'exchanges'}, click to select this way only`,
} as const
