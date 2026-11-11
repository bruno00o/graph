import type { AnyIssue, ShapeIssue } from '../core/issues'
import { chartFrames, type GraphReport } from './inspector'
import { defaultMessages, type GraphDevtoolsMessages } from './messages'

export const frameBudget: number = 1000 / 60
export const rateWindow = 1000
const svgNamespace = 'http://www.w3.org/2000/svg'
const slot = 3
const chartHeight = 40

const styles = `
.graph-devtools{--gd-ink:#191d22;--gd-muted:#5b6167;--gd-line:#191d2229;--gd-bar:#7f858c;--gd-accent:#c93700;color-scheme:light;box-sizing:border-box;height:100%;overflow:auto;padding:12px;color:var(--gd-ink);font-size:12px;line-height:1.5}
.graph-devtools[data-theme=dark]{--gd-ink:#efeeeb;--gd-muted:#a6abb1;--gd-line:#efeeeb2e;--gd-bar:#6f757b;--gd-accent:#fa8054;color-scheme:dark}
.graph-devtools *{box-sizing:border-box}
.graph-devtools [hidden]{display:none!important}
.graph-devtools .gd-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:0 0 12px}
.graph-devtools .gd-name{min-width:0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.graph-devtools label{display:flex;align-items:center;gap:6px;color:var(--gd-muted)}
.graph-devtools select{font:inherit;color:var(--gd-ink);background:transparent;border:1px solid var(--gd-line);border-radius:4px;padding:2px 6px;max-width:320px}
.graph-devtools .gd-empty{margin:0;color:var(--gd-muted)}
.graph-devtools .gd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.graph-devtools section{min-width:0;border:1px solid var(--gd-line);border-radius:6px;padding:8px 10px}
.graph-devtools h3{margin:0 0 6px;color:var(--gd-muted);font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}
.graph-devtools dl{margin:0}
.graph-devtools .gd-row{display:flex;justify-content:space-between;gap:12px}
.graph-devtools dt{flex:none;color:var(--gd-muted)}
.graph-devtools dd{min-width:0;margin:0;text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.graph-devtools ul{margin:6px 0 0;padding:0;list-style:none}
.graph-devtools li{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.graph-devtools .gd-chart{display:block;width:100%;height:${chartHeight}px;margin:8px 0 2px}
.graph-devtools .gd-chart rect{fill:var(--gd-bar)}
.graph-devtools .gd-chart rect[data-over]{fill:var(--gd-accent)}
.graph-devtools .gd-chart line{stroke:var(--gd-muted);stroke-width:1;stroke-dasharray:3 3}
.graph-devtools .gd-note{margin:0 0 6px;color:var(--gd-muted);font-size:11px}
`

type Value = (report: GraphReport, now: number) => string

interface Field {
  readonly node: HTMLElement
  readonly value: Value
}

interface List {
  readonly node: HTMLUListElement
  readonly items: (report: GraphReport) => readonly string[]
}

export interface PanelView {
  update(reports: readonly GraphReport[], selected: number | null, now: number): void
}

function create<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

