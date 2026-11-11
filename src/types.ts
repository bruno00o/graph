/** Key of a node or an edge: a string or a number, unique within each kind of element. */
export type Key = string | number

/**
 * A list of keys or names: an array, a `Set`, `Map#keys()`, a generator or any other iterable
 * object. A single string is refused, since it would iterate over its characters.
 */
export type KeyList<K extends Key = Key> = Iterable<K> & object

/** A point, in screen pixels or in world units depending on where it is used. */
export interface Point {
  /** Horizontal coordinate, growing to the right. */
  readonly x: number
  /** Vertical coordinate, growing downward. */
  readonly y: number
}

/** A place on Earth, in degrees. */
export interface GeoPoint {
  /** Longitude, from -180 to 180 degrees, growing eastward. */
  readonly longitude: number
  /** Latitude, from -90 to 90 degrees, growing northward. */
  readonly latitude: number
}

/**
 * A point an edge passes through: a point in world units, an `[x, y]` pair in world units, or a
 * place in degrees, projected like the `longitude` and `latitude` of nodes.
 */
export type WaypointInput = Point | GeoPoint | readonly [x: number, y: number]

/** A GeoJSON `LineString` geometry: positions as `[longitude, latitude]` pairs. */
export interface LineStringGeometry {
  /** GeoJSON type of the geometry. */
  readonly type: 'LineString'
  /** Positions of the line, each `[longitude, latitude]`, an altitude after them being ignored. */
  readonly coordinates: readonly (readonly number[])[]
}

/** A GeoJSON `MultiLineString` geometry: lines of `[longitude, latitude]` pairs. */
export interface MultiLineStringGeometry {
  /** GeoJSON type of the geometry. */
  readonly type: 'MultiLineString'
  /** Lines, each a list of `[longitude, latitude]` positions. */
  readonly coordinates: readonly (readonly (readonly number[])[])[]
}

/** A GeoJSON line geometry that `lineWaypoints` reads. */
export type LineGeometry = LineStringGeometry | MultiLineStringGeometry

/** Options of `lineWaypoints`. */
export interface LineWaypointsOptions {
  /**
   * Keeps the first and the last positions of the line. By default they are dropped, since they
   * usually sit on the end nodes.
   * @default false
   */
  readonly keepEnds?: boolean | undefined
}

/** The camera: the world point at the center of the graph element, and a zoom factor. */
export interface View {
  /** Horizontal coordinate of the center, in world units. */
  readonly x: number
  /** Vertical coordinate of the center, in world units. */
  readonly y: number
  /** Screen pixels per world unit. At zoom 1, one world unit is one CSS pixel. */
  readonly zoom: number
}

/** A rectangle in world units. */
export interface Bounds {
  /** Left edge. */
  readonly minX: number
  /** Top edge. */
  readonly minY: number
  /** Right edge. */
  readonly maxX: number
  /** Bottom edge. */
  readonly maxY: number
}

/** A function that reads a value from an item of the data. */
export type Accessor<T, V> = (datum: T) => V

/** Names of the fields of `T` whose values are `V`, `null` or `undefined`. */
export type FieldOf<T, V> = {
  [K in keyof T]-?: T[K] extends V | null | undefined ? K : never
}[keyof T] &
  string

/** Names of the required fields of `T` whose values are keys. */
export type KeyFieldOf<T> = {
  [K in keyof T]-?: T[K] extends Key ? (Partial<Pick<T, K>> extends Pick<T, K> ? never : K) : never
}[keyof T] &
  string

/** A field name or a function. Its value goes through a scale. */
export type Channel<T, V> = FieldOf<T, V> | Accessor<T, V | null | undefined>

/** A field name or a function that gives the key of an item, or of a node it points to. */
export type KeyChannel<T> = KeyFieldOf<T> | Accessor<T, Key>

/** A constant or a function of the item, never a field name. Its value is final, with no scale. */
export type Style<T, V> = V | Accessor<T, V>

declare const rawValue: unique symbol

/**
 * A function made by `raw()`. Its value is used as is, without the scale of its channel, and stays
 * out of the extent and the categories of that scale.
 */
export interface RawAccessor<T, V> {
  (datum: T): V
  readonly [rawValue]: true
}

/**
 * A number channel. A field name or a function goes through the scale of the channel. A number,
 * or a function wrapped in `raw()`, is used as is.
 */
export type NumberChannel<T> =
  | Channel<T, number>
  | number
  | RawAccessor<T, number | null | undefined>

/**
 * A color channel. A field name or a function goes through the `color` scale. A function wrapped
 * in `raw()` gives a CSS color used as is. For one color for all, use `fill` or `stroke`.
 */
export type ColorChannel<T> =
  | Channel<T, string | number | boolean>
  | RawAccessor<T, string | null | undefined>

/** One change of a live source. */
export interface SourceChange<T> {
  /** What happened to the item. */
  readonly type: 'insert' | 'update' | 'delete'
  /** Key of the item. */
  readonly key: Key
  /** The item after the change, or as it was for a delete. */
  readonly value: T
}

/** What `subscribeChanges` returns. */
export interface SourceSubscription {
  /** Stops the calls to the callback. */
  unsubscribe(): void
}

/**
 * Data that streams its changes, such as a TanStack DB collection. A mark recognizes it by its
 * `subscribeChanges` method, before trying to iterate it.
 */
export interface LiveSource<T> {
  /**
   * Calls `callback` with each batch of changes. With `includeInitialState`, the current items
   * come first, as inserts.
   */
  subscribeChanges(
    callback: (changes: ReadonlyArray<SourceChange<T>>) => void,
    options?: { includeInitialState?: boolean },
  ): SourceSubscription
}

/** Data of a mark: an iterable, reconciled by key on each new definition, or a live source. */
export type GraphData<T> = Iterable<T> | LiveSource<T>

/**
 * A moment, in milliseconds since 1 January 1970 UTC as `Date.getTime()` gives it, or a `Date`.
 */
export type TimeInstant = number | Date

/**
 * A period of time: from `start`, included, to `end`, excluded. A missing or `null` end leaves the
 * period open on that side.
 */
export interface TimeSpan {
  /** First moment of the period. Defaults to no start: the period has always existed. */
  readonly start?: TimeInstant | null | undefined
  /** First moment after the period. Defaults to no end: the period goes on forever. */
  readonly end?: TimeInstant | null | undefined
}

/** When an element exists: a single moment, or a period with optional open ends. */
export type TimeValue = TimeInstant | TimeSpan

/**
 * A time window, as the graph holds it: from `start`, included, to `end`, excluded, in
 * milliseconds. A `null` end leaves the window open on that side.
 */
export interface TimeWindow {
  /** First moment of the window, or `null` for no start. */
  readonly start: number | null
  /** First moment after the window, or `null` for no end. */
  readonly end: number | null
}

/**
 * A time window to apply: from `start`, included, to `end`, excluded. A missing or `null` end
 * leaves the window open on that side. With `start` equal to `end`, the window is that single
 * moment.
 */
export interface TimeWindowInput {
  /** First moment of the window. Defaults to no start. */
  readonly start?: TimeInstant | null | undefined
  /** First moment after the window. Defaults to no end. */
  readonly end?: TimeInstant | null | undefined
}

/**
 * Shape of a node. A `'box'` is a rectangle with rounded corners whose height is the size of the
 * node and whose width can fit its label.
 */
export type NodeShape = 'circle' | 'square' | 'diamond' | 'box'

/** Line pattern of an edge. */
export type EdgeDash = 'solid' | 'dashed' | 'dotted'

/** Ends of an edge that carry an arrow head. */
export type EdgeArrow = 'none' | 'source' | 'target' | 'both'

/** One end of an edge: `'source'` or `'target'`. */
export type EdgeEnd = 'source' | 'target'

/** Corner of a node that holds a badge. */
export type BadgeCorner = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

/** Side of the node where its label sits. `'center'` puts it on the node. */
export type LabelPlacement = 'bottom' | 'top' | 'right' | 'left' | 'center'

/** Font weight: `'normal'` (400), `'bold'` (700), or a number from 1 to 1000. */
export type LabelWeight = 'normal' | 'bold' | number

/**
 * A pill in a corner of a node. It hides while the node measures less than 10 pixels on screen, and
 * its text shows from 12.
 */
export interface Badge {
  /** Text or number in the pill. Without it, the badge is a dot. */
  readonly text?: string | number | undefined
  /**
   * Pill color.
   * @default --graph-badge-fill
   */
  readonly fill?: string | undefined
  /**
   * Text color.
   * @default --graph-badge-ink
   */
  readonly color?: string | undefined
}

/** A picture or an icon drawn inside a node, cropped to its shape. */
export interface NodeImage {
  /** Image URL: SVG, PNG, JPEG or anything the browser can draw. */
  readonly src: string
  /**
   * Size of the image relative to the node diameter.
   * @default 1
   */
  readonly scale?: number | undefined
  /** Draws the image as a mask of this color, such as an icon that follows the theme. */
  readonly color?: string | undefined
}

