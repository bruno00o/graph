import type { TanStackDevtoolsPluginProps } from '@tanstack/devtools'
import { graphReports, inspectGraphs } from './inspector'
import { type GraphDevtoolsMessages, resolveMessages } from './messages'
import { createView, type PanelView, rateWindow } from './view'

export interface GraphDevtoolsOptions {
  readonly messages?: Partial<GraphDevtoolsMessages>
}

export interface GraphDevtoolsProps
  extends Partial<TanStackDevtoolsPluginProps>,
    GraphDevtoolsOptions {}

const refreshInterval = 250
let selected: number | null = null

export class GraphDevtoolsCore {
  #root: HTMLDivElement | null = null
  #view: PanelView | null = null
  #stop: (() => void) | null = null
  #observer: ResizeObserver | null = null
  #timer: ReturnType<typeof setTimeout> | undefined = undefined
  #last = Number.NEGATIVE_INFINITY
  #open = true
  #visible = true

  mount(element: HTMLElement, props: GraphDevtoolsProps = {}): void {
    this.unmount()
    const root = document.createElement('div')
    root.className = 'graph-devtools'
    root.setAttribute('data-theme', props.theme ?? 'dark')
    element.append(root)
    this.#root = root
    this.#open = props.devtoolsOpen !== false
    this.#visible = true
    this.#view = createView(root, resolveMessages(props.messages), (id) => {
      selected = id
      this.#refresh()
    })
    if (typeof ResizeObserver !== 'undefined') {
      this.#observer = new ResizeObserver((entries) => {
        const box = entries[entries.length - 1]?.contentRect
        this.#visible = box === undefined || (box.width > 0 && box.height > 0)
        this.#watch()
      })
      this.#observer.observe(root)
    }
    this.#watch()
  }

  unmount(): void {
    this.#observer?.disconnect()
    this.#observer = null
    this.#stop?.()
    this.#stop = null
    clearTimeout(this.#timer)
    this.#timer = undefined
    this.#root?.remove()
    this.#root = null
    this.#view = null
  }

  #watch(): void {
    const active = this.#root !== null && this.#open && this.#visible
    if (active && !this.#stop) {
      this.#stop = inspectGraphs(() => this.#schedule())
      this.#refresh()
    } else if (!active && this.#stop) {
      this.#stop()
      this.#stop = null
      clearTimeout(this.#timer)
      this.#timer = undefined
    }
  }

  #schedule(delay = this.#last + refreshInterval - performance.now()): void {
    if (this.#timer !== undefined || !this.#root) return
    this.#timer = setTimeout(
      () => {
        this.#timer = undefined
        this.#refresh()
      },
      Math.max(0, delay),
    )
  }

  #refresh(): void {
    const root = this.#root
    if (!root || !this.#view) return
    if (!root.isConnected) {
      this.unmount()
      return
    }
    const now = performance.now()
    this.#last = now
    const reports = graphReports(now)
    this.#view.update(reports, selected, now)
    const recent = Math.max(...reports.map((report) => report.performance.lastFrame))
    if (now - recent < rateWindow) this.#schedule(recent + rateWindow - now)
  }
}
