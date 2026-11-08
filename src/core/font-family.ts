export type LoadedFamilies = ReadonlySet<string> | null

export function familyName(name: string): string {
  return name
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim()
    .toLowerCase()
}

export function usesFamily(font: string, loaded: LoadedFamilies): boolean {
  if (loaded === null) return true
  for (const part of font.split(',')) {
    if (loaded.has(familyName(part))) return true
  }
  return false
}
