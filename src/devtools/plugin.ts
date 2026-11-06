import type { TanStackDevtoolsPlugin, TanStackDevtoolsPluginProps } from '@tanstack/devtools'
import { GraphDevtoolsCore, type GraphDevtoolsOptions } from './core'
import { resolveMessages } from './messages'

/** Options of `graphDevtoolsPlugin`. */
export interface GraphDevtoolsPluginOptions extends GraphDevtoolsOptions {
  /** Opens the panel the first time the devtools open. */
  readonly defaultOpen?: boolean
}

export const graphDevtoolsId = 'bruno00o-graph'

/** The Graph panel, as a plugin of `TanStackDevtoolsCore` from `@tanstack/devtools`. */
export function graphDevtoolsPlugin(
  options: GraphDevtoolsPluginOptions = {},
): TanStackDevtoolsPlugin {
  const { defaultOpen, ...panelOptions } = options
  const panels = new Map<
    HTMLElement,
    { core: GraphDevtoolsCore; props: TanStackDevtoolsPluginProps }
  >()
  return {
    id: graphDevtoolsId,
    name: resolveMessages(options.messages).title,
    ...(defaultOpen !== undefined ? { defaultOpen } : {}),
    render(element, props) {
      const previous = panels.get(element)
      if (
        previous?.props.theme === props.theme &&
        previous.props.devtoolsOpen === props.devtoolsOpen
      )
        return
      previous?.core.unmount()
      const core = new GraphDevtoolsCore()
      panels.set(element, { core, props: { ...props } })
      core.mount(element, { ...props, ...panelOptions })
    },
    destroy() {
      for (const { core } of panels.values()) core.unmount()
      panels.clear()
    },
  }
}
