import type { GraphInstance } from '@bruno00o/graph'
import type { ComponentType, Ref } from 'react'
import type { CategoryId } from './categories'

export const exampleTags = [
  'Vanilla',
  'React',
  'TanStack DB',
  'TanStack Query',
  'TanStack Devtools',
] as const

export type ExampleTag = (typeof exampleTags)[number]

export interface ExampleMeta {
  readonly title: string
  readonly description: string
  readonly hint: string
  readonly category: CategoryId
  readonly order: number
  readonly tags: readonly ExampleTag[]
  readonly api: readonly string[]
  readonly guides: readonly string[]
  readonly harness?: { readonly select?: boolean }
}

export type ExampleKind = 'vanilla' | 'react'

export interface ExampleModule {
  readonly mount?: (container: HTMLElement) => GraphInstance
  readonly Example?: ComponentType<{ readonly ref: Ref<GraphInstance | null> }>
}

export type LoadedExample =
  | { readonly kind: 'vanilla'; readonly mount: (container: HTMLElement) => GraphInstance }
  | {
      readonly kind: 'react'
      readonly Example: ComponentType<{ readonly ref: Ref<GraphInstance | null> }>
    }

export interface Thumbnail {
  readonly light: string
  readonly dark: string
}

export interface Example extends ExampleMeta {
  readonly slug: string
  readonly kind: ExampleKind
  readonly entry: string
  readonly thumbnail: Thumbnail | null
  readonly load: () => Promise<LoadedExample>
}
