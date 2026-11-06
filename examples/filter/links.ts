import {
  type Collection,
  createCollection,
  type LoadSubsetOptions,
  parseWhereExpression,
} from '@tanstack/db'
import type { Link } from '../shared/data'

function endsOf(where: LoadSubsetOptions['where']): Set<string> {
  if (!where) return new Set()
  const keys = parseWhereExpression<string[]>(where, {
    handlers: {
      in: (_field: string[], values: string[]) => values,
      or: (...lists: string[][]) => lists.flat(),
    },
  })
  return new Set(keys ?? [])
}

export function createLinkCollection(
  links: readonly Link[],
  onChange: () => void,
  latency = 150,
): Collection<Link, string> {
  const touching = new Map<string, Link[]>()
  for (const link of links) {
    for (const end of [link.from, link.to]) {
      const list = touching.get(end)
      if (list) list.push(link)
      else touching.set(end, [link])
    }
  }
  return createCollection<Link, string>({
    id: 'filter-links',
    getKey: (link) => link.id,
    syncMode: 'on-demand',
    sync: {
      sync: ({ begin, write, commit, markReady, collection }) => {
        markReady()
        const owners = new Map<string, number>()
        const requests = new Map<LoadSubsetOptions, Link[]>()
        return {
          loadSubset: async (options) => {
            const found = new Map<string, Link>()
            for (const end of endsOf(options.where)) {
              for (const link of touching.get(end) ?? []) found.set(link.id, link)
            }
            const rows = [...found.values()]
            requests.set(options, rows)
            for (const row of rows) owners.set(row.id, (owners.get(row.id) ?? 0) + 1)
            await new Promise((resolve) => setTimeout(resolve, latency))
            if (!requests.has(options)) return
            begin()
            for (const row of rows) {
              if (!collection.has(row.id)) write({ type: 'insert', value: row })
            }
            commit()
            onChange()
          },
          unloadSubset: (options) => {
            const rows = requests.get(options) ?? []
            requests.delete(options)
            begin()
            for (const row of rows) {
              const count = (owners.get(row.id) ?? 1) - 1
              if (count > 0) {
                owners.set(row.id, count)
                continue
              }
              owners.delete(row.id)
              if (collection.has(row.id)) write({ type: 'delete', key: row.id })
            }
            commit()
            onChange()
          },
        }
      },
    },
  })
}
