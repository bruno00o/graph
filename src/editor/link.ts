import type { GraphInstance } from '../host/graph-instance'
import type { ShapeChangeEdit, ShapeEdit } from './edits'

export interface GestureWatcher {
  moved(): void
  cancelled(revert: () => readonly ShapeChangeEdit[]): void
}

export interface EditorLink {
  readonly graph: GraphInstance
  watch(watcher: GestureWatcher): () => void
  current(): readonly ShapeChangeEdit[]
  answer(edits: readonly ShapeEdit[]): void
  lose(edits: readonly ShapeEdit[]): void
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
