export interface Step {
  readonly id: string
  readonly label: string
}

export interface Arrow {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly back: boolean
}

export function createSteps(seed = 8): { steps: Step[]; arrows: Arrow[] } {
  let state = seed
  const next = () => {
    state = (state * 16807) % 2147483647
    return state / 2147483647
  }
  const sizes = [1, 3, 4, 4, 3, 2]
  const steps: Step[] = []
  const arrows: Arrow[] = []
  const levels: string[][] = []
  const below = new Map<string, string>()
  const arrow = (from: string, to: string, back: boolean) => {
    arrows.push({ id: `e${arrows.length}`, from, to, back })
    if (!back && !below.has(from)) below.set(from, to)
  }
  sizes.forEach((size, level) => {
    const ids: string[] = []
    for (let at = 0; at < size; at++) {
      const id = `s${steps.length}`
      steps.push({ id, label: `Node ${steps.length + 1}` })
      ids.push(id)
      const above = levels[level - 1]
      if (!above) continue
      const first = Math.floor(((at + 0.5) / size) * above.length)
      arrow(above[first] ?? '', id, false)
      const second = above[(first + 1) % above.length]
      if (second && second !== above[first] && next() < 0.3) arrow(second, id, false)
    }
    levels.push(ids)
  })
  for (const [level, at] of [
    [1, 1],
    [0, 0],
  ] as const) {
    const target = levels[level]?.[at] ?? ''
    let source = target
    for (let step = 0; step < 3; step++) source = below.get(source) ?? source
    arrow(source, target, true)
  }
  arrow(levels[4]?.[1] ?? '', levels[3]?.[2] ?? '', true)
  return { steps, arrows }
}
