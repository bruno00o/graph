import { pageSchema } from 'fumadocs-core/source/schema'
import { defineCollections } from 'fumadocs-mdx/macro'

export const exampleNotes = defineCollections({
  type: 'doc',
  dir: 'content/examples',
  schema: pageSchema,
})