/** Text and style of a label, shared by node and edge labels. */
export interface LabelTextOptions<T> {
  /** Main text, where `\n` starts a new line. Anything but a non-empty string draws no label. */
  readonly text: Channel<T, string>
  /**
   * Plate behind the label: a CSS color, `true` for `--graph-label-background`, `false` or `null`
   * for none. A plated label has no halo.
   */
  readonly background?: Style<T, string | boolean | null> | undefined
  /**
   * Color of the main text.
   * @default --graph-ink
   */
  readonly color?: Style<T, string> | undefined
  /**
   * Font size in pixels at zoom 1: 12 for nodes and 11 for edges by default. Labels shrink when
   * you zoom out, not when you zoom in.
   */
  readonly size?: Style<T, number> | undefined
  /**
   * Font weight: `'normal'` (400), `'bold'` (700), or a number from 1 to 1000.
   * @default 500
   */
  readonly weight?: Style<T, LabelWeight> | undefined
  /**
   * CSS font family. A web font that finishes loading after the first frame is measured and
   * drawn again once, as long as it is in the family list.
   * @default --graph-font
   */
  readonly font?: Style<T, string> | undefined
  /** Width in pixels at zoom 1 past which each line ends with an ellipsis. */
  readonly maxWidth?: Style<T, number> | undefined
}

/** Text and style of a node label. */
export interface LabelOptions<T> extends LabelTextOptions<T> {
  /**
   * Color of the main text. Defaults to `--graph-ink`, except for a label drawn inside its node
   * (always on a `'box'`, on other shapes when `'center'` text fits) without a plate, which takes
   * `--graph-ink` or `--graph-paper`, whichever contrasts more with the fill, states included.
   */
  readonly color?: Style<T, string> | undefined
  /**
   * Second line, at eleven twelfths of the size, in normal weight and `--graph-ink-muted`. On its
   * node, it follows the color of a main text that contrasts with the fill.
   */
  readonly secondary?: Channel<T, string> | undefined
  /**
   * Side of the node where the label sits, or `'center'` on the node. Defaults to `'center'` for a
   * `'box'` and to `'bottom'` for the other shapes.
   */
  readonly placement?: Style<T, LabelPlacement> | undefined
  /**
   * Smallest diameter of the node on screen, in pixels, for its label to show. Hovered and focused
   * nodes ignore it.
   */
  readonly minScreenSize?: Style<T, number> | undefined
}

/** Text and style of an edge label, which sits halfway along the edge and turns with it. */
export interface EdgeLabelOptions<T> extends LabelTextOptions<T> {}

/** Name of a mark: a string chosen in its options, or `undefined` for a mark without one. */
export type MarkName = string | undefined

/** Layer of a mark: a string chosen in its options, or `undefined` for a mark outside any layer. */
export type MarkLayer = string | undefined

/**
 * Options of `nodes()`. Channels go through a scale, unless their value is raw; styles are final
 * values. `N` is the type of `name` and `L` that of `layer`.
 */
export interface NodeOptions<T, N extends MarkName = MarkName, L extends MarkLayer = MarkLayer> {
  /**
   * Name of the mark, reported as `mark` by the targets of its nodes. Compare it in event handlers
   * to tell marks apart and narrow `datum` to the items of one mark.
   */
  readonly name?: N | undefined
  /**
   * Layer the nodes belong to, shared with the marks that name the same layer. Hiding the layer
   * hides its nodes and their edges. Defaults to no layer: the nodes always show.
   */
  readonly layer?: L | undefined
  /**
   * Node key, unique across node marks. Required for an iterable whose items have no `id` field.
   * A live source keys its items by the `key` of its changes and takes no `key` option.
   * @default 'id'
   */
  readonly key?: KeyChannel<T> | undefined
  /**
   * Value passed to the `color` scale: a category or a number. A function wrapped in `raw()` gives
   * a CSS color instead, with no scale.
   * @default --graph-node
   */
  readonly color?: ColorChannel<T> | undefined
  /**
   * Diameter of the node, or height of a `'box'`: a number, or a function wrapped in `raw()`,
   * used as is, or a field or a function whose value goes through the `size` scale.
   * @default 16
   */
  readonly size?: NumberChannel<T> | undefined
  /** Label text, or the text with its style. */
  readonly label?: Channel<T, string> | LabelOptions<T> | undefined
  /** Horizontal position in world units. The node follows it, and layouts leave it in place. */
  readonly x?: Channel<T, number> | undefined
  /** Vertical position in world units. The node follows it, and layouts leave it in place. */
  readonly y?: Channel<T, number> | undefined
  /**
   * Longitude in degrees. With `latitude`, it places the node with Web Mercator, where the world
   * spans 512 units, as on a map. Ignored when `x` and `y` are given.
   */
  readonly longitude?: Channel<T, number> | undefined
  /** Latitude in degrees, from -85.05 to 85.05. Goes with `longitude`. */
  readonly latitude?: Channel<T, number> | undefined
  /**
   * Node shape: `'circle'`, `'square'`, `'diamond'` or `'box'`, a rectangle with rounded corners
   * whose height is `size`.
   * @default 'circle'
   */
  readonly shape?: Style<T, NodeShape> | undefined
  /**
   * Width of a `'box'`, in the units of `size`: a number, or `'label'` to fit the label with half
   * the height of room on each side, never narrower than the height. A fixed width cuts a label
   * on the box to fit, unless the label sets `maxWidth`. Other shapes ignore it.
   * @default 'label'
   */
  readonly width?: Style<T, number | 'label'> | undefined
  /**
   * Corner radius of a `'box'`, in the units of `size`, at most half its height and half its
   * width. Defaults to a quarter of the height. Other shapes ignore it.
   */
  readonly cornerRadius?: Style<T, number> | undefined
  /** Fill color. Wins over `color`. */
  readonly fill?: Style<T, string> | undefined
  /**
   * Color of the contour drawn inside the shape.
   * @default --graph-node-ring
   */
  readonly stroke?: Style<T, string> | undefined
  /**
   * Width of the inner contour, in screen pixels.
   * @default 1
   */
  readonly strokeWidth?: Style<T, number> | undefined
  /** Color of a ring outside the shape, or `null` for none. Alone, it draws a 2 pixel ring. */
  readonly outline?: Style<T, string | null> | undefined
  /**
   * Width of the ring outside the shape, in screen pixels. Alone, it draws the ring in
   * `--graph-node-ring`.
   */
  readonly outlineWidth?: Style<T, number> | undefined
  /**
   * Opacity from 0 to 1.
   * @default 1
   */
  readonly opacity?: Style<T, number> | undefined
  /**
   * Zoom at and below which the node is hidden, in screen pixels per world unit, as in `View`.
   * Above it, the node fades in over a quarter of a zoom doubling. A hidden node hides its label,
   * its badges and its edges, and is neither picked, exported nor counted. Defaults to no limit.
   */
  readonly minZoom?: Style<T, number | null> | undefined
  /**
   * Zoom at and above which the node is hidden, in screen pixels per world unit. Below it, the
   * node fades out over a quarter of a zoom halving. Defaults to no limit.
   */
  readonly maxZoom?: Style<T, number | null> | undefined
  /**
   * When the node exists: a moment, or a period with optional open ends, in milliseconds or as
   * `Date`. With a time window set, the node shows only while it exists in the window, and hides
   * its label, its badges and its edges otherwise. `null` or no value: the node always exists.
   */
  readonly time?: Channel<T, TimeValue> | undefined
  /** Picture or icon inside the node: a URL, an image with options, or `null` for none. */
  readonly image?: Style<T, string | NodeImage | null> | undefined
  /** A function per corner that returns the badge of an item, or `null` for none. */
  readonly badges?:
    | Readonly<Partial<Record<BadgeCorner, Accessor<T, Badge | null | undefined> | undefined>>>
    | undefined
  /**
   * `'screen'` keeps the size of the node, in pixels, the same at every zoom; `'world'` scales it
   * with the zoom. Defaults to `'screen'` with `longitude` and `latitude`, to the units of the
   * grouped nodes for `groups()`, and to `'world'` otherwise.
   */
  readonly units?: 'world' | 'screen' | undefined
  /**
   * Key of the group that contains the node, `null` for a top-level node. A node with children is a
   * group: unfolded, it draws as a container behind them; folded, it hides them and draws as a node.
   */
  readonly parent?: Channel<T, Key> | undefined
  /** Look of the node while it is an unfolded group, drawn as a container behind its children. */
  readonly container?: ContainerOptions<T> | undefined
  /**
   * Scales of this mark alone, each with its own extent and categories. A scale left out is the
   * one of the definition, shared with the other marks.
   */
  readonly scales?: NodeScalesOptions | undefined
}

/** Outline of an unfolded group: `'rectangle'`, with rounded corners, or `'circle'`. */
export type ContainerShape = 'rectangle' | 'circle'

/**
 * Options of the `container` option of `nodes()`: the look of a group while it is unfolded. The
 * container fits its children and follows them as they move.
 */
export interface ContainerOptions<T> {
  /**
   * Outline around the children: `'rectangle'`, with rounded corners, or `'circle'`.
   * @default 'rectangle'
   */
  readonly shape?: Style<T, ContainerShape> | undefined
  /**
   * Space between the children and the outline, in world units, or in pixels on a map.
   * @default 16
   */
  readonly padding?: Style<T, number> | undefined
  /**
   * Fill color.
   * @default --graph-group-fill
   */
  readonly fill?: Style<T, string> | undefined
  /**
   * Opacity of the fill, from 0 to 1, without the outline nor the children. A value that is not a
   * finite number takes the default; others are clamped. Defaults to 1, or to a translucent fill
   * on a map so the basemap shows through.
   */
  readonly fillOpacity?: Style<T, number> | undefined
  /**
   * Outline color.
   * @default --graph-group-line
   */
  readonly stroke?: Style<T, string> | undefined
  /**
   * Outline width, in screen pixels.
   * @default 1
   */
  readonly strokeWidth?: Style<T, number> | undefined
  /**
   * Moves apart the children that overlap, such as nodes at the same place, around their place
   * while the group is unfolded. Their data keeps its position.
   * @default true
   */
  readonly spread?: Style<T, boolean> | undefined
  /**
   * Space kept between spread children, in pixels for children sized in screen units, else in
   * world units.
   * @default 4
   */
  readonly gap?: Style<T, number> | undefined
}

