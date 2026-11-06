export const messages = {
  title: 'Exemples de graphes',
  vanilla: 'Exemple vanilla',
  react: 'Exemple React',
  collab: 'Exemple collaboratif',
  edges: 'Arêtes parallèles et boucles',
  edgesLabel: 'Graphe de cinq nœuds reliés par des arêtes parallèles et des boucles',
  route: (from: string, to: string): string => `Arête de ${from} vers ${to}`,
  nodes: 'Images et badges',
  nodesLabel: 'Graphe de douze nœuds avec des images, des icônes et des badges',
  mute: 'Atténuer la moitié',
  collabHint: 'Ouvrez cette page dans un second onglet : chaque déplacement s’y voit en direct.',
  reset: 'Réinitialiser les positions',
  explore: 'Exemple d’exploration',
  exploreHint: 'Double-cliquez sur un nœud pour déplier ou replier son voisinage.',
  exploreLabel: 'Graphe exploré pas à pas',
  restart: 'Recommencer',
  loading: 'Chargement…',
  explored: (count: number): string =>
    `${formatNumber(count)} ${plural(count, 'nœud déplié', 'nœuds dépliés')}`,
  bench: (nodes: string, edges: string) => `Banc d’essai, ${nodes} nœuds et ${edges} arêtes`,
  weight: 'Poids',
  selected: 'Sélection',
  empty: 'Cliquez sur un nœud, Maj pour en ajouter.',
  vanillaHint: 'Maj et glisser pour entourer, flèches pour parcourir, Entrée pour sélectionner.',
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
