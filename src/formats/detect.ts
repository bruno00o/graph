import type { GraphFormat } from './types'

const prolog = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>/g

/**
 * Guess the format of a file from its first characters: JSON Graph Format for a JSON object,
 * GraphML or GEXF from the root element of an XML document, CSV otherwise. `null` for an empty
 * text or another XML document.
 */
export function detectFormat(text: string): GraphFormat | null {
  const start = text.search(/[^\s﻿]/)
  if (start === -1) return null
  const first = text.charAt(start)
  if (first === '{') return 'json-graph'
  if (first !== '<') return 'csv'
  const head = text.slice(start, start + 65536).replace(prolog, '')
  const root = /<(?:[\w.-]+:)?([\w.-]+)/.exec(head)
  if (root?.[1] === 'graphml') return 'graphml'
  if (root?.[1] === 'gexf') return 'gexf'
  return null
}