/**
 * Options of `edges()`. Channels go through a scale, unless their value is raw; styles are final
 * values. `N` is the type of `name` and `L` that of `layer`.
 */
export interface EdgeOptions<T, N extends MarkName = MarkName, L extends MarkLayer = MarkLayer> {
  /**
   * Name of the mark, reported as `mark` by the targets of its edges. Compare it in event handlers
   * to tell marks apart and narrow `datum` to the items of one mark.
   */
  readonly name?: N | undefined
  /**
   * Layer the edges belong to, shared with the marks that name the same layer. Layers can be
   * hidden at run time, and parallel edges between two nodes form one band per layer. Defaults to
   * no layer.
   */
  readonly layer?: L | undefined
  /**
   * Edge key, unique across edge marks. Required for an iterable whose items have no `id` field.
   * A live source keys its items by the `key` of its changes and takes no `key` option.
   * @default 'id'
   */
  readonly key?: KeyChannel<T> | undefined
  /** Key of the source node. The edge waits until both of its ends exist. */
  readonly source: KeyChannel<T>
  /** Key of the target node. */
  readonly target: KeyChannel<T>
  /**
   * Value passed to the `color` scale: a category or a number. A function wrapped in `raw()` gives
   * a CSS color instead, with no scale.
   * @default --graph-edge
   */
  readonly color?: ColorChannel<T> | undefined
  /**
   * Line width in screen pixels: a number, or a function wrapped in `raw()`, used as is, or a field
   * or a function whose value goes through the `width` scale.
   * @default 1.5
   */
  readonly width?: NumberChannel<T> | undefined
  /** Label text, or the text with its style. */
  readonly label?: Channel<T, string> | EdgeLabelOptions<T> | undefined
  /**
   * Line pattern: `'solid'`, `'dashed'` or `'dotted'`.
   * @default 'solid'
   */
  readonly dash?: Style<T, EdgeDash> | undefined
  /**
   * Ends that carry an arrow head: `'none'`, `'source'`, `'target'` or `'both'`.
   * @default 'none'
   */
  readonly arrow?: Style<T, EdgeArrow> | undefined
  /** Line color. Wins over `color`. */
  readonly stroke?: Style<T, string> | undefined
  /**
   * Opacity from 0 to 1.
   * @default 1
   */
  readonly opacity?: Style<T, number> | undefined
  /**
   * Zoom at and below which the edge is hidden, in screen pixels per world unit, as in `View`.
   * Above it, the edge fades in over a quarter of a zoom doubling. An edge is also hidden while
   * one of its ends is. A hidden edge is neither picked, exported nor counted. Defaults to no
   * limit.
   */
  readonly minZoom?: Style<T, number | null> | undefined
  /**
   * Zoom at and above which the edge is hidden, in screen pixels per world unit. Below it, the
   * edge fades out over a quarter of a zoom halving. Defaults to no limit.
   */
  readonly maxZoom?: Style<T, number | null> | undefined
  /**
   * When the edge exists: a moment, or a period with optional open ends, in milliseconds or as
   * `Date`. With a time window set, the edge shows only while it and both of its ends exist in the
   * window. `null` or no value: the edge exists whenever its ends do.
   */
  readonly time?: Channel<T, TimeValue> | undefined
  /**
   * Dashes that move along the edge, from its source to its target: `true` at 40 screen pixels per
   * second, a speed in screen pixels per second, negative toward the source, or `false`, `0` or
   * `null` for none. A solid edge flows as dashes, a dashed or dotted edge moves its own pattern.
   * The dashes stand still with `prefers-reduced-motion`.
   * @default false
   */
  readonly flow?: Style<T, boolean | number | null> | undefined
  /**
   * Whether the edge joins the bundles of the `bundling` of the definition. Loops never do. With
   * `false`, the edge stays straight and pulls no other edge.
   * @default true
   */
  readonly bundle?: Style<T, boolean> | undefined
  /**
   * Whether the `routing` of the definition draws the edge along a route around nodes. Loops and
   * geodesic edges never route. With `false`, the edge stays straight.
   * @default true
   */
  readonly route?: Style<T, boolean> | undefined
  /**
   * Whether the edge takes part in the `bridges` of the definition: it jumps over the edges it
   * crosses, or is jumped over. With `false`, it crosses others plainly.
   * @default true
   */
  readonly bridge?: Style<T, boolean> | undefined
  /**
   * Whether the edge follows the shortest path over the Earth, a great circle, between nodes placed
   * by `longitude` and `latitude`, instead of a straight line on the flat map. Such an edge bends
   * toward the poles on a flat map, is cut where it crosses the antimeridian and is never bundled.
   * @default false
   */
  readonly geodesic?: Style<T, boolean> | undefined
  /**
   * Points the edge passes through, in order from its source to its target, such as a route drawn
   * along roads. Its ends stay on the nodes as they move; only the points in between are fixed.
   * Points in degrees cross the antimeridian the short way. Invalid points are skipped; no point
   * draws a plain edge. Such an edge is never bundled, routed, bridged or bent beside parallel
   * edges, and loops ignore it. Its corners are sharp.
   */
  readonly waypoints?: Channel<T, Iterable<WaypointInput>> | undefined
  /**
   * Styles each end of the edge on its own: the line from the source node to the split takes the
   * `source` options, the rest takes the `target` options, and each end can carry a label.
   */
  readonly ends?: EdgeEndsOptions<T> | undefined
  /**
   * Keys of the edges that carry this edge, in the order of the path they form, such as the
   * segments a route runs along: a key or a list of keys. Carriers usually belong to another
   * layer. A key that names no edge is reported in `issues` as `missing-carrier`.
   */
  readonly supportedBy?: Channel<T, Key | readonly Key[]> | undefined
  /**
   * Merges the parallel edges of this mark between two visible nodes into one aggregated edge,
   * styled by `aggregate`: `true`, or options that split the merge by a value, merge both
   * directions or set the fewest edges merged. A new definition that only changes it redraws the
   * merged edges alone. Defaults to `false`: only edges that end in a folded group merge.
   */
  readonly merge?: boolean | EdgeMergeOptions<T> | undefined
  /**
   * Look of the edges drawn in place of the edges of this mark that end in a folded group, or that
   * `merge` merges: one per pair of visible ends, direction and merge value.
   */
  readonly aggregate?: AggregateEdgeOptions<T> | undefined
  /**
   * How the edges of this mark that join different unfolded groups draw: `'members'`, from node to
   * node, or `'groups'`, as one aggregated edge per pair of groups, styled by `aggregate` and drawn
   * from container border to container border. Each end rises to the child of the innermost group
   * that holds both ends, so an edge inside one group stays between its nodes. Edges between groups
   * are never bundled, routed or bridged.
   * @default 'members'
   */
  readonly betweenGroups?: EdgesBetweenGroups | undefined
  /**
   * Scales of this mark alone, each with its own extent and categories, also used by the ends and
   * the aggregated edges of the mark. A scale left out is the one of the definition, shared with
   * the other marks.
   */
  readonly scales?: EdgeScalesOptions | undefined
}

/**
 * How edges that join different unfolded groups draw: `'members'`, between their own nodes, or
 * `'groups'`, as one aggregated edge per pair of groups.
 */
export type EdgesBetweenGroups = 'members' | 'groups'

/** Options of the `merge` option of `edges()`: which parallel edges draw as one. */
export interface EdgeMergeOptions<T> {
  /**
   * Field or function whose value splits the merge: edges with different values between the same
   * two nodes draw as separate aggregated edges, side by side. Edges without a value merge
   * together. Defaults to no split.
   */
  readonly by?: Channel<T, Key> | undefined
  /**
   * Merges only the edges that go the same way. With `false`, edges in both directions merge into
   * one line that points the way of the first edge in its `keys`; `forward` and `backward` of the
   * `AggregateEdge` then tell the two directions apart, for example to style each end on its own.
   * @default true
   */
  readonly directed?: boolean | undefined
  /**
   * Fewest parallel edges that merge between two visible nodes: fewer edges draw one by one. Edges
   * that end in a folded group always merge.
   * @default 2
   */
  readonly min?: number | undefined
}

/**
 * Options of the `ends` option of `edges()`. The edge splits into two parts at `split`, each drawn
 * with the options of its end; an option an end leaves out keeps the value of the edge.
 */
export interface EdgeEndsOptions<T> {
  /**
   * Where the source part ends, as a share of the visible length of the edge, from the border of
   * the source node: 0 gives the whole edge to the target end, 1 to the source end.
   * @default 0.5
   */
  readonly split?: Style<T, number> | undefined
  /** Look of the part next to the source node, and label near the source node. */
  readonly source?: EdgeEndOptions<T> | undefined
  /** Look of the part next to the target node, and label near the target node. */
  readonly target?: EdgeEndOptions<T> | undefined
}

/**
 * Look of one end of an edge. Selection, hover and state styles that set `stroke` or `strokeWidth`
 * apply to both ends.
 */
