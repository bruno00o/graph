import { defineCollections } from 'fumadocs-mdx/macro'

export const markdownDocs = defineCollections({
  type: 'doc',
  dir: 'content/docs',
  async: true,
  postprocess: { includeProcessedMarkdown: true },
})
