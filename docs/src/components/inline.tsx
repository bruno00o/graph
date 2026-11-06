import type { ReactNode } from 'react'

export function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  let at = 0
  for (const match of text.matchAll(/`([^`]+)`/g)) {
    if (match.index > at) parts.push(text.slice(at, match.index))
    parts.push(<code key={match.index}>{match[1]}</code>)
    at = match.index + match[0].length
  }
  if (at < text.length) parts.push(text.slice(at))
  return parts
}
