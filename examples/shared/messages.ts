export const messages = {
  title: 'Exemples de graphes',
  vanilla: 'Exemple vanilla',
  react: 'Exemple React',
  collab: 'Exemple collaboratif',
  edges: 'Arêtes parallèles et boucles',
  edgesLabel: 'Graphe de cinq nœuds reliés par des arêtes parallèles et des boucles',
  route: (from: string, to: string): string => `Arête de ${from} vers ${to}`,
  edgeName: (index: number): string => `lien ${index}`,
  edgeLabels: 'Libellés des arêtes',
  nodes: 'Images, badges et contours',
  nodesLabel: 'Graphe de douze nœuds avec des images, des icônes, des badges et des contours',
  labelBackgrounds: 'Fond des libellés',
  labels: 'Styles des libellés',
  labelsLabel: 'Graphe de douze nœuds aux libellés de tailles, couleurs et positions variées',
  placement: (value: string): string => `Position\u00a0: ${value}`,
  placements: {
    bottom: 'dessous',
    top: 'dessus',
    right: 'à droite',
    left: 'à gauche',
    center: 'au centre',
  },
  truncate: 'Couper les libellés longs',
  longLabel: (index: string): string => `Nœud au libellé particulièrement long ${index}`,
  twoLines: (index: string): string => `Nœud ${index}\nsur deux lignes`,
  layout: 'Layout de forces',
  layouts: 'Layouts',
  layoutsHint: 'Maj\u00a0+\u00a0glisser entoure des nœuds à réarranger.',
  layoutKind: 'Layout',
  layoutKinds: {
    layers: 'Couches',
    force: 'Forces',
    grid: 'Grille',
    rings: 'Anneaux',
    radial: 'Radial',
  },
  arrange: 'Arranger la sélection',
  layoutHint: 'Glissez un nœud pendant le calcul pour l’épingler.',
  layoutProgress: (value: number): string => `Calcul\u00a0: ${percent.format(value)}`,
  layoutDone: (seconds: number): string => `Calculé en ${decimal.format(seconds)}\u00a0s`,
  layoutStopped: 'Calcul arrêté',
  relaunch: 'Relancer',
  stop: 'Arrêter',
  grow: 'Ajouter dix nœuds',
  engine: 'Calcul',
  engines: { auto: 'Automatique', gpu: 'Carte graphique', cpu: 'Processeur' },
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
  direction: 'Sens',
  directions: {
    down: 'Vers le bas',
    up: 'Vers le haut',
    right: 'Vers la droite',
    left: 'Vers la gauche',
  },
}

const plurals = new Intl.PluralRules('fr-FR')

function plural(count: number, one: string, other: string): string {
  return plurals.select(count) === 'one' ? one : other
}

const numbers = new Intl.NumberFormat('fr-FR')
const percent = new Intl.NumberFormat('fr-FR', { style: 'percent' })
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

export function formatNumber(value: number): string {
  return numbers.format(value)
}
