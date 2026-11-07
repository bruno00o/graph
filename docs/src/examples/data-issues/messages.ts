const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

export const messages = {
  graphLabel: 'Graph of three groups whose data holds a few problems',
  reportLabel: 'Problems in the data, as graph.issues() lists them',
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
  cleaned: 'Clean data: graph.issues() is empty.',
  summary: (issues: number, pending: number) =>
    `${plural(issues, 'problem', 'problems')}, ${plural(pending, 'edge waits', 'edges wait')} for an end`,
  missingKey: (kind: string) => `An item of the ${kind} has no key: it is skipped.`,
  duplicateKey: (kind: string, key: string) =>
    `Key ${key} is held twice in the ${kind}: the first item wins.`,
  missingParent: (key: string, parent: string) =>
    `Node ${key} names parent ${parent}, which is not there: it stays at the top level.`,
  parentCycle: (key: string, parent: string) =>
    `Node ${key} names parent ${parent}, which it contains: it stays at the top level.`,
  missingCarrier: (key: string, carrier: string) =>
    `Edge ${key} is carried by ${carrier}, which is not there.`,
} as const
