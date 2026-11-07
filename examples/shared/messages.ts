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
  groupMode: 'Groupes',
  groupModes: { none: 'Aucun', nested: 'Communautés imbriquées' },
  hierarchyGroupModes: { none: 'Aucun', nested: 'Branches imbriquées' },
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
  vanillaHint: 'Maj et clic sur deux nœuds pour tracer un chemin, Maj et glisser pour entourer.',
  pathMode: 'Chemin',
  pathModes: { hops: 'Moins d’arêtes', strength: 'Liens les plus forts' },
  pathFound: (edges: number, ms: number): string =>
    `Chemin\u00a0: ${formatNumber(edges)} ${plural(edges, 'arête', 'arêtes')}, ${decimal.format(ms)}\u00a0ms`,
  noPath: (ms: number): string => `Aucun chemin, ${decimal.format(ms)}\u00a0ms`,
  flows: 'Flux animés',
  graphLabel: (nodes: string, edges: string) => `Graphe de ${nodes} nœuds et ${edges} arêtes`,
  fit: 'Recadrer',
  wheel: 'Molette',
  wheelModes: { zoom: 'Zoomer', pan: 'Déplacer la vue', page: 'Faire défiler la page' },
  bounds: 'Limites',
  boundsModes: { none: 'Aucune', nodes: 'Autour des nœuds' },
  zoomHint: (key: 'Meta' | 'Control'): string =>
    `Maintenez ${key === 'Meta' ? '⌘' : 'Ctrl'} et faites défiler pour zoomer`,
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
  filter: 'Filtre TanStack DB',
  filterLabel: 'Graphe filtré par une collection TanStack DB',
  filterHint: 'Double-cliquez sur un nœud pour charger ses arêtes.',
  minimumWeight: 'Poids minimal',
  groupFilter: 'Groupe',
  allGroups: 'Tous',
  filterSource: 'Source',
  filterSources: { subset: 'Abonnement filtré', query: 'Requête vivante' },
  filterTiming: (database: number, graph: number): string =>
    `TanStack DB : ${milliseconds(database)}, graphe : ${milliseconds(graph)}`,
  linksLoaded: (count: number): string =>
    `${formatNumber(count)} ${plural(count, 'arête chargée', 'arêtes chargées')}`,
  unload: 'Décharger les arêtes',
  drawing: 'Grille, enveloppes et ancres',
  drawingHint: 'Cliquez sur un nœud pour afficher sa barre d’outils, Maj pour en ajouter.',
  background: 'Fond',
  backgrounds: { lines: 'Lignes', dots: 'Points', zoomDots: 'Points au zoom', none: 'Aucun' },
  hulls: 'Enveloppes',
  hullModes: { groups: 'Par groupe', selection: 'Sélection', none: 'Aucune' },
  hullShape: 'Forme',
  hullShapes: { rounded: 'Arrondie', smooth: 'Lisse' },
  frameSelection: 'Cadrer',
  clearSelection: 'Désélectionner',
  selectionCount: (count: number): string =>
    `${formatNumber(count)} ${plural(count, 'nœud', 'nœuds')}`,
  tooltipWeight: (group: string, weight: number): string =>
    `${group}, poids ${formatNumber(weight)}`,
  link: (from: string, to: string): string => `${from} vers ${to}`,
  groups: 'Groupes imbriqués',
  groupsLabel: 'Graphe de nœuds rangés dans des groupes imbriqués',
  groupsHint: 'Double-cliquez sur un groupe pour le replier ou le déplier.',
  subgroup: (index: string) => `Sous-groupe ${index}`,
  foldAll: 'Tout replier',
  unfoldAll: 'Tout déplier',
  foldedGroups: (count: number): string =>
    `${formatNumber(count)} ${plural(count, 'groupe replié', 'groupes repliés')}`,
  mergedEdges: (count: number, from: string, to: string): string =>
    `${formatNumber(count)} ${plural(count, 'arête', 'arêtes')} de ${from} vers ${to}`,
  exportPng: 'Exporter en PNG',
  exportSvg: 'Exporter en SVG',
  map: 'Carte',
  mapLabel: (places: number, routes: number): string =>
    `Carte de ${formatNumber(places)} ${plural(places, 'lieu', 'lieux')} et ${formatNumber(routes)} ${plural(routes, 'liaison', 'liaisons')}`,
  mapHint:
    'Maj\u00a0+\u00a0glisser entoure des lieux, la carte se déplace et zoome comme d’habitude.',
  place: (index: string): string => `Lieu ${index}`,
  projection: 'Projection',
  projections: { globe: 'Globe', mercator: 'Carte plane' },
  farRoutes: 'Liaisons lointaines',
  farRouteModes: { geodesic: 'Grands cercles', straight: 'Lignes droites' },
  volume: 'Volume',
  places: (count: number): string => `${formatNumber(count)} ${plural(count, 'lieu', 'lieux')}`,
  exporting: 'Export en cours…',
  minimap: 'Minicarte',
  minimapModes: { on: 'Affichée', off: 'Masquée' },
  legendLabel: 'Légende',
  legendTitles: { color: 'Groupe', size: 'Poids' },
  bundling: 'Regroupement des arêtes',
  bundlingHint: 'Glissez un nœud\u00a0: les arêtes se regroupent de nouveau à l’arrêt.',
  bundlingMode: 'Regroupement',
  bundlingModes: { on: 'Activé', off: 'Désactivé' },
  strength: 'Intensité',
  strengths: { '0.5': 'Faible', '0.85': 'Moyenne', '1': 'Forte' },
  reach: 'Portée',
  reaches: { '0.03': 'Courte', '0.06': 'Moyenne', '0.12': 'Longue' },
  bundlingRunning: 'Regroupement en cours…',
  bundlingDone: (ms: number): string => `Regroupé en ${milliseconds(ms)}`,
  rebundle: 'Regrouper maintenant',
  zoomDetail: 'Détail selon le zoom',
  zoomDetailHint:
    'Zoomez\u00a0: les nœuds apparaissent par niveaux, les liens entre pôles s’effacent.',
  zoomStatus: (zoom: number, shown: number): string =>
    `Zoom ×${decimal.format(zoom)}, ${shown} ${plural(shown, 'niveau affiché', 'niveaux affichés')} sur 3`,
  time: 'Évolution dans le temps',
  timeHint: 'Lancez la lecture, ou glissez sur l’histogramme pour choisir une période.',
  timeLabel: 'Frise chronologique des nœuds et des arêtes',
  timeLabels: {
    play: 'Lecture',
    start: 'Début de la période',
    end: 'Fin de la période',
    window: 'Période',
  },
  timeRange: (start: string, end: string): string => `du ${start} au ${end}`,
  timeAll: 'Toute la période',
  timeStatus: (start: number | null, end: number | null): string =>
    start === null && end === null
      ? 'Toute la période'
      : start === null
        ? `Jusqu’au ${longDate.format(end ?? 0)}`
        : end === null
          ? `Depuis le ${longDate.format(start)}`
          : `Du ${longDate.format(start)} au ${longDate.format(end)}`,
  timeMode: 'Lecture',
  timeModes: { slide: 'Fenêtre glissante', grow: 'Cumul' },
  speed: 'Vitesse',
  speeds: { '0.5': '×0,5', '1': '×1', '2': '×2', '4': '×4' },
  showAll: 'Tout afficher',
  lens: 'Loupe',
  lensHint:
    'Maintenez Alt (⌥) au-dessus du graphe pour voir la loupe sous le pointeur ; la molette sur la loupe règle son grossissement.',
  lensFixed: 'Loupe fixe',
  lensHide: 'Masquer la loupe',
  lensZoom: 'Grossissement',
  lensFactor: (zoom: number): string => `×${decimal.format(zoom)}`,
  lensStatus: (zoom: number): string => `Loupe ×${decimal.format(zoom)}`,
  lensOff: 'Loupe masquée',
  ends: 'Extrémités des arêtes',
  endsLabel: 'Graphe de six nœuds reliés par des échanges dans les deux sens',
  endsHint: 'Chaque moitié d’arête suit l’envoi du nœud dont elle part.',
  endSplit: 'Partage',
  endSplits: { half: 'Au milieu', share: 'Selon les volumes' },
  endLabels: 'Libellés',
  endLabelModes: { none: 'Aucun', plain: 'Texte', plated: 'Pastilles' },
  sent: (node: string, value: number): string => `${node} envoie ${formatNumber(value)}`,
  units: (value: number): string => formatNumber(value),
}

function milliseconds(value: number): string {
  return `${formatNumber(Math.round(value))} ms`
}

const plurals = new Intl.PluralRules('fr-FR')

function plural(count: number, one: string, other: string): string {
  return plurals.select(count) === 'one' ? one : other
}

const numbers = new Intl.NumberFormat('fr-FR')
const percent = new Intl.NumberFormat('fr-FR', { style: 'percent' })
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
const longDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })

export function formatNumber(value: number): string {
  return numbers.format(value)
}
