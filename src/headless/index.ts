import type { TextWidth } from '../core/label-width'
import type { TextWidths } from '../dom/text-width'
import { createGraphCore } from '../host/graph-core'
import type { GraphCore, GraphOptions, GraphSize } from '../host/graph-instance'
import { coreAfterDestroy, coreStillborn } from '../host/lifecycle'
import type { LayoutWork, Mark } from '../types'
import type { GraphTheme } from './colors'
import {
  checkSize,
  defaultSize,
  headlessPage,
  noneCapabilities,
  noneSurface,
  timerClock,
} from './page'
import { sansTextWidth } from './text-estimate'
import { ScriptTheme } from './theme'

export type { TextWidth } from '../core/label-width'
export type {
  GraphCore,
  GraphCoreUpdateOptions,
  GraphOptions,
  GraphSize,
} from '../host/graph-instance'
export type { GraphToken } from '../theme/tokens'
export type { GraphTheme, GraphThemeBase, GraphThemeOptions } from './colors'
export { type FontFile, type ReadFontOptions, readFont } from './read-font'

/** Options of `createGraph`. `S` and `M` come from the definition. */
export interface CreateGraphOptions<S extends string = string, M extends Mark = Mark>
  extends GraphOptions<S, M> {
  /**
   * Size of the view, in CSS pixels: `pick`, `view.toScreen`, `view.fit` and the first fit work on
   * it. `update({ size })` changes it.
   * @default { width: 1024, height: 768 }
   */
  readonly size?: GraphSize | undefined
  /**
   * Colors and font in place of the CSS variables of a page: `'light'`, `'dark'`, or tokens of
   * your own over one of them.
   * @default 'light'
   */
  readonly theme?: GraphTheme | undefined
  /**
   * Width of a text in em, for label boxes, label selection and the layouts that leave room for
   * labels. Pass `readFont(bytes).width` for the font that will draw the labels. Defaults to the
   * advance widths of Arial, which Liberation Sans and Helvetica share.
   */
  readonly measureText?: TextWidth | undefined
  /** Title of the graph, written into exports. */
  readonly title?: string | undefined
}

const scriptWork: LayoutWork = Object.freeze({ slice: 50, workers: false })

/**
 * Creates a graph that needs no page, no DOM and no WebGL, as in Node, Deno, Bun or a worker: it
 * reads its data, lays it out, answers queries and exports, on the same definition as a mounted
 * graph. Layouts, edge bundling, edge routing and shape fills run on the calling thread in slices
 * of 50 ms, animations end at once, and `await graph.settled()` waits for all of them.
 */
export function createGraph<S extends string = string, M extends Mark = Mark>(
  options: CreateGraphOptions<S, M>,
): GraphCore<S, M> {
  const size = checkSize(options.size ?? defaultSize)
  const signal = options.signal
  if (signal?.aborted) {
    return coreStillborn(options, noneCapabilities, (store, shaped) =>
      coreAfterDestroy(store, signal, () => signal.reason, shaped),
    )
  }
  const colors = new ScriptTheme(options.theme)
  const textWidths: TextWidths = {
    width: options.measureText ?? sansTextWidth,
    setFont: () => false,
    reload: () => false,
  }
  return createGraphCore(
    options,
    {
      home: noneSurface(),
      colors,
      textWidths,
      still: () => true,
      work: scriptWork,
      quiet: 0,
      frames: timerClock(16),
    },
    headlessPage(options.title ?? null, size, colors, textWidths),
  )
}
