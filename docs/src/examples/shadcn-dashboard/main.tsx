import { defineGraph, edges, type GraphInstance, type Layout, nodes } from '@bruno00o/graph'
import { grid, layers, radial, rings } from '@bruno00o/graph/layouts'
import { force } from '@bruno00o/graph/layouts/force'
import {
  Anchor,
  Graph,
  type GraphState,
  useGraph,
  useGraphState,
  useLegend,
} from '@bruno00o/graph/react'
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react'
import { type ReactNode, type Ref, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { adjacency, degrees, groups, hub, type Item, items, type Link, links } from './data'
import { messages } from './messages'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './ui/card'
import { cn } from './ui/cn'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './ui/command'
import { Label } from './ui/label'
import { PortalContainer } from './ui/portal'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Separator } from './ui/separator'
import { Slider } from './ui/slider'
import { Switch } from './ui/switch'
import { Toggle } from './ui/toggle'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'
import './theme.css'

type LayoutKind = keyof typeof messages.layouts
type Base = keyof typeof messages.bases

const layoutKinds = Object.keys(messages.layouts) as LayoutKind[]
const bases = Object.keys(messages.bases) as Base[]

const layouts: Record<LayoutKind, Layout> = {
  force: force({ edgeLength: 24, repulsion: 22 }),
  layers: layers(),
  grid: grid<Item>({ order: (a, b) => a.group.localeCompare(b.group) || b.weight - a.weight }),
  rings: rings(),
  radial: radial(),
}

const byId = new Map(items.map((item) => [item.id, item]))

function chart(group: string): string {
  return `var(--chart-${groups.indexOf(group) + 1})`
}

function createDefinition(sizeScale: number, labels: boolean) {
  return defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to', width: 1, opacity: 0.8 }),
      nodes<Item>(items, {
        color: 'group',
        size: 'weight',
        label: labels ? 'label' : undefined,
      }),
    ],
    scales: {
      color: { domain: groups },
      size: { range: [6 * sizeScale, 16 * sizeScale] },
    },
    layout: layouts.force,
    view: { padding: 28 },
    states: {
      match: { outline: 'var(--graph-ink)', outlineWidth: 2, raise: true },
      off: { hide: true },
    },
  })
}

type Definition = ReturnType<typeof createDefinition>
type Marks = Definition['marks'][number]
type States = 'match' | 'off'
type Snapshot = GraphState<States, Marks>

function Slot({
  target,
  children,
}: {
  readonly target: HTMLElement | null
  readonly children: ReactNode
}) {
  return target ? createPortal(children, target) : null
}

function Preselect() {
  const graph = useGraph<States, Marks>()
  useEffect(() => {
    graph.selection.set({ nodes: [hub.id] })
  }, [graph])
  return null
}

