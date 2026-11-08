import { defineGraph, edges, type GraphInstance, mountGraph, nodes, raw } from '@bruno00o/graph'
import {
  detectFormat,
  type FileEdge,
  type FileNode,
  FormatError,
  type GraphFile,
  readCsv,
  readGexf,
  readGraphml,
  readJsonGraph,
  writeCsv,
  writeGexf,
  writeGraphml,
  writeJsonGraph,
} from '@bruno00o/graph/formats'
import { force } from '@bruno00o/graph/layouts/force'
import { messages } from './messages'
import { csv, gexf, graphml, jsonGraph } from './samples'
import '../shared/overlays.css'
import './file-formats.css'

type Sample = 'graphml' | 'gexf' | 'json-graph' | 'csv'

const samples: Record<Sample, () => GraphFile> = {
  graphml: () => readGraphml(graphml),
  gexf: () => readGexf(gexf),
  'json-graph': () => readJsonGraph(jsonGraph),
  csv: () => readCsv(csv),
}

function readText(text: string): GraphFile {
  switch (detectFormat(text)) {
    case 'graphml':
      return readGraphml(text)
    case 'gexf':
      return readGexf(text)
    case 'json-graph':
      return readJsonGraph(text)
    case 'csv':
      return readTable(text)
    default:
      throw new Error(messages.unknownFormat)
  }
}

function readTable(text: string): GraphFile {
  try {
    return readCsv(text)
  } catch (error) {
    if (error instanceof FormatError) return readCsv({ nodes: text })
    throw error
  }
}

function categoryOf(file: GraphFile): string | undefined {
  for (const node of file.nodes) {
    const name = Object.keys(node.attributes)[0]
    if (name !== undefined) return name
  }
  return undefined
}

function define(file: GraphFile) {
  const colored = file.nodes.some((node) => node.color !== undefined)
  const sized = file.nodes.some((node) => node.size !== undefined)
  const weighted = file.edges.some((edge) => edge.weight !== undefined)
  const category = categoryOf(file)
  return defineGraph({
    marks: [
      edges<FileEdge>(file.edges, {
        source: 'source',
        target: 'target',
        arrow: (edge) => (edge.directed ? 'target' : 'none'),
        width: weighted ? (edge) => edge.weight ?? 1 : 1.5,
        color: raw((edge) => edge.color ?? 'var(--graph-edge)'),
      }),
      nodes<FileNode>(file.nodes, {
        label: (node) => node.label ?? node.id,
        parent: 'parent',
        x: 'x',
        y: 'y',
        color: colored
          ? raw((node) => node.color ?? 'var(--graph-node)')
          : (node) => String(category === undefined ? '' : node.attributes[category]),
        size: sized ? raw((node) => node.size ?? 16) : 22,
      }),
    ],
    scales: { width: { range: [1, 4] } },
    layout: force(),
    view: { autoFit: 'layouts', padding: { top: 72, right: 32, bottom: 104, left: 32 } },
  })
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', onClick)
  return element
}

function download(name: string, text: string, type: string) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([text], { type }))
  link.download = name
  link.click()
  URL.revokeObjectURL(link.href)
}

export function mount(container: HTMLElement): GraphInstance {
  let file = samples.gexf()
  const graph = mountGraph(container, { definition: define(file), ariaLabel: messages.graphLabel })

  const status = document.createElement('output')
  status.className = 'example-status file-status'
  status.setAttribute('aria-live', 'polite')
  status.textContent = messages.loaded(
    messages.sampleFile.gexf,
    file.nodes.length,
    file.edges.length,
    file.issues.length,
  )

  const show = (next: GraphFile, name: string) => {
    file = next
    graph.update({ definition: define(next) })
    graph.view.fit()
    status.textContent = messages.loaded(
      name,
      next.nodes.length,
      next.edges.length,
      next.issues.length,
    )
  }

  const open = async (picked: File) => {
    try {
      show(readText(await picked.text()), picked.name)
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error)
    }
  }

  const sampleButtons = (Object.keys(samples) as Sample[]).map((sample) => {
    const element = button(messages.samples[sample], () => {
      show(samples[sample](), messages.sampleFile[sample])
      for (const other of sampleButtons)
        other.setAttribute('aria-pressed', String(other === element))
    })
    element.setAttribute('aria-pressed', String(sample === 'gexf'))
    return element
  })

  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.graphml,.gexf,.json,.csv,.xml,.txt'
  input.hidden = true
  input.addEventListener('change', () => {
    const picked = input.files?.[0]
    if (picked) void open(picked)
    input.value = ''
  })

  const positions = () => graph.positions.snapshot()
  const exports = document.createElement('div')
  exports.className = 'example-actions file-exports'
  const saveAs = document.createElement('span')
  saveAs.textContent = messages.saveAs
  exports.append(
    saveAs,
    button(messages.samples.graphml, () =>
      download('graph.graphml', writeGraphml(file, { positions: positions() }), 'application/xml'),
    ),
    button(messages.samples.gexf, () =>
      download('graph.gexf', writeGexf(file, { positions: positions() }), 'application/xml'),
    ),
    button(messages.samples['json-graph'], () =>
      download('graph.json', writeJsonGraph(file, { positions: positions() }), 'application/json'),
    ),
    button(messages.samples.csv, () => {
      const tables = writeCsv(file, { positions: positions() })
      download('nodes.csv', tables.nodes, 'text/csv')
      download('edges.csv', tables.edges, 'text/csv')
    }),
  )

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.open, () => input.click()),
    ...sampleButtons,
    input,
  )

  container.addEventListener('dragover', (event) => {
    event.preventDefault()
    container.classList.add('file-drop')
  })
  container.addEventListener('dragleave', (event) => {
    if (event.target === container) container.classList.remove('file-drop')
  })
  container.addEventListener('drop', (event) => {
    event.preventDefault()
    container.classList.remove('file-drop')
    const picked = event.dataTransfer?.files[0]
    if (picked) void open(picked)
  })

  container.append(actions, exports, status)
  return graph
}