export interface EdgeEndOptions<T> {
  /**
   * Value passed to the `color` scale of the edge, as its `color` channel, or a CSS color from a
   * function wrapped in `raw()`. Defaults to the color of the edge.
   */
  readonly color?: ColorChannel<T> | undefined
  /** Line color of this end. Wins over `color`. */
  readonly stroke?: Style<T, string> | undefined
  /**
   * Line width of this end in screen pixels, as the `width` channel of the edge: a number or a
   * function wrapped in `raw()`, used as is, or a value passed to its `width` scale. Defaults to the
   * width of the edge. An arrow head at this end follows it.
   */
  readonly width?: NumberChannel<T> | undefined
  /**
   * Line pattern of this end: `'solid'`, `'dashed'` or `'dotted'`. The pattern runs on across the
   * split. Defaults to the pattern of the edge.
   */
  readonly dash?: Style<T, EdgeDash> | undefined
  /**
   * Label near the node of this end, along the edge, or the text with its style. With a
   * `background`, it reads as a badge on the line.
   */
  readonly label?: Channel<T, string> | EdgeLabelOptions<T> | undefined
}

/**
 * Edges of one mark drawn as a single edge, because an end lies in a folded group or because the
 * mark merges its parallel edges: the datum of the `aggregate` channels and styles, and of a picked
 * aggregated edge.
 */
export interface AggregateEdge<T = unknown> {
  /** Key of the visible node or folded group the merged edges start from. */
  readonly source: Key
  /** Key of the visible node or folded group the merged edges end at. */
  readonly target: Key
  /** Number of merged edges. */
  readonly count: number
  /**
   * Keys of the merged edges, in the order they reached the graph: the order of the data for edges
   * loaded together, later edges after earlier ones. The first one styles the aggregated edge.
   */
  readonly keys: readonly Key[]
  /** Data of the merged edges, in the order of `keys`. */
  readonly data: readonly T[]
  /**
   * Merged edges that go from `source` to `target`: all of them, unless `merge` sets `directed` to
   * `false`.
   */
  readonly forward: AggregateDirection<T>
  /**
   * Merged edges that go from `target` to `source`: none, unless `merge` sets `directed` to
   * `false`.
   */
  readonly backward: AggregateDirection<T>
  /** Value of the `by` option of `merge` that the merged edges share. Missing without one. */
  readonly value?: Key
}

/** Merged edges of an `AggregateEdge` that go one way. */
export interface AggregateDirection<T = unknown> {
  /** Number of these edges. */
  readonly count: number
  /** Keys of these edges, in the order of the `keys` of the aggregated edge. */
  readonly keys: readonly Key[]
  /** Data of these edges, in the order of `keys`. */
  readonly data: readonly T[]
}

/**
 * Options of the `aggregate` option of `edges()`: channels and styles read from an `AggregateEdge`.
 * An option left out takes the value of the first merged edge, and labels, end labels included,
 * show only for a single merged edge. Arrows join those of the first edge of each direction.
 */
export type AggregateEdgeOptions<T> = Omit<
  EdgeOptions<AggregateEdge<T>>,
  'name' | 'layer' | 'key' | 'source' | 'target' | 'supportedBy' | 'merge' | 'aggregate' | 'scales'
>

/** A set of nodes or edges, made by `nodes()` or `edges()`. Marks draw in the order given. */
export interface Mark {
  /** Kind of element the mark draws. */
  readonly type: 'nodes' | 'edges'
}

/**
 * A mark that draws one node per item of its data. `N` is the type of its `name` and `L` that of
 * its `layer`, `undefined` for a mark outside any layer.
 */
export interface NodeMark<T, N extends MarkName = MarkName, L extends MarkLayer = undefined>
  extends Mark {
  readonly type: 'nodes'
  /** Name given in the options, or `undefined`. */
  readonly name: N
  /** Layer given in the options, or `undefined`. */
  readonly layer: L
  /** Items of the mark. */
  readonly data: GraphData<T>
  /** Options given to `nodes()`. */
  readonly options: NodeOptions<T, N, L>
}

/**
 * Group node that `groups()` adds for one value of its `by` option: the datum of its channels and
 * styles, and of a picked group.
 */
export interface NodeGroup<T = unknown> {
  /** Key of the group node, made from the name of the mark and the value, apart from data keys. */
  readonly key: Key
  /** Value of `by` that the members share. */
  readonly value: Key
  /** Value of `parent` that the members share, for a group nested in a group of the data. */
  readonly parent?: Key
  /** Number of members. */
  readonly count: number
  /** Keys of the members. */
  readonly keys: readonly Key[]
  /** Data of the members, in the order of `keys`. */
  readonly data: readonly T[]
}

/**
 * Options of `groups()`: which items group together, and the look of the group nodes, read from a
 * `NodeGroup`. A group node folds and unfolds as any group, and edges into a folded group merge.
 */
export interface GroupOptions<T, N extends MarkName = MarkName, L extends MarkLayer = MarkLayer>
  extends Omit<NodeOptions<NodeGroup<T>, N, L>, 'key' | 'parent'> {
  /**
   * Field or function whose value groups the items: one group node per value. An item without a
   * value stays out of any group.
   */
  readonly by: Channel<T, Key>
  /** Field or function that gives the key of an item, the key of its node. Defaults to `id`. */
  readonly key?: KeyChannel<T> | undefined
  /**
   * Group of the data an item belongs to, as the `parent` option of its nodes: groups are then made
   * within each group of the data and nest in it. Defaults to none: a grouped item leaves the
   * group of the data it belongs to.
   */
  readonly parent?: Channel<T, Key> | undefined
  /** Fewest items that make a group; the items of a smaller group stay in place. @default 1 */
  readonly min?: number | undefined
  /**
   * Whether a group node starts folded when it appears, hiding its members.
   * @default true
   */
  readonly folded?: boolean | undefined
}

/**
 * A mark that draws one edge per item of its data. `N` is the type of its `name` and `L` that of
 * its `layer`, `undefined` for a mark outside any layer.
 */
export interface EdgeMark<T, N extends MarkName = MarkName, L extends MarkLayer = undefined>
  extends Mark {
  readonly type: 'edges'
  /** Name given in the options, or `undefined`. */
  readonly name: N
  /** Layer given in the options, or `undefined`. */
  readonly layer: L
  /** Items of the mark. */
  readonly data: GraphData<T>
  /** Options given to `edges()`. */
  readonly options: EdgeOptions<T, N, L>
}

/**
 * Union of the layer names of the marks `M`, a union of marks. `string` when `M` is the plain
 * `Mark` type.
 */
export type LayerName<M extends Mark> = M extends { readonly layer: infer L }
  ? Exclude<L, undefined>
  : string

/**
 * Union of the item types of the node marks among `M`, a union of marks. `unknown` when `M` is the
 * plain `Mark` type.
 */
export type NodeDatum<M extends Mark> =
  M extends NodeMark<infer T, MarkName, MarkLayer>
    ? T
    : M extends { readonly type: 'edges' }
      ? never
      : unknown

/**
 * Union of the item types of the edge marks among `M`, a union of marks. `unknown` when `M` is the
 * plain `Mark` type.
 */
export type EdgeDatum<M extends Mark> =
  M extends EdgeMark<infer T, MarkName, MarkLayer>
    ? T
    : M extends { readonly type: 'nodes' }
      ? never
      : unknown

/**
 * Turns `color` channel values into CSS colors: a function, a categorical scale (the default) or
 * a sequential scale.
 */
export type ColorScale =
  | ((value: unknown) => string)
  | {
      /** Gives each category a color, in order of appearance, cycling through the range. */
      readonly type?: 'categorical' | undefined
      /** Categories that take the first colors, in this order. Others follow as they appear. */
      readonly domain?: readonly unknown[] | undefined
      /** CSS colors. Defaults to `--graph-cat-1` to `--graph-cat-12`. */
      readonly range?: readonly string[] | undefined
    }
  | {
      /** Interpolates colors along a numeric domain, in steps of one percent. */
      readonly type: 'sequential'
      /** Values at both ends, outside which values are clamped. Defaults to the data extent. */
      readonly domain?: readonly [number, number] | undefined
      /** Color stops, spread evenly. Defaults to `--graph-cat-5` then `--graph-cat-1`. */
      readonly range?: readonly string[] | undefined
    }

/** Interpolation of a number scale. `'sqrt'` makes the area of a node follow its value. */
export type NumberScaleType = 'linear' | 'sqrt'

/** Turns `size` or `width` channel values into numbers: a function, a linear or a root scale. */
export type NumberScale =
  | ((value: number) => number)
  | {
      /** Interpolation: `'sqrt'` for `size` and `'linear'` for `width` by default. */
      readonly type?: NumberScaleType | undefined
      /**
       * Values at both ends, outside which values are clamped. Defaults to the data extent: when
       * the data holds a single value, the scale keeps it, clamped to the range.
       */
      readonly domain?: readonly [number, number] | undefined
      /** Output at both ends: `[8, 32]` for `size` and `[1, 6]` for `width` by default. */
      readonly range?: readonly [number, number] | undefined
    }

/** The three scales, shared by every mark of a definition that has no scale of its own. */
export interface ScalesOptions {
  /** Scale of the `color` channel of nodes and edges. Categorical by default. */
  readonly color?: ColorScale | undefined
  /**
   * Scale of the node `size` channel, a diameter. Square root from the data extent to `[8, 32]` by
   * default.
   */
  readonly size?: NumberScale | undefined
  /**
   * Scale of the edge `width` channel, in screen pixels. Linear from the data extent to `[1, 6]` by
   * default.
   */
  readonly width?: NumberScale | undefined
}

/**
 * Options of the `scales` option of `nodes()` and `groups()`: scales of the nodes of one mark,
 * each with its own extent and categories, apart from the other marks.
 */
export interface NodeScalesOptions {
  /** Scale of the `color` channel of the mark. Defaults to the `color` scale of the definition. */
  readonly color?: ColorScale | undefined
  /** Scale of the `size` channel of the mark. Defaults to the `size` scale of the definition. */
  readonly size?: NumberScale | undefined
}

