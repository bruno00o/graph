import { defineCollections } from 'fumadocs-mdx/macro'

export const exampleNotes = defineCollections({
  type: 'doc',
  dir: 'src/examples',
  files: ['*/notes.mdx'],
  async: true,
})
