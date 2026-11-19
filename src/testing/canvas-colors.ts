import { vi } from 'vitest'

const named: Readonly<Record<string, string>> = {
  'var(--graph-paper)': '#f7f7f4ff',
  'var(--graph-ink)': '#191d22ff',
}

export function mockCanvasColors(): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => {
    let style = '#000000'
    return {
      clearRect() {},
      fillRect() {},
      set fillStyle(value: string) {
        style = value
      },
      get fillStyle() {
        return style
      },
      getImageData() {
        const hex = (
          /#([0-9a-f]{6,8})/i.exec(named[style] ?? style)?.[1] ??
          (style === 'transparent' ? '00000000' : '000000')
        ).padEnd(8, 'f')
        return {
          data: new Uint8ClampedArray(
            [0, 2, 4, 6].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)),
          ),
        }
      },
    } as unknown as CanvasRenderingContext2D
  }) as unknown as HTMLCanvasElement['getContext'])
}
