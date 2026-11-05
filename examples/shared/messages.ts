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
}

const numbers = new Intl.NumberFormat('fr-FR')

export function formatNumber(value: number): string {
  return numbers.format(value)
}
