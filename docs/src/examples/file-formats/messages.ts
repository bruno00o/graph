export const messages = {
  graphLabel: 'Graph read from a file, which can be saved in another format',
  open: 'Open a file',
  samples: {
    graphml: 'GraphML',
    gexf: 'GEXF',
    'json-graph': 'JSON Graph',
    csv: 'CSV',
  },
  sampleFile: {
    graphml: 'building.graphml',
    gexf: 'trees.gexf',
    'json-graph': 'rivers.json',
    csv: 'workshop.csv',
  },
  saveAs: 'Save as',
  unknownFormat: 'This file is not GraphML, GEXF, JSON Graph Format or CSV.',
  loaded: (name: string, nodes: number, edges: number, issues: number) =>
    `${name}: ${nodes} ${nodes === 1 ? 'node' : 'nodes'}, ${edges} ${edges === 1 ? 'edge' : 'edges'}${
      issues === 0 ? '' : `, ${issues} ${issues === 1 ? 'issue' : 'issues'}`
    }`,
} as const
