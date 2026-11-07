import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { type ExportRegion, exportPng, type PngExportOptions } from '@bruno00o/graph/export'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'
import './preview.css'

type Background = keyof typeof messages.backgrounds

const backgrounds: Record<Background, string> = {
  theme: 'var(--graph-paper)',
  transparent: 'transparent',
  white: '#ffffff',
}
const scales = [null, 1, 2]
const ratios = [1, 2, 3]
const { items, links } = createSample(240, 360, 5, 37, 0.05)

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to', opacity: 0.6 }),
    nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
  ],
})

function cycle<T>(values: readonly T[], value: T): T {
  return values[(values.indexOf(value) + 1) % values.length] ?? value
}

function button(text: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', () => onClick(element))
  return element
}

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, { definition, ariaLabel: messages.graphLabel })
  let region: ExportRegion = 'graph'
  let scale = scales[0] ?? null
  let pixelRatio = ratios[0] ?? 1
  let background: Background = 'theme'
  let blob: Blob | null = null

  const preview = document.createElement('figure')
  preview.className = 'png-preview'
  const image = document.createElement('img')
  image.alt = messages.previewAlt
  const caption = document.createElement('figcaption')
  const save = document.createElement('button')
  save.type = 'button'
  save.textContent = messages.download
  save.addEventListener('click', () => {
    if (!blob) return
    const link = document.createElement('a')
    link.href = image.src
    link.download = 'graph.png'
    link.click()
  })
  preview.append(image, caption, save)

  const options = (): PngExportOptions => ({
    region,
    pixelRatio,
    background: backgrounds[background],
    ...(scale === null ? {} : { zoom: scale }),
  })
  let pending = 0
  const refresh = async () => {
    if (!graph.element.isConnected) return theme.disconnect()
    const ticket = ++pending
    const start = performance.now()
    const next = await exportPng(graph, options())
    if (ticket !== pending) return
    const time = performance.now() - start
    const { naturalWidth, naturalHeight } = await new Promise<HTMLImageElement>((done) => {
      URL.revokeObjectURL(image.src)
      image.onload = () => done(image)
      image.src = URL.createObjectURL(next)
    })
    blob = next
    caption.textContent = messages.size(naturalWidth, naturalHeight, next.size, time)
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const later = () => {
    clearTimeout(timer)
    timer = setTimeout(() => void refresh(), 250)
  }
  graph.on('viewchange', () => {
    if (region === 'view' || scale === null) later()
  })
  const theme = new MutationObserver(later)
  theme.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.region(messages.regions[region]), (element) => {
      region = region === 'graph' ? 'view' : 'graph'
      element.textContent = messages.region(messages.regions[region])
      later()
    }),
    button(messages.scale(scale), (element) => {
      scale = cycle(scales, scale)
      element.textContent = messages.scale(scale)
      later()
    }),
    button(messages.ratio(pixelRatio), (element) => {
      pixelRatio = cycle(ratios, pixelRatio)
      element.textContent = messages.ratio(pixelRatio)
      later()
    }),
    button(messages.background(messages.backgrounds[background]), (element) => {
      background = cycle(Object.keys(backgrounds) as Background[], background)
      element.textContent = messages.background(messages.backgrounds[background])
      later()
    }),
  )
  container.append(actions, preview)
  later()

  return graph
}
