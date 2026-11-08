const numbers = new Intl.NumberFormat('en-US')

export function count(value: number): string {
  return numbers.format(value)
}

function plural(value: number, one: string, many: string): string {
  return `${count(value)} ${value === 1 ? one : many}`
}

export const dataAttribution = {
  before: 'Data: ',
  name: 'OpenAlex',
  url: 'https://openalex.org',
  licenseText: 'CC0 1.0',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  retrieved: (date: string) => `, retrieved ${date}`,
  snapshot: 'A snapshot of a database that keeps changing.',
} as const

export const messages = {
  graphLabel: (works: number, citations: number) =>
    `${count(works)} research works and ${count(citations)} citations between them`,
  loading: 'Loading the works',
  failed: 'The data could not be loaded.',
  retry: 'Try again',
  panel: 'Controls',
  timeline: 'Timeline of the publication years of the works',
  timelineLabels: {
    play: 'Play',
    start: 'Start of the window',
    end: 'End of the window',
    window: 'Window',
    range: (start: string, end: string) => `from ${start} to ${end}`,
  },
  search: {
    title: 'Find a work',
    label: 'Title or first author',
    placeholder: 'A title or an author',
    none: 'No work matches.',
    results: 'Matching works',
    result: (work: { readonly year: number | null; readonly author: string | null }) =>
      work.year === null ? (work.author ?? '') : `${work.author ?? ''} ${work.year}`.trim(),
  },
  neighborhood: {
    title: 'Neighborhood',
    depth: 'Depth',
    depths: { 1: 'Direct citations', 2: 'Two steps' },
    summary: (outgoing: number, incoming: number) =>
      `${plural(outgoing, 'work', 'works')} it cites, ${plural(incoming, 'work', 'works')} that cite it.`,
    hint: 'Select a work to highlight what it cites and what cites it.',
    cites: 'Cites',
    citedBy: 'Cited by',
  },
  path: {
    title: 'Citation path',
    from: 'From',
    to: 'To',
    placeholderFrom: 'A work the chain starts from',
    placeholderTo: 'A work the chain reaches',
    hint: 'Search two works and trace the citation chain between them.',
    find: 'Find the path',
    none: 'No citation path joins them in this data set.',
    steps: (count: number) => `${plural(count, 'step', 'steps')} through the citations`,
    nodes: 'Works on the path',
    missing: (side: 'from' | 'to') =>
      side === 'from' ? 'Pick the first work.' : 'Pick the second work.',
  },
  legend: {
    title: 'Publication year',
    label: 'Legend of the publication years',
    format: (value: string | number | boolean) => String(Math.round(Number(value))),
  },
  layout: {
    title: 'Layout',
    run: 'Lay out with forces',
    restore: 'Restore the saved layout',
    hint: 'The positions ship with the data. Lay out with forces for a fresh shape.',
    running: 'The forces run, on the graphic card when one is available.',
    done: (seconds: string) => `The forces laid the graph out in ${seconds} seconds.`,
    stopped: 'The last run was stopped before it completed.',
  },
  time: {
    title: 'Time',
    hint: (untimed: number) =>
      `Works sit at their publication year. The ${count(untimed)} works with no year on OpenAlex stay visible in every window.`,
    showAll: 'Show every year',
    range: (first: number, last: number) => `Years ${first} to ${last}.`,
  },
  details: {
    title: 'Work',
    year: (year: number | null) => (year === null ? 'No year on OpenAlex' : `Published in ${year}`),
    author: (author: string | null) =>
      author === null ? 'No author listed' : `First author: ${author}`,
    citations: (value: number) => `Citations on OpenAlex: ${count(value)}`,
    outgoing: (value: number) => `References in the data set (${count(value)})`,
    incoming: (value: number) => `Cited by in the data set (${count(value)})`,
    none: 'None',
    openalex: 'Open on OpenAlex',
    workLink: (id: string) => `https://openalex.org/${id}`,
  },
  tooltip: {
    year: (year: number | null) => (year === null ? 'No year' : String(year)),
    author: (author: string | null) => author ?? '',
    citations: (value: number) => `${count(value)} citations on OpenAlex`,
  },
  status: {
    shown: (works: number, citations: number) =>
      `${plural(works, 'work', 'works')}, ${plural(citations, 'citation', 'citations')}`,
    hint: 'Click a work to trace its citations. Scroll to zoom, drag to move the view.',
  },
  actions: {
    fit: 'Fit',
    clear: 'Clear',
  },
  topic: (topic: string) => `Topic: ${topic}`,
} as const
