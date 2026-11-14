import type { GraphInstance } from '../host/graph-instance'
import type { Mark, WritableShapeGeometry } from '../types'
import type { ShapeChangeEdit, ShapeEdit } from './edits'

type HandedChange = ShapeChangeEdit<Mark, WritableShapeGeometry>
type Handed = ShapeEdit<Mark, WritableShapeGeometry>

export interface GestureWatcher {
  moved(): void
  cancelled(revert: () => readonly HandedChange[]): void
}

export interface EditorLink {
  readonly graph: GraphInstance
  watch(watcher: GestureWatcher): () => void
  current(): readonly HandedChange[]
  answer(edits: readonly Handed[]): void
  lose(edits: readonly Handed[]): void
}

const links = new WeakMap<object, EditorLink>()

export function linkEditor(editor: object, link: EditorLink): void {
  links.set(editor, link)
}

export function editorLink(editor: object, caller: string): EditorLink {
  const link = links.get(editor)
  if (!link) throw new Error(`${caller}: needs an editor made by createShapeEditor`)
  return link
}
