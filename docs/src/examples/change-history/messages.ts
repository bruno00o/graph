import type { ChangeKind } from './history'

const date = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  hour: 'numeric',
  minute: 'numeric',
})

const kinds: Readonly<Record<string, string>> = {
  added: 'Added',
  changed: 'Changed',
  removed: 'Removed',
}

export const messages = {
  graphLabel: (members: number, changes: number) =>
    `Graph of ${members} nodes replayed over ${changes} changes in thirty days`,
  timeline: 'History of the changes',
  labels: {
    play: 'Replay',
    cursor: 'Moment shown',
    kinds: 'Kinds of change shown',
  },
  kind: (kind: string) => kinds[kind] ?? kind,
  moment: (time: number) => date.format(time),
  everything: 'Every node',
  pick: 'Click the bar to choose a moment.',
  quiet: 'No change at this moment.',
  change: (kind: ChangeKind, node: string) => `${kinds[kind] ?? kind} ${node}`,
} as const
