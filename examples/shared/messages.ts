export const messages = {
  title: 'Exemples de graphes',
  vanilla: 'Exemple vanilla',
  graphLabel: (nodes: string, edges: string) => `Graphe de ${nodes} nœuds et ${edges} arêtes`,
  fit: 'Recadrer',
  dark: 'Thème sombre',
  light: 'Thème clair',
  size: 'Taille',
  node: (index: string) => `Nœud ${index}`,
  group: (index: string) => `Groupe ${index}`,
  selection: (nodes: number, edges: number): string => {
    if (nodes === 0 && edges === 0) return 'Aucune sélection'
    const parts: string[] = []
    if (nodes > 0) parts.push(`${formatNumber(nodes)} ${plural(nodes, 'nœud', 'nœuds')}`)
    if (edges > 0) parts.push(`${formatNumber(edges)} ${plural(edges, 'arête', 'arêtes')}`)
    return `${parts.join(' et ')} ${plural(nodes + edges, 'sélectionné', 'sélectionnés')}`
  },
}

const plurals = new Intl.PluralRules('fr-FR')

function plural(count: number, one: string, other: string): string {
  return plurals.select(count) === 'one' ? one : other
}

const numbers = new Intl.NumberFormat('fr-FR')

export function formatNumber(value: number): string {
  return numbers.format(value)
}