/**
 * Options of the `scales` option of `edges()`: scales of the edges of one mark, of their ends and of
 * their aggregated edges, each with its own extent and categories, apart from the other marks.
 */
export interface EdgeScalesOptions {
  /** Scale of the `color` channel of the mark. Defaults to the `color` scale of the definition. */
  readonly color?: ColorScale | undefined
  /** Scale of the `width` channel of the mark. Defaults to the `width` scale of the definition. */
  readonly width?: NumberScale | undefined
}

/**
 * Look a state gives to elements: its members, or with `others` every element outside it. A
 * property left out keeps the value of the element, or of the next state that sets it.
 */
export interface StateLook {
  /** Multiplies the opacity of the element. */
  readonly opacity?: number | undefined
  /** Fill color of a node. */
  readonly fill?: string | undefined
  /** Inner contour color of a node, line color of an edge. */
  readonly stroke?: string | undefined
  /** Inner contour width of a node, line width of an edge, in screen pixels. */
  readonly strokeWidth?: number | undefined
  /** Color of a ring outside a node, 2 pixels wide without `outlineWidth`. Nodes only. */
  readonly outline?: string | undefined
  /** Width of the ring outside a node, in screen pixels. Nodes only. */
  readonly outlineWidth?: number | undefined
  /** Draws the soft `--graph-halo` glow behind the element. */
  readonly halo?: boolean | undefined
  /**
   * Shows or hides the label while the state applies: `true`, `false`, or `'always'`, which also
   * shows it when it is smaller than 8 pixels or its node is under `minScreenSize`, at 8 pixels
   * at least. An `'always'` label still gives way to labels it would cover.
   */
  readonly label?: boolean | 'always' | undefined
  /** Color of the main text of the label, for nodes and edges. */
  readonly labelColor?: string | undefined
  /**
   * Moving dashes of an edge, as the `flow` option of `edges()`: `true`, a speed in screen pixels
   * per second, or `false` to stop them. Edges only.
   */
  readonly flow?: boolean | number | undefined
  /**
   * Removes the elements from the drawing while they keep their position, selection and other
   * states: they are neither drawn, labeled, picked, exported nor counted, as elements outside the
   * zoom range, and the edges of a hidden node hide with it. An aggregated edge hides when all its
   * merged edges do.
   * @default false
   */
  readonly hide?: boolean | undefined
}

/**
 * Style of a state, for its nodes and its edges. A property left out keeps the value of the
 * element, or of the next state that sets it.
 */
export interface StateStyle extends StateLook {
  /**
   * Draws the members again above every mark, as selected and hovered elements are, and places
   * their labels before the others. An element is raised when any of its states raises it. Defaults
   * to `true` for `selected`, `hovered` and `focused`, and to `false` for free states.
   */
  readonly raise?: boolean | undefined
  /**
   * Look of the elements outside the state, while it has at least one member of any kind: a state
   * of edges can dim the nodes too. It takes the rank of the state in the priority order. In a
   * style by kind, it applies to that kind only.
   */
  readonly others?: StateLook | undefined
  /** Leave out: a style for both kinds sets no style by kind. */
  readonly nodes?: undefined
  /** Leave out: a style for both kinds sets no style by kind. */
  readonly edges?: undefined
}

/**
 * Style of a state by kind of element: one for its nodes, one for its edges. A kind left out takes
 * no style, or the default one for `selected`, `hovered` and `focused`.
 */
export interface StateKindStyles {
  /** Style of the nodes, and with `others` of the nodes outside the state. */
  readonly nodes?: StateStyle | undefined
  /** Style of the edges, and with `others` of the edges outside the state. */
  readonly edges?: StateStyle | undefined
}

/** How clicks select: one element, several with a modifier key, or nothing. */
export type SelectMode = 'single' | 'multiple' | false

/**
 * What a wheel or a two-finger trackpad scroll does without Cmd or Ctrl: `'zoom'` zooms the view,
 * `'pan'` moves it, and `'page'` leaves the event to the page, which scrolls.
 */
export type WheelMode = 'zoom' | 'pan' | 'page'

/** What the user can do with the pointer and the keyboard. */
export interface InteractionOptions {
  /**
   * Move the view by dragging the background, with two fingers, with the wheel in `'pan'` mode,
   * and with Shift and the arrow keys. Code still moves it.
   * @default true
   */
  readonly pan?: boolean | undefined
  /**
   * Zoom with the wheel, a pinch and the keyboard. `{ speed }` multiplies the wheel and trackpad
   * zoom speed, 1 by default: a finite number, 0 or more, or `defineGraph` throws a `RangeError`.
   * Code still zooms.
   * @default true
   */
  readonly zoom?: boolean | { readonly speed?: number | undefined } | undefined
  /**
   * What the wheel does without Cmd or Ctrl: `'zoom'`, `'pan'` or `'page'`. With Cmd or Ctrl,
   * and on a trackpad pinch, it always zooms. In `'page'` mode, each wheel event left to the page
   * emits `zoomhint`.
   * @default 'zoom'
   */
  readonly wheel?: WheelMode | undefined
  /**
   * Scrolls the view while a node drag or a lasso nears the edge of the element, faster closer to
   * it. `{ speed }` multiplies the speed, 1 by default: a finite number, 0 or more, or
   * `defineGraph` throws a `RangeError`. Needs `pan`.
   * @default true
   */
  readonly autoPan?: boolean | { readonly speed?: number | undefined } | undefined
  /**
   * Selection mode, `false` for none. In `'multiple'` mode, Shift, Cmd or Ctrl adds to the
   * selection.
   * @default 'multiple'
   */
  readonly select?: SelectMode | undefined
  /**
   * Drag nodes. Dragging a selected node moves the whole selection.
   * @default true
   */
  readonly drag?: boolean | undefined
  /**
   * Shift and drag from the background draws a lasso that adds the nodes inside to the selection.
   * Needs `select: 'multiple'`.
   * @default false
   */
  readonly lasso?: boolean | undefined
  /**
   * Focus, select and move the view from the keyboard. The graph element becomes focusable.
   * @default true
   */
  readonly keyboard?: boolean | undefined
  /**
   * Double-click on a group, or Enter on a focused group, folds or unfolds it.
   * @default true
   */
  readonly fold?: boolean | undefined
  /**
   * Magnifying lens. `true` or `LensOptions` shows it under the pointer while its key is held, and
   * sets the radius and magnification that `lens.set` starts from. With `false`, only `lens.set`
   * shows it.
   * @default false
   */
  readonly lens?: boolean | LensOptions | undefined
}

/** Options of the magnifying lens, in `interaction.lens`. */
export interface LensOptions {
  /**
   * Radius of the lens, in screen pixels.
   * @default 120
   */
  readonly radius?: number | undefined
  /**
   * Magnification inside the lens, relative to the view zoom, at least 1.
   * @default 3
   */
  readonly zoom?: number | undefined
  /**
   * Key that shows the lens while held, as a `KeyboardEvent.key` value, or `null` to show it from
   * code only. The lens follows the pointer over the graph, otherwise the focused node.
   * @default 'Alt'
   */
  readonly key?: string | null | undefined
}

/** Lens options with every default applied. */
export interface ResolvedLens {
  /** Radius, in screen pixels. */
  readonly radius: number
  /** Magnification relative to the view zoom. */
  readonly zoom: number
  /** Key that shows the lens while held, or `null`. */
  readonly key: string | null
}

/** Interaction options with every default applied, as `defineGraph` resolves them. */
export interface ResolvedInteraction {
  /** Whether gestures move the view. */
  readonly pan: boolean
  /** `false`, or the wheel zoom speed. */
  readonly zoom: false | { readonly speed: number }
  /** What the wheel does without Cmd or Ctrl. */
  readonly wheel: WheelMode
  /** `false`, or the auto-pan speed factor. */
  readonly autoPan: false | { readonly speed: number }
  /** Selection mode. */
  readonly select: SelectMode
  /** Whether nodes can be dragged. */
  readonly drag: boolean
  /** Whether Shift and drag draws a lasso. */
  readonly lasso: boolean
  /** Whether the keyboard drives the graph. */
  readonly keyboard: boolean
  /** Whether double-click and Enter fold and unfold groups. */
  readonly fold: boolean
  /** Radius, magnification and key of the lens; the key is `null` when the lens is off. */
  readonly lens: ResolvedLens
}

/**
 * Area the view cannot leave: a rectangle in world units, or `{ margin }`, the box of every node
 * grown by `margin` screen pixels.
 */
export type ViewBounds = Bounds | { readonly margin: number }

/**
 * Margin on each side of a fitted area, in screen pixels. A side left out takes the `padding` of the
 * `view` of the definition.
 */
export interface FitPadding {
  /** Margin above the area, in screen pixels. */
  readonly top?: number | undefined
  /** Margin right of the area, in screen pixels. */
  readonly right?: number | undefined
  /** Margin below the area, in screen pixels. */
  readonly bottom?: number | undefined
  /** Margin left of the area, in screen pixels. */
  readonly left?: number | undefined
}

/** Margin on each side of a fitted area, in screen pixels, with every side resolved. */
export interface ResolvedPadding {
  /** Margin above the area. */
  readonly top: number
  /** Margin right of the area. */
  readonly right: number
  /** Margin below the area. */
  readonly bottom: number
  /** Margin left of the area. */
  readonly left: number
}

/**
 * When the view frames the nodes on its own: `'first'` frames the first data and follows the first
 * layout run, `'layouts'` follows every layout run as well, and `'never'` leaves the view where it
 * is.
 */
