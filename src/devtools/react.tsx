import { createReactPlugin, type DevtoolsPanelProps } from '@tanstack/devtools-utils/react'
import { type JSX, useEffect, useRef } from 'react'
import { GraphDevtoolsCore, type GraphDevtoolsOptions } from './core'
import { resolveMessages } from './messages'
import { type GraphDevtoolsPluginOptions, graphDevtoolsId } from './plugin'

export type { GraphDevtoolsMessages } from './messages'
export type { GraphDevtoolsOptions, GraphDevtoolsPluginOptions }

/**
 * Props of `GraphDevtoolsPanel`: `theme`, `'dark'` by default, `devtoolsOpen`, `true` by default,
 * and `messages`, to keep stable since a new object mounts the panel again.
 */
export interface GraphDevtoolsPanelProps
  extends Partial<DevtoolsPanelProps>,
    GraphDevtoolsOptions {}

/** The plugin object that `<TanStackDevtools>` from `@tanstack/react-devtools` takes. */
export type GraphDevtoolsReactPlugin = ReturnType<ReturnType<typeof createReactPlugin>[0]>

const fill = { height: '100%' } as const

/** The devtools panel in a React tree, outside the devtools shell. It fills its parent. */
export function GraphDevtoolsPanel({
  theme = 'dark',
  devtoolsOpen = true,
  messages,
}: GraphDevtoolsPanelProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const core = new GraphDevtoolsCore()
    core.mount(element, { theme, devtoolsOpen, ...(messages ? { messages } : {}) })
    return () => core.unmount()
  }, [theme, devtoolsOpen, messages])
  return <div style={fill} ref={ref} />
}

/** The Graph panel, as a plugin of `<TanStackDevtools>` from `@tanstack/react-devtools`. */
export function graphDevtoolsPlugin(
  options: GraphDevtoolsPluginOptions = {},
): GraphDevtoolsReactPlugin {
  const { defaultOpen, ...panelOptions } = options
  const [plugin] = createReactPlugin({
    name: resolveMessages(options.messages).title,
    id: graphDevtoolsId,
    ...(defaultOpen !== undefined ? { defaultOpen } : {}),
    Component: (props) => <GraphDevtoolsPanel {...props} {...panelOptions} />,
  })
  return plugin()
}