function setText(node: Node, text: string): void {
  if (node.textContent !== text) node.textContent = text
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function createView(
  root: HTMLElement,
  messages: GraphDevtoolsMessages,
  select: (id: number) => void,
): PanelView {
  const fields: Field[] = []
  const lists: List[] = []
  const style = create('style')
  style.textContent = styles
  const head = create('div', 'gd-head')
  const picker = create('label')
  picker.append(messages.graph)
  const choice = create('select')
  choice.addEventListener('change', () => select(Number(choice.value)))
  picker.append(choice)
  const name = create('span', 'gd-name')
  head.append(picker, name)
  const empty = create('p', 'gd-empty', messages.empty)
  const grid = create('div', 'gd-grid')
  root.append(style, head, empty, grid)

  const ms = (value: number | null) =>
    value === null ? messages.notMeasured : messages.duration(value)

  function section(title: string): HTMLElement {
    const node = create('section')
    node.append(create('h3', '', title))
    grid.append(node)
    return node
  }

  function rows(parent: HTMLElement, entries: ReadonlyArray<readonly [string, Value]>): void {
    const list = create('dl')
    for (const [label, value] of entries) {
      const row = create('div', 'gd-row')
      const node = create('dd')
      row.append(create('dt', '', label), node)
      list.append(row)
      fields.push({ node, value })
    }
    parent.append(list)
  }

  function items(parent: HTMLElement, read: List['items']): void {
    const node = create('ul')
    parent.append(node)
    lists.push({ node, items: read })
  }

  const timings = section(messages.performance)
  rows(timings, [
    [
      messages.frameRate,
      (report, now) =>
        now - report.performance.lastFrame < rateWindow
          ? messages.framesPerSecond(report.performance.frameRate)
          : messages.idle,
    ],
    [
      messages.frame,
      ({ performance: { frames } }) => ms(frames.length === 0 ? null : (frames.at(-1) ?? null)),
    ],
  ])
  const chart = document.createElementNS(svgNamespace, 'svg')
  chart.setAttribute('class', 'gd-chart')
  chart.setAttribute('role', 'img')
  chart.setAttribute('viewBox', `0 0 ${chartFrames * slot} ${chartHeight}`)
  chart.setAttribute('preserveAspectRatio', 'none')
  const bars = Array.from({ length: chartFrames }, (_, index) => {
    const bar = document.createElementNS(svgNamespace, 'rect')
    bar.setAttribute('x', String(index * slot))
    bar.setAttribute('width', String(slot - 1))
    bar.append(document.createElementNS(svgNamespace, 'title'))
    chart.append(bar)
    return bar
  })
  const budgetLine = document.createElementNS(svgNamespace, 'line')
  budgetLine.setAttribute('x1', '0')
  budgetLine.setAttribute('x2', String(chartFrames * slot))
  budgetLine.setAttribute('vector-effect', 'non-scaling-stroke')
  chart.append(budgetLine)
  const note = create('p', 'gd-note')
  fields.push({
    node: note,
    value: ({ performance: { frames } }) =>
      messages.frameNote(
        frames.length,
        mean(frames),
        frames.length === 0 ? 0 : Math.max(...frames),
        frameBudget,
      ),
  })
  timings.append(chart, note)
  rows(timings, [
    [messages.flush, (report) => ms(report.performance.flush)],
    [messages.apply, (report) => ms(report.performance.apply)],
    [messages.sync, (report) => ms(report.performance.sync)],
    [messages.render, (report) => ms(report.performance.render)],
    [messages.labelSelection, (report) => ms(report.performance.labelTime)],
    [
      messages.labelsDrawn,
      ({ performance: { nodeLabels, edgeLabels } }) =>
        nodeLabels === null || edgeLabels === null
          ? messages.unknown
          : messages.labelCounts(nodeLabels, edgeLabels),
    ],
    [
      messages.textureMemory,
      ({ performance: { textureBytes } }) =>
        textureBytes === null ? messages.unknown : messages.bytes(textureBytes),
    ],
  ])

  const elements = section(messages.elements)
  rows(elements, [
    [messages.nodes, (report) => messages.number(report.nodes)],
    [messages.edges, (report) => messages.number(report.edges)],
    [messages.pendingEdges, (report) => messages.number(report.pendingEdges)],
    [messages.shapes ?? defaultMessages.shapes ?? '', (report) => messages.number(report.shapes)],
    [messages.issues, (report) => messages.number(report.issueCount)],
  ])
  const shapeIssue = messages.shapeIssue ?? defaultMessages.shapeIssue
  const describe = (issue: AnyIssue) =>
    issue.kind === 'shapes'
      ? (shapeIssue?.(issue as ShapeIssue) ?? '')
      : messages.issue(issue as Exclude<AnyIssue, ShapeIssue>)
  items(elements, (report) => report.issues.map(describe))

  const view = section(messages.view)
  rows(view, [
    [messages.center, ({ view: { x, y } }) => messages.point(x, y)],
    [messages.zoom, ({ view: { zoom } }) => messages.number(zoom)],
    [messages.size, ({ width, height }) => messages.dimensions(width, height)],
  ])

  const target = (value: GraphReport['hovered']) =>
    value
      ? value.kind === 'shape'
        ? messages.shapeTarget(value.key)
        : messages.target(value.kind, value.key)
      : messages.none
  const interaction = section(messages.interaction)
  rows(interaction, [
    [
      messages.selection,
      ({ selection }) => messages.elementCounts(selection.nodes.length, selection.edges.length),
    ],
    [messages.hovered, (report) => target(report.hovered)],
    [messages.focused, (report) => target(report.focused)],
  ])

  const states = section(messages.states)
  items(states, (report) =>
    report.states.length === 0
      ? [messages.noStates]
      : report.states.map(
          (state) => `${state.name}: ${messages.elementCounts(state.nodes, state.edges)}`,
        ),
  )

  const layout = section(messages.layout)
  rows(layout, [
    [
      messages.layout,
      ({ layout: { name, running, progress } }) =>
        running ? messages.running(name ?? messages.unknown, progress) : messages.idle,
    ],
  ])
  const runsTitle = create('p', 'gd-note', messages.lastRuns)
  layout.append(runsTitle)
  items(layout, (report) =>
    report.layout.runs.map((run) => messages.run(run.name, run.duration, run.completed)),
  )

  function drawChart(frames: readonly number[]): void {
    const top = Math.max(frameBudget * 1.5, ...frames)
    const offset = chartFrames - frames.length
    bars.forEach((bar, index) => {
      const value = frames[index - offset]
      const height = value === undefined ? 0 : Math.max(1, (value / top) * chartHeight)
      bar.setAttribute('y', String(chartHeight - height))
      bar.setAttribute('height', String(height))
      if (value !== undefined && value > frameBudget) bar.setAttribute('data-over', '')
      else bar.removeAttribute('data-over')
      setText(bar.firstChild as Node, value === undefined ? '' : messages.duration(value))
    })
    const y = String(chartHeight - (frameBudget / top) * chartHeight)
    budgetLine.setAttribute('y1', y)
    budgetLine.setAttribute('y2', y)
    const max = frames.length === 0 ? 0 : Math.max(...frames)
    chart.setAttribute('aria-label', messages.frameChart(frames.length, max))
  }

  function syncChoices(reports: readonly GraphReport[], current: GraphReport): void {
    picker.hidden = reports.length < 2
    const options = reports.map((report, index) => messages.graphName(index + 1, report.label))
    const existing = [...choice.options].map((option) => option.textContent)
    if (existing.join('\n') !== options.join('\n')) {
      choice.replaceChildren(
        ...reports.map((report, index) => {
          const option = create('option', '', options[index])
          option.value = String(report.id)
          return option
        }),
      )
    }
    if (choice.value !== String(current.id)) choice.value = String(current.id)
  }

  return {
    update(reports, selected, now) {
      const current = reports.find((report) => report.id === selected) ?? reports[0]
      empty.hidden = current !== undefined
      head.hidden = current === undefined
      grid.hidden = current === undefined
      if (!current) return
      syncChoices(reports, current)
      setText(name, messages.graphName(reports.indexOf(current) + 1, current.label))
      for (const field of fields) setText(field.node, field.value(current, now))
      for (const list of lists) {
        const texts = list.items(current)
        const shown = [...list.node.children].map((child) => child.textContent)
        if (shown.join('\n') === texts.join('\n')) continue
        list.node.replaceChildren(...texts.map((text) => create('li', '', text)))
      }
      runsTitle.hidden = current.layout.runs.length === 0
      drawChart(current.performance.frames)
    },
  }
}