export type AutoFit = 'first' | 'layouts' | 'never'

/**
 * Options of the `view` of `defineGraph`. Gestures, the keyboard, `view.set`, `view.fit`,
 * `view.zoomBy` and animations stay within the limits.
 */
export interface ViewLimitOptions {
  /**
   * Smallest zoom, in screen pixels per world unit.
   * @default 0.001
   */
  readonly minZoom?: number | undefined
  /**
   * Largest zoom, in screen pixels per world unit.
   * @default 64
   */
  readonly maxZoom?: number | undefined
  /**
   * Area the view cannot leave. Where the area is narrower than the view, the area cannot leave
   * the view instead. Applied when the view moves, when the element is resized and when the
   * definition changes, not when the data changes.
   * @default null
   */
  readonly bounds?: ViewBounds | null | undefined
  /**
   * Margin around the nodes framed by every fit, automatic or not, in screen pixels: a number for
   * every side, or a margin per side, such as the room taken by a panel over the graph. A side
   * left out takes 32 pixels.
   * @default 32
   */
  readonly padding?: number | FitPadding | undefined
  /**
   * When the view frames the nodes on its own, with `padding`. `'first'` frames the first data
   * and follows the first layout run until the view moves, unless the graph mounts with
   * `initialView` or `view`; a gesture before the first data cancels that first fit. `'layouts'`
   * does the same, then follows every layout run and frames its end, as long as the view has not
   * moved since the last fit: a gesture, `view.set` or `view.zoomBy` stops it until the next
   * `view.fit`. `'never'` frames nothing. A controlled view receives the fits as requests.
   * @default 'first'
   */
  readonly autoFit?: AutoFit | undefined
}

/** View options with every default applied, as `defineGraph` resolves them. */
export interface ResolvedViewLimits {
  /** Smallest zoom. */
  readonly minZoom: number
  /** Largest zoom. */
  readonly maxZoom: number
  /** Area the view cannot leave, or `null`. */
  readonly bounds: ViewBounds | null
  /** Margin of every fit, per side. */
  readonly padding: ResolvedPadding
  /** When the view frames the nodes on its own. */
  readonly autoFit: AutoFit
}

/**
 * Durations of animated moves, in milliseconds: finite numbers, 0 or more, or `defineGraph` throws
 * a `RangeError`.
 */
export interface TransitionOptions {
  /**
   * Moves of nodes whose `x` or `y` changes in the data.
   * @default 120
   */
  readonly positions?: number | undefined
  /**
   * Glide of nodes to a layout result reported at once.
   * @default 400
   */
  readonly layout?: number | undefined
}

/** Transition durations in milliseconds, with every default applied. */
export interface ResolvedTransitions {
  /** Moves of nodes whose `x` or `y` changes in the data. */
  readonly positions: number
  /** Glide of nodes to a layout result reported at once. */
  readonly layout: number
}

/** Names of the states every graph has. Declare one in `states` to change its style. */
export type BuiltInState = 'selected' | 'hovered' | 'focused'

/** State names of `S` that are not built in: the states you fill from code. */
export type FreeState<S extends string> = Exclude<S, BuiltInState>

/** Style of each state, by name: one style for both kinds of element, or one per kind. */
export type StateStyles<S extends string> = { readonly [K in S]: StateStyle | StateKindStyles }

/**
 * What a layout reads: copies of the graph in typed arrays, indexed by the internal index of each
 * node. `T` is the type of the items of the nodes.
 */
export interface LayoutGraph<T = unknown> {
  /** Length of the per-node arrays. */
  readonly capacity: number
  /** `1` for a node that exists, `0` for a free slot. */
  readonly alive: Uint8Array
  /** `1` for a node the layout may move. */
  readonly movable: Uint8Array
  /** Current positions in world units, `x` then `y` for each index. */
  readonly xy: Float32Array
  /** Radius of each node, in world units: for a `'box'`, the radius of the circle around it. */
  readonly radius: Float32Array
  /**
   * Half width and half height of each node in world units, two numbers per index; a node that is
   * not a `'box'` gives its radius twice. Missing when no node is a box.
   */
  readonly extents?: Float32Array
  /** Pairs of node indices, one pair per edge, loops left out. */
  readonly edges: Uint32Array
  /**
   * Unfolded groups, drawn as containers around their members. Missing when no group is unfolded.
   */
  readonly groups?: LayoutGroups
  /** Key of each node or unfolded group, `undefined` for a free slot. */
  readonly keys: readonly (Key | undefined)[]
  /** Item a node or an unfolded group comes from, as given to `nodes()`. `undefined` otherwise. */
  datum(index: number): T | undefined
}

/**
 * Unfolded groups of a `LayoutGraph`, by internal index. An unfolded group is not a node of the
 * layout: its `alive` is `0`, and its container fits its members plus its padding.
 */
export interface LayoutGroups {
  /** Indices of the unfolded groups, each after the group that holds it. */
  readonly order: Uint32Array
  /** Unfolded group that directly holds each node or group, `-1` at the top level. */
  readonly parent: Int32Array
  /** Space between the members of each group and its outline, in world units. */
  readonly padding: Float32Array
  /** `1` for a group drawn as a circle, `0` for a rectangle. */
  readonly circle: Uint8Array
  /**
   * Space the label of each group takes outside its container, in world units at zoom 1: four
   * numbers per index, above, right of, below and left of the container. Missing when unknown.
   */
  readonly labelSpace?: Float32Array
}

/** Receives the positions a layout computes. Every array holds `capacity × 2` numbers. */
export interface LayoutListener {
  /** Reports intermediate positions, and the progress from 0 to 1. */
  progress(xy: Float32Array, progress: number): void
  /** Reports the final positions, once. Without a `progress` before it, nodes glide there. */
  end(xy: Float32Array): void
}

/** A layout run in progress, as `Layout.start` returns it. */
export interface LayoutRun {
  /** Called when a node is dragged or set during the run: keep it at this position. */
  pin(index: number, x: number, y: number): void
  /** Called when the run is stopped or replaced. Do not call the listener after it. */
  stop(): void
}

/**
 * Places the nodes that have no `x` and `y`. Any object of this shape works, such as the result
 * of `force()` or `grid()`. `T` is the type of the items of the nodes it reads.
 */
export interface Layout<T = unknown> {
  /**
   * Name reported by layout events. With `options`, decides whether a new definition lays out
   * again.
   */
  readonly name: string
  /** Settings, compared one by one with those of the previous definition. */
  readonly options: object
  /**
   * `false` lays out every free node again when nodes arrive. Otherwise only the new nodes run.
   * @default true
   */
  readonly incremental?: boolean | undefined
  /** Starts a run. Nodes that are not movable must keep their place in every array it reports. */
  start(graph: LayoutGraph<T>, listener: LayoutListener): LayoutRun
}

/**
 * What an edge bundling reads: the edges to bundle and a copy of the node positions, by internal
 * index. `T` is the type of the items of the edges.
 */
export interface BundleGraph<T = unknown> {
  /** Node positions in world units, `x` then `y` for each node index. */
  readonly xy: Float32Array
  /** Indices of the edges to bundle. Loops and edges with `bundle: false` are left out. */
  readonly edges: Uint32Array
  /** Source and target node index of each listed edge, in pairs, in the order of `edges`. */
  readonly ends: Uint32Array
  /** Key of the edge at each index, `undefined` for a free slot. */
  readonly keys: readonly (Key | undefined)[]
  /** Item an edge comes from, as given to `edges()`, by edge index. `undefined` otherwise. */
  datum(index: number): T | undefined
}

/**
 * Paths of the listed edges of a `BundleGraph` or a `RouteGraph`, one polyline per edge, in the
 * same order.
 */
export interface BundlePaths {
  /** Index of the first point of each path, then the number of points: `edges.length + 1` values. */
  readonly offsets: Uint32Array
  /**
   * Points in world units, `x` then `y`. Each path starts at its source and ends at its target; a
   * path of two points stays straight. A route may start and end anywhere inside its nodes: the
   * drawn edge starts where the path leaves its source and ends where it enters its target.
   */
  readonly points: Float32Array
}

/** Receives the paths an edge bundling or an edge routing computes. */
export interface BundleListener {
  /** Reports the paths, once. */
  end(paths: BundlePaths): void
}

/** A bundling or routing computation in progress, as `start` returns it. */
export interface BundleRun {
  /** Called when the result is no longer wanted. Do not call the listener after it. */
  stop(): void
}

/**
 * Routes edges into bundles. Any object of this shape works, such as the result of
 * `densityBundling()`. `T` is the type of the items of the edges it reads.
 */
export interface EdgeBundling<T = unknown> {
  /** Name of the method. With `options`, decides whether a new definition computes again. */
  readonly name: string
  /** Settings, compared one by one with those of the previous definition. */
  readonly options: object
  /**
   * Share of the bundled shape drawn, from 0, straight, to 1. A new strength alone eases the edges
   * to it without computing again.
   */
  readonly strength: number
  /** Most edges bundled. Above it, every edge stays straight. */
  readonly maxEdges: number
  /** Starts a computation. */
  start(graph: BundleGraph<T>, listener: BundleListener): BundleRun
}

/**
 * What an edge routing reads: the edges to route, a copy of the node positions and the boxes to go
 * around, by internal index. `T` is the type of the items of the edges.
 */
