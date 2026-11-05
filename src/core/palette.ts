export class Palette {
  readonly #ids = new Map<string, number>()
  readonly #colors: string[] = []

  get colors(): readonly string[] {
    return this.#colors
  }

  get version(): number {
    return this.#colors.length
  }

  id(color: string): number {
    let id = this.#ids.get(color)
    if (id === undefined) {
      id = this.#colors.length
      this.#ids.set(color, id)
      this.#colors.push(color)
    }
    return id
  }
}
