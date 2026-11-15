const copyStyle = 'position:absolute;left:0;top:0;pointer-events:none'

export class KeptFrame {
  #copy: HTMLCanvasElement | null = null
  #width = 0
  #height = 0

  get held(): boolean {
    return this.#copy !== null
  }

  capture(canvas: HTMLCanvasElement, width: number, height: number): void {
    this.drop()
    if (!(width > 0 && height > 0) || canvas.width === 0 || canvas.height === 0) return
    const copy = document.createElement('canvas')
    copy.width = canvas.width
    copy.height = canvas.height
    const context = copy.getContext('2d')
    if (!context) return
    try {
      context.drawImage(canvas, 0, 0)
    } catch {
      return
    }
    copy.setAttribute('aria-hidden', 'true')
    copy.setAttribute('data-graph-frame', '')
    copy.style.cssText = `${copyStyle};width:${width}px;height:${height}px`
    canvas.after(copy)
    this.#copy = copy
    this.#width = width
    this.#height = height
  }

  place(width: number, height: number): void {
    const copy = this.#copy
    if (!copy) return
    copy.style.left = `${Math.round((width - this.#width) / 2)}px`
    copy.style.top = `${Math.round((height - this.#height) / 2)}px`
  }

  drop(): void {
    const copy = this.#copy
    if (!copy) return
    this.#copy = null
    copy.remove()
    copy.width = 0
    copy.height = 0
  }
}