export interface RouteGraph<T = unknown> extends BundleGraph<T> {
  /**
   * Indices of the edges to route. Loops, geodesic edges, hidden edges and edges with
   * `route: false` are left out.
   */
  readonly edges: Uint32Array
  /**
   * Half width and half height of the box of each node, in world units, `0` for a free slot or a
   * hidden node. An unfolded group has the box of its container, centered on its position.
   */
  readonly extents: Float32Array
  /** Unfolded group that directly holds each node or group, `-1` at the top level. */
  readonly parents: Int32Array
}

/**
 * Routes edges around nodes. Any object of this shape works, such as the result of
 * `orthogonalRouting()`. `T` is the type of the items of the edges it reads.
 */
export interface EdgeRouting<T = unknown> {
  /** Name of the method. With `options`, decides whether a new definition computes again. */
  readonly name: string
  /** Settings, compared one by one with those of the previous definition. */
  readonly options: object
  /**
   * Radius of the rounded corners the graph draws at the bends of each route, in world units. A
   * new radius alone redraws the routes without computing again.
   */
  readonly radius: number
  /** Most edges routed. Above it, every edge stays straight. */
  readonly maxEdges: number
  /** Starts a computation. Edges of the `edges` list are those with `route` left on. */
  start(graph: RouteGraph<T>, listener: BundleListener): BundleRun
}

/** Look of a bridge: `'arc'`, a half circle over the crossed edge, or `'gap'`, a break in the line. */
export type BridgeShape = 'arc' | 'gap'

/**
 * Options of the `bridges` of `defineGraph`. Where two straight or routed edges cross, one of them
 * jumps over the other, so that a crossing does not read as a connection. On routes, the
 * horizontal segment jumps; otherwise the edge drawn later jumps.
 */
export interface BridgeOptions {
  /**
   * Look of each jump: `'arc'`, a half circle over the crossed edge, or `'gap'`, a break in the
   * jumping edge.
   * @default 'arc'
   */
  readonly shape?: BridgeShape | undefined
  /**
   * Width of each jump along the jumping edge, in screen pixels: a positive number, or
   * `defineGraph` throws a `RangeError`. Below zoom 1 it shrinks with the zoom, and under 2 pixels
   * the edges cross plainly.
   * @default 8
   */
  readonly size?: number | undefined
  /**
   * Most edges checked for crossings, 0 or more, `Infinity` for no limit; a negative or `NaN`
   * value makes `defineGraph` throw a `RangeError`. Above it, no edge jumps and a warning is
   * logged in development.
   * @default 100000
   */
  readonly maxEdges?: number | undefined
}

/** Bridge options with every default applied, as `defineGraph` resolves them. */
export interface ResolvedBridges {
  /** Look of each jump. */
  readonly shape: BridgeShape
  /** Width of each jump, in screen pixels. */
  readonly size: number
  /** Most edges checked for crossings. */
  readonly maxEdges: number
}

/**
 * Options of `defineGraph`. `S` is the union of the state names and `M` the union of the marks,
 * both inferred.
 */
export interface GraphDefinitionOptions<S extends string = string, M extends Mark = Mark> {
  /**
   * Results of `nodes()` and `edges()`, drawn in this order. Their item types and names type the
   * targets of events and of the state.
   */
  readonly marks: readonly M[]
  /** `color`, `size` and `width` scales, shared by every mark without a scale of its own. */
  readonly scales?: ScalesOptions | undefined
  /** Free states, and overrides of `selected`, `hovered` and `focused`. At most 29 free states. */
  readonly states?: StateStyles<S> | undefined
  /**
   * Places nodes that have no `x` and `y`, at the first data and when nodes arrive.
   * @default null
   */
  readonly layout?: Layout<NodeDatum<M>> | null | undefined
  /**
   * Runs the layout again over every node it may move after a fold or unfold, or when `groups()`
   * or the `merge` option of a mark changes, so that the drawing closes gaps and makes room. With
   * `false`, only nodes that appear are placed, and an unfolded group pushes its neighbors aside.
   * @default false
   */
  readonly relayout?: boolean | undefined
  /** Pan, zoom, wheel, selection, drag, lasso and keyboard. */
  readonly interaction?: InteractionOptions | undefined
  /** Zoom range and area of the view. */
  readonly view?: ViewLimitOptions | undefined
  /** Durations of animated node moves. */
  readonly transitions?: TransitionOptions | undefined
  /**
   * Grid drawn under everything, which follows the view and adapts its spacing to the zoom.
   * @default null
   */
  readonly background?: BackgroundOptions | null | undefined
  /** Results of `hull()`: shapes around sets of nodes, drawn under edges and nodes, in order. */
  readonly hulls?: readonly Hull<NoInfer<S> | BuiltInState>[] | undefined
  /**
   * Routes edges into bundles once nodes stand still, such as the result of `densityBundling()`.
   * @default null
   */
  readonly bundling?: EdgeBundling<EdgeDatum<M>> | null | undefined
  /**
   * Routes edges around nodes once nodes stand still, such as the result of
   * `orthogonalRouting()`. Not with `bundling`.
   * @default null
   */
  readonly routing?: EdgeRouting<EdgeDatum<M>> | null | undefined
  /**
   * Jumps where two straight or routed edges cross: `true` for the default look, options, or
   * `null` for none.
   * @default null
   */
  readonly bridges?: BridgeOptions | boolean | null | undefined
  /** How elements with a `time` enter and leave the time window. */
  readonly time?: TimeOptions | undefined
  /**
   * Free states that light, whenever the selection changes, the edges that carry the selected
   * edges and the edges they carry, as declared by `supportedBy`.
   * @default null
   */
  readonly support?: SupportStateOptions<FreeState<NoInfer<S>>> | null | undefined
}

/**
 * A frozen graph definition, made by `defineGraph`, with every option resolved. `S` is the union of
 * the state names and `M` the union of the marks.
 */
export interface GraphDefinition<S extends string = string, M extends Mark = Mark> {
  /** Marks, drawn in this order. */
  readonly marks: readonly M[]
  /** Scales shared by every mark without a scale of its own. */
  readonly scales: ScalesOptions
  /** Style of each declared state. */
  readonly states: StateStyles<S>
  /** Layout of the graph, or `null` for none. */
  readonly layout: Layout<NodeDatum<M>> | null
  /** Whether the layout runs again after a fold, an unfold, or a change of groups or merges. */
  readonly relayout: boolean
  /** Interaction options, defaults applied. */
  readonly interaction: ResolvedInteraction
  /** View limits, defaults applied. */
  readonly view: ResolvedViewLimits
  /** Transition durations in milliseconds, defaults applied. */
  readonly transitions: ResolvedTransitions
  /** Grid drawn under the graph, or `null` for none. */
  readonly background: ResolvedBackground | null
  /** Hulls drawn under edges and nodes. */
  readonly hulls: readonly Hull[]
  /** Edge bundling, or `null` for none. */
  readonly bundling: EdgeBundling<EdgeDatum<M>> | null
  /** Edge routing, or `null` for none. */
  readonly routing: EdgeRouting<EdgeDatum<M>> | null
  /** Bridges at edge crossings, defaults applied, or `null` for none. */
  readonly bridges: ResolvedBridges | null
  /** Time options, defaults applied. */
  readonly time: ResolvedTimeOptions
  /** Free states that light the support of the selected edges, or `null` for none. */
  readonly support: ResolvedSupportStates | null
}

/** Options of the `time` of `defineGraph`. */
export interface TimeOptions {
  /**
   * Duration over which an element fades in after the window reaches it and fades out before the
   * window leaves it, in the milliseconds of the data: a finite number, 0 or more, or
   * `defineGraph` throws a `RangeError`. With a fade, an element at the very edge of the window
   * has faded out and counts as hidden.
   * @default 0
   */
  readonly fade?: number | undefined
}

/** Time options with every default applied, as `defineGraph` resolves them. */
export interface ResolvedTimeOptions {
  /** Fade duration, in milliseconds of the data. */
  readonly fade: number
}

/** Pattern of the background grid: `'lines'`, or `'dots'` where the lines would cross. */
export type BackgroundGrid = 'lines' | 'dots'

/**
 * Options of the `background` of `defineGraph`. Lines fall on world multiples of `spacing` times
 * a power of 4 chosen from the zoom: the finest lines fade in as they grow from 4 to 16 pixels
 * apart, and every fourth line takes `majorColor`.
 */
export interface BackgroundOptions {
  /** Draws `'lines'` or `'dots'`. */
  readonly grid: BackgroundGrid
  /**
   * Distance between lines in world units, before the zoom picks a power of 4 of it. A positive
   * number, or `defineGraph` throws a `RangeError`.
   * @default 16
   */
  readonly spacing?: number | undefined
  /**
   * Color of the grid, any CSS color.
   * @default 'var(--graph-grid)'
   */
  readonly color?: string | undefined
  /**
   * Color of every fourth line, where the next coarser level of the grid falls.
   * @default 'var(--graph-grid-major)'
   */
  readonly majorColor?: string | undefined
  /**
   * Switches between levels of the grid as the zoom changes, so that the spacing on screen stays
   * readable. With `false`, a single grid at `spacing` grows and shrinks with the zoom, dots grow
   * as you zoom in, and the grid fades out before it gets too dense.
   * @default true
   */
  readonly adaptive?: boolean | undefined
}

/** Background grid with every default applied, as `defineGraph` resolves it. */
export interface ResolvedBackground {
  /** `'lines'` or `'dots'`. */
  readonly grid: BackgroundGrid
  /** Distance between lines in world units, before the zoom picks a power of 4 of it. */
  readonly spacing: number
  /** Color of the grid. */
  readonly color: string
  /** Color of every fourth line. */
  readonly majorColor: string
  /** Whether the grid switches between levels as the zoom changes. */
  readonly adaptive: boolean
}

