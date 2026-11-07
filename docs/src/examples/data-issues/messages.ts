export const messages = {
  graphLabel: 'Graph of three groups whose data holds a few problems',
  group: (name: string) => `Group ${name}`,
  copy: (label: string) => `Copy of ${label}`,
  stray: 'Stray node',
  late: 'Late node',
  fix: 'Add the missing nodes',
  clean: 'Remove the problems',
  break: 'Bring the problems back',
  broken:
    'Two duplicate keys, an edge to a node that is not there yet and a parent that is missing.',
  fixed: 'The late node and group D arrived: the waiting edge and the stray node found them.',
  cleaned: 'Clean data: the next flushes report nothing.',
} as const
