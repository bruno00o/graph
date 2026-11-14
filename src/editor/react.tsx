import { useCallback, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import type { GraphInstance } from '../host/mount-graph'
import { useGraphOf, useLatest } from '../react/context'
import type { Mark } from '../types'
import {
  createShapeEditor,
  type ShapeEditor as ShapeEditorInstance,
  type ShapeEditorOptions,
  type ShapeEditorState,
} from './editor'
import type { ShapeEdit } from './edits'
import { mountShapeEditor } from './view'

/** Options of `useShapeEditor`: the options of `createShapeEditor`, and the graph. */
export interface UseShapeEditorOptions<S extends string = string, M extends Mark = Mark>
  extends ShapeEditorOptions<M> {
  /**
   * Graph whose shapes to edit, which types the edits. Defaults to the graph of the enclosing
   * `<Graph>` or `<MapGraph>`. With `null`, nothing is edited until a graph is given.
   */
  readonly graph?: GraphInstance<S, M> | null | undefined
}

/** What `useShapeEditor` returns. `M` types the edits. */
export interface UseShapeEditorResult<M extends Mark = Mark> {
  /** State of the editor, empty until the first layout effect. */
  readonly state: ShapeEditorState
  /** The editor, to remove shapes or cancel a gesture, or `null` until the first layout effect. */
  readonly editor: ShapeEditorInstance<M> | null
}

/** Props of `<ShapeEditor>`: the options of `useShapeEditor`. */
export interface ShapeEditorProps<S extends string = string, M extends Mark = Mark>
  extends UseShapeEditorOptions<S, M> {}

const emptyState: ShapeEditorState = Object.freeze({
  selected: Object.freeze([]),
  gesture: null,
  pending: Object.freeze([]),
})

function sameMarks(a: Iterable<string> | undefined, b: Iterable<string> | undefined): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  const left = [...a]
  const right = [...b]
  return left.length === right.length && left.every((name, index) => name === right[index])
}

/**
 * Edits the shapes of a graph with the pointer and the keys, draws the editor over the graph, and
 * renders again when its state changes. Without `graph`, it edits the enclosing `<Graph>` or
 * `<MapGraph>`: pass the state names and the marks as type arguments to type the edits.
 */
export function useShapeEditor<S extends string = string, M extends Mark = Mark>(
  options: UseShapeEditorOptions<S, M> = {},
): UseShapeEditorResult<M> {
  const graph = useGraphOf(options.graph, 'useShapeEditor')
  const [editor, setEditor] = useState<ShapeEditorInstance<M> | null>(null)
  const latest = useLatest(options)
  const [shown] = useState(() => ({ marks: options.marks as Iterable<string> | undefined }))
  useLayoutEffect(() => {
    if (!graph) return
    const { marks, hold, handleSize } = latest.current
    const created = createShapeEditor(graph, {
      marks,
      hold,
      handleSize,
      onEdit: (edits: readonly ShapeEdit<M>[]) => latest.current.onEdit?.(edits),
    })
    shown.marks = marks as Iterable<string> | undefined
    const view = mountShapeEditor(created)
    setEditor(created)
    return () => {
      view.destroy()
      created.destroy()
      setEditor(null)
    }
  }, [graph, latest, shown])
  const { marks, hold, handleSize } = options
  useLayoutEffect(() => {
    if (!editor) return
    const names = marks as Iterable<string> | undefined
    if (sameMarks(shown.marks, names)) editor.update({ hold, handleSize })
    else {
      shown.marks = names
      editor.update({ marks, hold, handleSize })
    }
  }, [editor, marks, hold, handleSize, shown])
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!editor) return () => {}
      const subscription = editor.store.subscribe(() => notify())
      return () => subscription.unsubscribe()
    },
    [editor],
  )
  const snapshot = (): ShapeEditorState => editor?.store.state ?? emptyState
  const state = useSyncExternalStore(subscribe, snapshot, snapshot)
  return { state, editor }
}

/**
 * Edits the shapes of a graph with the pointer and the keys, and draws the editor over the graph.
 * Without `graph`, it edits the enclosing `<Graph>` or `<MapGraph>`. Renders nothing itself.
 */
export function ShapeEditor<S extends string = string, M extends Mark = Mark>(
  props: ShapeEditorProps<S, M>,
): null {
  useShapeEditor(props)
  return null
}