function Display({
  kind,
  onKind,
  base,
  onBase,
  size,
  onSize,
  labels,
  onLabels,
}: {
  readonly kind: LayoutKind
  readonly onKind: (kind: LayoutKind) => void
  readonly base: Base
  readonly onBase: (base: Base) => void
  readonly size: number
  readonly onSize: (size: number) => void
  readonly labels: boolean
  readonly onLabels: (labels: boolean) => void
}) {
  const graph = useGraph<States, Marks>()
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">{messages.explorer.title}</CardTitle>
        <CardDescription className="text-xs">{messages.explorer.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 px-4">
        <div className="grid gap-1.5">
          <Label htmlFor="layout-kind" className="text-xs">
            {messages.explorer.layout}
          </Label>
          <Select
            value={kind}
            onValueChange={(value) => {
              const next = value as LayoutKind
              onKind(next)
              void graph.layout.run(layouts[next], { fit: true })
            }}
          >
            <SelectTrigger id="layout-kind" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {layoutKinds.map((name) => (
                <SelectItem key={name} value={name}>
                  {messages.layouts[name]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="node-size" className="text-xs">
              {messages.explorer.nodeSize}
            </Label>
            <span className="text-xs text-muted-foreground tabular-nums">{size.toFixed(1)}x</span>
          </div>
          <Slider
            id="node-size"
            min={0.6}
            max={1.6}
            step={0.1}
            value={[size]}
            onValueChange={([value]) => onSize(value ?? 1)}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="show-labels" className="text-xs">
            {messages.explorer.labels}
          </Label>
          <Switch id="show-labels" size="sm" checked={labels} onCheckedChange={onLabels} />
        </div>
        <Separator />
        <div className="grid gap-1.5">
          <Label className="text-xs">{messages.explorer.baseColor}</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={1}
            value={base}
            className="grid w-full grid-cols-2"
            onValueChange={(value) => {
              if (value) onBase(value as Base)
            }}
          >
            {bases.map((name) => (
              <ToggleGroupItem key={name} value={name} className="w-full text-xs">
                {messages.bases[name]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </CardContent>
    </Card>
  )
}

function Find() {
  const graph = useGraph<States, Marks>()
  const focus = (item: Item) => {
    graph.selection.set({ nodes: [item.id] })
    graph.focus.set({ kind: 'node', key: item.id })
    graph.view.fit({ nodes: [item.id, ...graph.neighbors(item.id)], maxZoom: 2, duration: 400 })
  }
  return (
    <Card className="min-h-0 flex-1 gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">{messages.find.title}</CardTitle>
        <CardDescription className="text-xs">{messages.find.description}</CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-4">
        <Command className="rounded-md border">
          <CommandInput placeholder={messages.find.placeholder} />
          <CommandList className="max-h-none min-h-0 flex-1">
            <CommandEmpty>{messages.find.empty}</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.label}
                  keywords={[item.group]}
                  onSelect={() => focus(item)}
                >
                  <span className="size-2 rounded-full" style={{ background: chart(item.group) }} />
                  {item.label}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {messages.group(item.group)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CardContent>
    </Card>
  )
}

function Stat({
  title,
  value,
  detail,
}: {
  readonly title: string
  readonly value: ReactNode
  readonly detail: ReactNode
}) {
  return (
    <Card className="gap-1 py-3">
      <CardHeader className="px-4">
        <CardDescription className="text-xs">{title}</CardDescription>
        <CardTitle className="flex items-center gap-2 text-xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="truncate px-4 text-xs text-muted-foreground">{detail}</CardContent>
    </Card>
  )
}

function Stats({ kind }: { readonly kind: LayoutKind }) {
  const hidden = useGraphState((state: Snapshot) => state.states.off.nodes.length)
  const layout = useGraphState((state: Snapshot) => state.layout)
  const selected = useGraphState((state: Snapshot) => state.selection.nodes.length)
  const hovered = useGraphState((state: Snapshot) => state.hovered)
  const text = hovered?.kind === 'node' ? messages.stats.hovering(hovered.datum.label) : null
  return (
    <>
      <Stat
        title={messages.stats.items}
        value={`${items.length - hidden} / ${items.length}`}
        detail={messages.stats.itemsDetail(groups.length)}
      />
      <Stat
        title={messages.stats.layout}
        value={
          <Badge variant={layout.running ? 'default' : 'secondary'}>
            {layout.running
              ? messages.stats.running(Math.round(layout.progress * 100))
              : messages.stats.settled}
          </Badge>
        }
        detail={messages.stats.layoutDetail(messages.layouts[kind])}
      />
      <Stat
        title={messages.stats.selection}
        value={messages.stats.selected(selected)}
        detail={text ?? messages.stats.nothingHovered}
      />
    </>
  )
}

function Actions() {
  const graph = useGraph<States, Marks>()
  const tools = [
    {
      label: messages.card.zoomIn,
      icon: ZoomIn,
      run: () => graph.view.zoomBy(1.5, { duration: 200 }),
    },
    {
      label: messages.card.zoomOut,
      icon: ZoomOut,
      run: () => graph.view.zoomBy(1 / 1.5, { duration: 200 }),
    },
    { label: messages.card.fit, icon: Maximize, run: () => graph.view.fit({ duration: 400 }) },
  ]
  return (
    <div className="flex gap-1">
      {tools.map(({ label, icon: Icon, run }) => (
        <Tooltip key={label}>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" aria-label={label} onClick={run}>
              <Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

function Groups() {
  const { state, legend } = useLegend<States, Marks>({ highlight: 'match', hidden: 'off' })
  const categories = state.color?.type === 'categories' ? [...state.color.items] : []
  categories.sort((a, b) => String(a.value).localeCompare(String(b.value)))
  return (
    <fieldset className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0">
      <legend className="sr-only">{messages.legend.label}</legend>
      {categories.map((item) => (
        <Toggle
          key={item.id}
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 px-2 text-xs"
          aria-label={messages.group(String(item.value))}
          pressed={!item.off}
          onPressedChange={() => legend?.toggle(item.id)}
          onPointerEnter={() => legend?.hover(item.id)}
          onPointerLeave={() => legend?.hover(null)}
        >
          <span className="size-2 rounded-full" style={{ background: item.color }} />
          {String(item.value)}
          <span className="text-muted-foreground tabular-nums">{item.nodes}</span>
        </Toggle>
      ))}
    </fieldset>
  )
}

function Details() {
  const graph = useGraph<States, Marks>()
  const selection = useGraphState((state: Snapshot) => state.selection)
  const keys = selection.nodes.map(String)
  const selected = keys.flatMap((key) => byId.get(key) ?? [])
  const only = selected.length === 1 ? selected[0] : undefined
  const related = only ? (adjacency.get(only.id) ?? []).flatMap((key) => byId.get(key) ?? []) : []
  const open = (item: Item) => {
    graph.selection.set({ nodes: [item.id] })
    graph.view.fit({ nodes: [item.id, ...graph.neighbors(item.id)], maxZoom: 2, duration: 400 })
  }
  return (
    <Card className="min-h-0 w-full gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">{only ? only.label : messages.details.title}</CardTitle>
        <CardDescription className="text-xs">
          {only
            ? messages.details.description(only.group)
            : selected.length > 1
              ? messages.details.many(selected.length)
              : messages.details.empty}
        </CardDescription>
        {selected.length > 0 ? (
          <CardAction>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => graph.selection.clear()}
            >
              {messages.details.clear}
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      {only ? (
        <CardContent className="grid min-h-0 gap-3 px-4">
          <div className="flex gap-2">
            <Badge variant="outline">
              {messages.details.weight} {only.weight}
            </Badge>
            <Badge variant="outline">
              {messages.details.connections} {degrees.get(only.id) ?? 0}
            </Badge>
          </div>
          <Separator />
          <div className="text-xs font-medium">{messages.details.neighbors}</div>
          <div className="-mx-1 flex min-h-0 flex-col gap-0.5 overflow-y-auto">
            {related.map((item) => (
              <Button
                key={item.id}
                variant="ghost"
                size="sm"
                className="h-7 justify-start px-1 text-xs"
                onClick={() => open(item)}
              >
                <span className="size-2 rounded-full" style={{ background: chart(item.group) }} />
                {item.label}
              </Button>
            ))}
          </div>
        </CardContent>
      ) : null}
    </Card>
  )
}

function Hovered() {
  const hovered = useGraphState((state: Snapshot) => state.hovered)
  if (hovered?.kind !== 'node') return null
  const item = hovered.datum
  return (
    <Anchor node={hovered.key} side="right" align="start" offset={{ x: 6, y: 0 }}>
      <div className="grid w-44 gap-1.5 rounded-md border bg-popover p-3 text-popover-foreground shadow-md">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{item.label}</span>
          <Badge variant="secondary">{item.group}</Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          {messages.hoverCard.weight(item.weight)},{' '}
          {messages.hoverCard.connections(degrees.get(item.id) ?? 0)}
        </div>
      </div>
    </Anchor>
  )
}

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  const [scope, setScope] = useState<HTMLDivElement | null>(null)
  const [sidebar, setSidebar] = useState<HTMLElement | null>(null)
  const [stats, setStats] = useState<HTMLElement | null>(null)
  const [actions, setActions] = useState<HTMLElement | null>(null)
  const [footer, setFooter] = useState<HTMLElement | null>(null)
  const [details, setDetails] = useState<HTMLElement | null>(null)
  const [kind, setKind] = useState<LayoutKind>('force')
  const [base, setBase] = useState<Base>('neutral')
  const [size, setSize] = useState(1)
  const [labels, setLabels] = useState(true)
  const definition = useMemo(() => createDefinition(size, labels), [size, labels])
  return (
    <div
      ref={setScope}
      className={cn(
        'shadcn-scope @container overflow-hidden bg-background text-foreground',
        `base-${base}`,
      )}
    >
      <PortalContainer value={scope}>
        <TooltipProvider>
          <div className="grid h-full grid-cols-1 grid-rows-[minmax(0,1fr)] gap-3 p-3 @xl:grid-cols-[12rem_minmax(0,1fr)]">
            <aside ref={setSidebar} className="hidden min-h-0 flex-col gap-3 @xl:flex" />
            <div className="flex min-h-0 min-w-0 flex-col gap-3">
              <div ref={setStats} className="hidden shrink-0 grid-cols-3 gap-3 @3xl:grid" />
              <div className="flex min-h-0 flex-1 gap-3">
                <Card className="min-h-0 min-w-0 flex-1 gap-0 py-0">
                  <CardHeader className="border-b p-4">
                    <CardTitle className="text-sm">{messages.card.title}</CardTitle>
                    <CardDescription className="text-xs">
                      {messages.card.description(items.length, links.length)}
                    </CardDescription>
                    <CardAction ref={setActions} />
                  </CardHeader>
                  <CardContent className="relative min-h-0 flex-1 p-0">
                    <div className="absolute inset-0">
                      <Graph
                        ref={ref}
                        className="h-full w-full"
                        definition={definition}
                        ariaLabel={messages.graphLabel(items.length, links.length)}
                      >
                        <Preselect />
                        <Hovered />
                        <Slot target={sidebar}>
                          <Display
                            kind={kind}
                            onKind={setKind}
                            base={base}
                            onBase={setBase}
                            size={size}
                            onSize={setSize}
                            labels={labels}
                            onLabels={setLabels}
                          />
                          <Find />
                        </Slot>
                        <Slot target={stats}>
                          <Stats kind={kind} />
                        </Slot>
                        <Slot target={actions}>
                          <Actions />
                        </Slot>
                        <Slot target={footer}>
                          <Groups />
                        </Slot>
                        <Slot target={details}>
                          <Details />
                        </Slot>
                      </Graph>
                    </div>
                  </CardContent>
                  <CardFooter ref={setFooter} className="border-t p-3" />
                </Card>
                <aside ref={setDetails} className="hidden min-h-0 w-56 shrink-0 @4xl:flex" />
              </div>
            </div>
          </div>
        </TooltipProvider>
      </PortalContainer>
    </div>
  )
}
