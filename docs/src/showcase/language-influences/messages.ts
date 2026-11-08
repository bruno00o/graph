const numbers = new Intl.NumberFormat('en-US')

export function count(value: number): string {
  return numbers.format(value)
}

function plural(value: number, one: string, many: string): string {
  return `${count(value)} ${value === 1 ? one : many}`
}

export const dataAttribution = {
  before: 'Data: ',
  name: 'Wikidata',
  url: 'https://www.wikidata.org',
  licenseText: 'CC0 1.0',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  after: ', retrieved 2026-11-08. A snapshot of a database that keeps changing.',
} as const

export const messages = {
  graphLabel: (languages: number, influences: number) =>
    `${count(languages)} programming languages and ${count(influences)} influences between them`,
  loading: 'Loading the languages',
  failed: 'The data could not be loaded.',
  retry: 'Try again',
  panel: 'Controls',
  timeline: 'Timeline of the creation years of the languages',
  timelineLabels: {
    play: 'Play',
    start: 'Start of the window',
    end: 'End of the window',
    window: 'Window',
    range: (start: string, end: string) => `from ${start} to ${end}`,
  },
  legend: {
    title: 'Main paradigm',
    label: 'Legend of the main paradigms',
  },
  paradigm: {
    none: 'No paradigm listed',
    other: 'Other paradigms',
  },
  search: {
    title: 'Find a language',
    label: 'Language name',
    placeholder: 'Python, Lisp, Rust',
    none: 'No language matches.',
    results: 'Matching languages',
    result: (year: number | null) => (year === null ? 'No year' : String(year)),
  },
  lineage: {
    title: 'Lineage',
    depth: 'Depth',
    depths: { 1: 'Direct influences', 2: 'Two steps', 3: 'Three steps', all: 'All the way' },
    summary: (before: number, after: number) =>
      `${plural(before, 'language', 'languages')} behind it, ${plural(after, 'language', 'languages')} after it.`,
    hint: 'Select a language to follow what shaped it and what it shaped.',
    alone: 'Lay out the lineage alone',
    ancestors: 'Influenced by',
    descendants: 'Influenced',
  },
  view: {
    title: 'View',
    layout: 'Layout',
    layouts: { layers: 'Layers', force: 'Forces' },
    direction: 'Direction',
    directions: { down: 'Top to bottom', right: 'Left to right' },
    group: 'Group by main paradigm',
    foldAll: 'Fold all',
    unfoldAll: 'Unfold all',
    groupHint: 'Double-click a group to fold or unfold it.',
    mainHint:
      'A language takes the paradigm it shares with the most languages of the data set. The six commonest are colored; the rest are grouped as other.',
  },
  time: {
    title: 'Time',
    hint: (untimed: number) =>
      `Languages sit at the year they were created. The ${count(untimed)} languages with no year on Wikidata stay visible in every window.`,
    showAll: 'Show every year',
    range: (first: number, last: number) => `Years ${first} to ${last}.`,
  },
  details: {
    title: 'Language',
    year: (year: number | null) => (year === null ? 'No year on Wikidata' : `Created in ${year}`),
    paradigms: 'Paradigms',
    noParadigms: 'None listed',
    ancestors: (value: number) => `Influenced by (${count(value)})`,
    descendants: (value: number) => `Influenced (${count(value)})`,
    none: 'None',
    wikidata: 'Open on Wikidata',
    unnamed: 'This item has no English label on Wikidata, so its identifier stands for its name.',
    group: (name: string, languages: number) =>
      `${name}: ${plural(languages, 'language', 'languages')}`,
  },
  tooltip: {
    year: (year: number | null) => (year === null ? 'No year' : String(year)),
    links: (before: number, after: number) => `${before} behind it, ${after} after it`,
  },
  status: {
    shown: (languages: number, influences: number) =>
      `${plural(languages, 'language', 'languages')}, ${plural(influences, 'influence', 'influences')}`,
    alone: (languages: number, influences: number) =>
      `${plural(languages, 'language', 'languages')}, ${plural(influences, 'influence', 'influences')} in this lineage`,
    hint: 'Click a language to follow its lineage. Double-click a group to fold or unfold it.',
  },
  actions: {
    fit: 'Fit',
    clear: 'Clear',
  },
} as const
