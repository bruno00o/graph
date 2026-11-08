import type { GraphInstance } from '@bruno00o/graph'
import type { ComponentType, Ref } from 'react'

export interface ShowcaseFeature {
  readonly text: string
  readonly page: string
}

export interface ShowcaseSource {
  readonly name: string
  readonly url: string
  readonly license: string
  readonly licenseUrl: string
  readonly build: string
}

export interface ShowcaseMeta {
  readonly title: string
  readonly description: string
  readonly domain: string
  readonly order: number
  readonly tags: readonly string[]
  readonly features: readonly ShowcaseFeature[]
  readonly api: readonly string[]
  readonly source: ShowcaseSource
}

export type ShowcaseApp = ComponentType<{ readonly ref: Ref<GraphInstance | null> }>

export interface ShowcaseModule {
  readonly App?: ShowcaseApp
}

export interface Showcase extends ShowcaseMeta {
  readonly slug: string
  readonly images: { readonly light: string; readonly dark: string } | null
  readonly load: () => Promise<ShowcaseApp>
}
