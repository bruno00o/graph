import { pageSchema } from 'fumadocs-core/source/schema'
import { defineCollections } from 'fumadocs-mdx/macro'

export const pages = defineCollections({
  type: 'doc',
  dir: 'content/pages',
  schema: pageSchema,
})
