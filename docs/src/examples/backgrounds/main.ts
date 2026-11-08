import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'
import '../shared/controls.css'
import './backgrounds.css'

type Grid = keyof typeof messages.grids
type Levels = keyof typeof messages.levels
type Tone = keyof typeof messages.tones
type Major = keyof typeof messages.majors
type Page = keyof typeof messages.pages

interface Settings {
  grid: Grid
  levels: Levels
  spacing: number
  color: Tone
  major: Major
  page: Page
}

const tones: Record<Tone, string | undefined> = {
  theme: undefined,
  accent: 'var(--graph-accent)',
  ember: '#d9480f',
}

const { items, links } = createSample(120, 240, 5, 21, 0.05)

function majorColor(settings: Settings): string | undefined {
  if (settings.major === 'same') return tones[settings.color] ?? 'var(--graph-grid)'
  if (settings.major === 'accent') return 'var(--graph-accent)'
  return undefined
}

function definitionOf(settings: Settings) {
  return defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to', opacity: 0.6 }),
      nodes<Item>(items, {
        x: 'x',
        y: 'y',
        color: 'group',
        size: 'weight',
        label: { text: 'label', background: true },
      }),
    ],
    scales: { size: { range: [8, 20] } },
    background:
      settings.grid === 'none'
        ? null
        : {
            grid: settings.grid,
            spacing: settings.spacing,
            adaptive: settings.levels === 'adaptive',
            color: tones[settings.color],
            majorColor: majorColor(settings),
          },
    view: { padding: 48 },
  })
}

function choices<K extends string>(
  title: string,
  labels: Record<K, string>,
  current: K,
  choose: (key: K) => void,
): HTMLElement {
  const group = document.createElement('div')
  group.className = 'backgrounds-group'
  const heading = document.createElement('span')
  heading.textContent = title
  const row = document.createElement('div')
  row.className = 'backgrounds-row'
  const buttons = (Object.keys(labels) as K[]).map((key) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = labels[key]
    button.setAttribute('aria-pressed', String(key === current))
    button.addEventListener('click', () => {
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === button))
      choose(key)
    })
    return button
  })
  row.append(...buttons)
  group.append(heading, row)
  return group
}

export function mount(container: HTMLElement): GraphInstance {
  const settings: Settings = {
    grid: 'lines',
    levels: 'adaptive',
    spacing: 16,
    color: 'theme',
    major: 'theme',
    page: 'paper',
  }
  container.classList.add('backgrounds-stage')
  container.setAttribute('data-page', settings.page)
  const graph = mountGraph(container, {
    definition: definitionOf(settings),
    ariaLabel: messages.graphLabel(items.length, links.length),
  })
  const redraw = () => graph.update({ definition: definitionOf(settings) })

  const panel = document.createElement('div')
  panel.className = 'example-panel example-sliders backgrounds-panel'
  const caption = document.createElement('span')
  caption.textContent = messages.spacing(settings.spacing)
  const range = document.createElement('input')
  range.type = 'range'
  range.min = '4'
  range.max = '64'
  range.step = '4'
  range.value = String(settings.spacing)
  range.setAttribute('aria-label', messages.spacingLabel)
  range.addEventListener('input', () => {
    settings.spacing = range.valueAsNumber
    caption.textContent = messages.spacing(settings.spacing)
    redraw()
  })
  const spacing = document.createElement('label')
  spacing.append(caption, range)

  panel.append(
    choices(messages.gridTitle, messages.grids, settings.grid, (key) => {
      settings.grid = key
      redraw()
    }),
    choices(messages.levelsTitle, messages.levels, settings.levels, (key) => {
      settings.levels = key
      redraw()
    }),
    spacing,
    choices(messages.colorTitle, messages.tones, settings.color, (key) => {
      settings.color = key
      redraw()
    }),
    choices(messages.majorTitle, messages.majors, settings.major, (key) => {
      settings.major = key
      redraw()
    }),
    choices(messages.pageTitle, messages.pages, settings.page, (key) => {
      settings.page = key
      container.setAttribute('data-page', key)
    }),
  )
  container.append(panel)
  return graph
}
