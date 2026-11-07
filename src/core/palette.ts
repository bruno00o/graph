export class Palette {
  readonly #ids = new Map<string, number>()
  readonly #colors: string[] = []
  #uses: Int32Array = new Int32Array(0)
  #pinned: Uint8Array = new Uint8Array(0)
  #queued: Uint8Array = new Uint8Array(0)
  #stamps: Uint32Array = new Uint32Array(0)
  readonly #idle: number[] = []
  #version = 0

  get colors(): readonly string[] {
    return this.#colors
  }

  get version(): number {
    return this.#version
  }

  id(color: string): number {
    const id = this.#ids.get(color) ?? this.#assign(color)
    this.#pinned[id] = 1
    return id
  }

  use(color: string): number {
    return this.reuse(this.#ids.get(color) ?? this.#assign(color))
  }

  reuse(id: number): number {
    if (id < this.#colors.length && this.#pinned[id] === 0)
      this.#uses[id] = (this.#uses[id] ?? 0) + 1
    return id
  }

  swap(previous: number, color: string | null, fallback: number): number {
    if (color === null) {
      if (previous !== fallback) this.drop(previous)
      return fallback
    }
    const known = this.#ids.get(color)
    if (known === previous) return previous
    this.drop(previous)
    return this.reuse(known ?? this.#assign(color))
  }

  drop(id: number): void {
    if (id >= this.#colors.length || this.#pinned[id] === 1) return
    const uses = (this.#uses[id] ?? 0) - 1
    this.#uses[id] = uses
    if (uses !== 0 || this.#queued[id] === 1) return
    this.#queued[id] = 1
    this.#idle.push(id)
  }

  changed(since: number, visit: (id: number, color: string) => void): void {
    const colors = this.#colors
    for (let id = 0; id < colors.length; id++) {
      if ((this.#stamps[id] ?? 0) > since) visit(id, colors[id] ?? '')
    }
  }

  #reclaim(): number {
    const idle = this.#idle
    while (idle.length > 0) {
      const id = idle.pop() ?? 0
      this.#queued[id] = 0
      if (this.#uses[id] !== 0 || this.#pinned[id] === 1) continue
      this.#ids.delete(this.#colors[id] ?? '')
      return id
    }
    return this.#colors.length
  }

  #assign(color: string): number {
    const id = this.#reclaim()
    if (id >= this.#uses.length) this.#grow(id + 1)
    this.#colors[id] = color
    this.#ids.set(color, id)
    this.#uses[id] = 0
    this.#pinned[id] = 0
    this.#stamps[id] = ++this.#version
    return id
  }

  #grow(length: number): void {
    const capacity = Math.max(64, this.#uses.length * 2, length)
    const uses = new Int32Array(capacity)
    uses.set(this.#uses)
    this.#uses = uses
    const pinned = new Uint8Array(capacity)
    pinned.set(this.#pinned)
    this.#pinned = pinned
    const queued = new Uint8Array(capacity)
    queued.set(this.#queued)
    this.#queued = queued
    const stamps = new Uint32Array(capacity)
    stamps.set(this.#stamps)
    this.#stamps = stamps
  }
}