/**
 * Outline of a hull: `'rounded'` follows the convex hull of the nodes with round corners,
 * `'smooth'` also bends the sides outward into arcs.
 */
export type HullShape = 'rounded' | 'smooth'

/** Drawing options shared by every hull. `C` is the type of a color option. */
export interface HullStyle<C> {
  /**
   * Outline shape, `'rounded'` or `'smooth'`.
   * @default 'rounded'
   */
  readonly shape?: HullShape | undefined
  /**
   * Space between the outline and the edge of the nodes, in screen pixels. Must be finite, 0 or
   * more.
   * @default 16
   */
  readonly padding?: number | undefined
  /**
   * Color of the outline, also used at 12% for the fill. Without it, the hull takes
   * `--graph-group-fill` and `--graph-group-line`.
   */
  readonly color?: C | undefined
  /** Fill color. Defaults to `color` at 12%, or to `var(--graph-group-fill)`. */
  readonly fill?: C | undefined
  /** Outline color. Defaults to `color`, or to `var(--graph-group-line)`. */
  readonly stroke?: C | undefined
  /**
   * Width of the outline in screen pixels, `0` for none. Must be finite, 0 or more.
   * @default 1
   */
  readonly strokeWidth?: number | undefined
}

/** Options of `hull()` around a list of keys. Keys of missing nodes are skipped. */
export interface HullKeysOptions extends HullStyle<string> {
  /** Keys of the nodes to enclose. */
  readonly nodes: KeyList
}

/** Options of `hull()` around the nodes in a state, updated when the state changes. */
export interface HullStateOptions<N extends string> extends HullStyle<string> {
  /** A free state of the definition, or `'selected'`, `'hovered'` or `'focused'`. */
  readonly state: N
}

/** Options of `hull()` around every node of a mark. */
export interface HullMarkOptions<T> extends HullStyle<string> {
  /** The mark whose nodes are enclosed, as passed to `marks`. */
  readonly nodes: NodeMark<T, MarkName, MarkLayer>
  /** Leave out to draw a single hull. */
  readonly by?: undefined
}

/** Options of `hull()` with one hull per value of a channel. */
export interface HullGroupOptions<T> extends HullStyle<Style<Key, string>> {
  /** The mark whose nodes are grouped, as passed to `marks`. */
  readonly nodes: NodeMark<T, MarkName, MarkLayer>
  /**
   * Field or function giving the group of a node. Nodes without a value are left out, and color
   * functions receive the value.
   */
  readonly by: Channel<T, Key>
}

/** Options of `hull()`, in any of its four forms. */
export type HullOptions<T = unknown, N extends string = string> =
  | HullKeysOptions
  | HullStateOptions<N>
  | HullMarkOptions<T>
  | HullGroupOptions<T>

/** A hull definition, made by `hull()` and passed to `hulls`. `N` is the state it follows. */
export interface Hull<N extends string = string> {
  /** Always `'hull'`. */
  readonly type: 'hull'
  /** The state the hull follows, or `null`. */
  readonly state: N | null
  /** The options given to `hull()`. */
  readonly options: HullOptions<unknown, string>
}

/**
 * Cost of crossing an edge, for path queries: a field of the edge items or a function of an item.
 * Any field name when the item type is unknown.
 */
export type PathWeight<T> = unknown extends T
  ? string | Accessor<T, number | null | undefined>
  : Channel<T, number>

/**
 * Which way path queries cross edges: `'both'` either way, `'forward'` from source to target only,
 * `'backward'` from target to source only.
 */
export type PathDirection = 'both' | 'forward' | 'backward'

/** Options of `paths.shortest`. `M` is the union of the marks, whose items the functions read. */
export interface PathOptions<M extends Mark = Mark> {
  /**
   * Which way edges are crossed: `'both'` either way, `'forward'` from source to target only, so
   * a path follows the arrows, or `'backward'` from target to source only, against them.
   * @default 'both'
   */
  readonly direction?: PathDirection | undefined
  /**
   * Cost of crossing an edge: a field or a function of its item. An edge without a finite weight
   * cannot be crossed, and a negative weight throws a `RangeError`. Without it, every edge costs 1.
   */
  readonly weight?: PathWeight<EdgeDatum<M>> | undefined
  /** Nodes the search may enter, the two ends included: a function of the item and the key. */
  readonly nodes?: ((datum: NodeDatum<M>, key: Key) => boolean) | undefined
  /** Edges the search may cross: a function of the item and the key. */
  readonly edges?: ((datum: EdgeDatum<M>, key: Key) => boolean) | undefined
  /**
   * Searches the graph as drawn: nodes and edges hidden by the time window or by their zoom range
   * are left out, a folded group stands for the nodes it hides, the edges inside it are left out,
   * and an end hidden in a folded group is replaced by the group. Otherwise the search runs on
   * every node and edge of the data, folded, filtered or not.
   * @default false
   */
  readonly visible?: boolean | undefined
}

/** Options of `paths.reach`. `M` is the union of the marks, whose items the functions read. */
export interface ReachOptions<M extends Mark = Mark> extends PathOptions<M> {
  /**
   * Largest cost from the start, which counts edges without `weight`: a number, 0 or more, or
   * `reach` throws a `RangeError`. Defaults to no limit: the whole connected component, every
   * node the start leads to with `'forward'`, or every node that leads to the start with
   * `'backward'`.
   */
  readonly maxCost?: number | undefined
}

/** A path found by `paths.shortest`. Pass it to `states.set` to highlight it, or to `view.fit`. */
export interface GraphPath {
  /** Keys of the nodes along the path, from the start to the end. */
  readonly nodes: readonly Key[]
  /** Keys of the edges along the path, one fewer than the nodes. */
  readonly edges: readonly Key[]
  /** Cost from the start to each node, in the order of `nodes`. */
  readonly costs: readonly number[]
  /** Cost of the whole path: the sum of the weights, or the number of edges without `weight`. */
  readonly cost: number
}

/** Nodes found by `paths.reach`, and the edges between them. Pass it to `states.set`. */
export interface GraphReach {
  /** Keys of the reached nodes, the start first, by increasing cost. */
  readonly nodes: readonly Key[]
  /** Cost of the cheapest path from the start to each node, in the order of `nodes`. */
  readonly costs: readonly number[]
  /** Keys of the edges between two reached nodes that the search may cross. */
  readonly edges: readonly Key[]
}

/** Path queries on the nodes and edges of a graph. `M` is the union of the marks. */
export interface GraphPaths<M extends Mark = Mark> {
  /**
   * Cheapest path between two nodes, or `null` when none joins them or a key is unknown. Without
   * `weight`, the path with the fewest edges.
   */
  shortest(from: Key, to: Key, options?: PathOptions<M>): GraphPath | null
  /**
   * Nodes the start leads to, by increasing cost, up to `maxCost`, and the edges between them.
   * Empty for an unknown key.
   */
  reach(from: Key, options?: ReachOptions<M>): GraphReach
}

/** Path queries on the data of marks, without a mounted graph. `M` is the union of the marks. */
export interface PathFinder<M extends Mark = Mark> extends GraphPaths<M> {
  /** Stops listening to live sources and frees the memory. Later queries find nothing. */
  destroy(): void
}

/** Options of `support.carriers` and `support.carried`. */
export interface SupportWalkOptions {
  /**
   * Most support steps from the start: `1` keeps the edges that carry it, or that it carries,
   * directly. A number, 0 or more, or the walk throws a `RangeError`. Defaults to no limit.
   */
  readonly maxDepth?: number | undefined
}

/**
 * Edges found by `support.carriers` or `support.carried`, and their ends. Pass it to `states.set`
 * to light them.
 */
export interface SupportWalk {
  /**
   * Keys of the edges found, the start left out: by depth, then in the order of the paths. An
   * edge reached twice is listed once, at its first depth.
   */
  readonly edges: readonly Key[]
  /** Support steps from the start to each edge, in the order of `edges`, from 1. */
  readonly depths: readonly number[]
  /** Keys of the ends of these edges, each once. */
  readonly nodes: readonly Key[]
}

/**
 * Support between edges, declared by the `supportedBy` channel of `edges()`: an edge is carried by
 * a path of other edges, which may be carried in turn.
 */
export interface GraphSupport {
  /**
   * Edges that carry the edge, then the edges that carry them, down to edges nothing carries.
   * Carriers that name no edge are skipped. Empty for an unknown key.
   */
  carriers(key: Key, options?: SupportWalkOptions): SupportWalk
  /**
   * Edges the edge carries, then the edges those carry, up to edges that carry nothing. Empty for
   * an unknown key.
   */
  carried(key: Key, options?: SupportWalkOptions): SupportWalk
}

/** Support queries on the data of marks, without a mounted graph. */
export interface SupportFinder extends GraphSupport {
  /** Stops listening to live sources and frees the memory. Later queries find nothing. */
  destroy(): void
}

/**
 * Options of the `support` of `defineGraph`: free states that light the support of the selected
 * edges, transitively, with the ends of the lit edges.
 */
export interface SupportStateOptions<N extends string = string> {
  /** Free state given to the edges that carry the selected edges, and to their ends. */
  readonly carriers?: N | null | undefined
  /** Free state given to the edges the selected edges carry, and to their ends. */
  readonly carried?: N | null | undefined
}

/** Support states with every default applied, as `defineGraph` resolves them. */
export interface ResolvedSupportStates {
  /** Free state of the carriers of the selected edges, or `null`. */
  readonly carriers: string | null
  /** Free state of the edges the selected edges carry, or `null`. */
  readonly carried: string | null
}
