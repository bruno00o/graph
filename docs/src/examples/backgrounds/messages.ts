export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${nodes} nodes and ${edges} edges on a configurable background`,
  gridTitle: 'Grid',
  grids: { none: 'None', lines: 'Lines', dots: 'Dots' },
  levelsTitle: 'Levels',
  levels: { adaptive: 'Adaptive', fixed: 'Fixed' },
  spacing: (value: number) => `Spacing: ${value} units`,
  spacingLabel: 'Grid spacing',
  colorTitle: 'Color',
  tones: { theme: 'Theme', accent: 'Accent', ember: 'Orange' },
  majorTitle: 'Major color',
  majors: { theme: 'Theme', accent: 'Accent', same: 'Same' },
  pageTitle: 'Page behind',
  pages: { paper: 'Paper', gradient: 'Gradient', stripes: 'Stripes', checks: 'Checks' },
} as const
