import {
  type SearchResult,
  type SearchResultItem,
  useStaticSearch,
} from 'fumadocs-core/search/client'
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
} from 'fumadocs-ui/components/dialog/search'
import type { SharedProps } from 'fumadocs-ui/contexts/search'
import { type JSX, useMemo } from 'react'
import { messages } from '../messages'

function dropRoot<T extends { readonly breadcrumbs?: string[] }>(record: T): T {
  return record.breadcrumbs ? { ...record, breadcrumbs: record.breadcrumbs.slice(1) } : record
}

function withoutRoot(item: SearchResultItem): SearchResultItem {
  return item.type === 'table' ? { ...item, rows: item.rows.map(dropRoot) } : dropRoot(item)
}

function trimmed(data: SearchResult | undefined): { data?: SearchResult } {
  return data ? { data: { ...data, items: data.items.map(withoutRoot) } } : {}
}

export default function StaticSearchDialog(props: SharedProps): JSX.Element {
  const { data, ...search } = useStaticSearch({ from: `${import.meta.env.BASE_URL}api/search` })
  const results = useMemo(() => trimmed(data), [data])
  return (
    <SearchDialog {...search} {...results} {...props}>
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput placeholder={messages.search.placeholder} />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList Empty={() => <p className="search-empty">{messages.search.none}</p>} />
      </SearchDialogContent>
    </SearchDialog>
  )
}
