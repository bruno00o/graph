export interface ShaderLimits {
  readonly declaredSamplers: number
  readonly vertexSamplers: number
  readonly fragmentSamplers: number
  readonly combinedSamplers: number
  readonly varyingVectors: number
  readonly varyingComponents: number
  readonly vertexOutputComponents: number
  readonly fragmentInputComponents: number
  readonly vertexBlocks: number
  readonly fragmentBlocks: number
  readonly combinedBlocks: number
  readonly blockSize: number
  readonly attributes: number
  readonly vertexUniformVectors: number
  readonly fragmentUniformVectors: number
}

export const webgl2Minimums: ShaderLimits = {
  declaredSamplers: 16,
  vertexSamplers: 16,
  fragmentSamplers: 16,
  combinedSamplers: 32,
  varyingVectors: 15,
  varyingComponents: 60,
  vertexOutputComponents: 64,
  fragmentInputComponents: 60,
  vertexBlocks: 12,
  fragmentBlocks: 12,
  combinedBlocks: 24,
  blockSize: 16384,
  attributes: 16,
  vertexUniformVectors: 256,
  fragmentUniformVectors: 224,
}

export interface ProgramMeasure {
  readonly name: string
  readonly vertexSamplers: number
  readonly fragmentSamplers: number
  readonly combinedSamplers: number
  readonly reachableSamplers: number
  readonly declaredSamplers: number
  readonly varyingVectors: number
  readonly varyingComponents: number
  readonly vertexOutputComponents: number
  readonly fragmentInputComponents: number
  readonly vertexBlocks: number
  readonly fragmentBlocks: number
  readonly combinedBlocks: number
  readonly blockSize: number
  readonly attributes: number
  readonly vertexUniformVectors: number
  readonly fragmentUniformVectors: number
}

interface Variable {
  readonly name: string
  readonly type: string
  readonly count: number
}

interface Block {
  readonly name: string
  readonly members: readonly Variable[]
}

interface Stage {
  readonly uniforms: readonly Variable[]
  readonly inputs: readonly Variable[]
  readonly outputs: readonly Variable[]
  readonly blocks: readonly Block[]
  readonly functions: ReadonlyMap<string, string>
  readonly used: ReadonlySet<string>
  readonly reachable: ReadonlySet<string>
}

const opaque = /^[iu]?sampler/

export function preprocess(source: string): string {
  const defined = new Set<string>()
  const active: boolean[] = []
  const taken: boolean[] = []
  const lines: string[] = []
  const on = () => active.every(Boolean)
  for (const line of source.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')) {
    const text = line.replace(/\/\/.*$/, '').trim()
    if (!text.startsWith('#')) {
      if (on()) lines.push(text)
      continue
    }
    const [directive = '', name = ''] = text.slice(1).trim().split(/\s+/)
    if (directive === 'version' || directive === 'extension' || directive === 'pragma') continue
    if (directive === 'define') {
      if (on()) defined.add(name)
    } else if (directive === 'undef') {
      if (on()) defined.delete(name)
    } else if (directive === 'ifdef' || directive === 'ifndef') {
      const value = defined.has(name) === (directive === 'ifdef')
      active.push(value)
      taken.push(value)
    } else if (directive === 'else') {
      const value = !(taken[taken.length - 1] ?? true)
      active[active.length - 1] = value
    } else if (directive === 'endif') {
      active.pop()
      taken.pop()
    } else throw new Error(`shader-budget: unsupported directive #${directive}`)
  }
  return lines.join('\n')
}

function statements(source: string): string[] {
  const found: string[] = []
  let depth = 0
  let start = 0
  for (let at = 0; at < source.length; at++) {
    const char = source[at]
    if (char === '{') depth++
    else if (char === '}') {
      depth--
      if (depth === 0) {
        const head = source.slice(start, at)
        if (!/^\s*(struct\b|layout\b|uniform\b)/.test(head)) {
          found.push(source.slice(start, at + 1))
          start = at + 1
        }
      }
    } else if (char === ';' && depth === 0) {
      found.push(source.slice(start, at))
      start = at + 1
    }
  }
  return found.map((text) => text.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

function variable(declaration: string): Variable {
  const match = /(\w+)\s+(\w+)\s*(?:\[\s*(\d+)\s*\])?\s*$/.exec(declaration)
  if (!match) throw new Error(`shader-budget: cannot read the declaration "${declaration}"`)
  return { type: match[1] ?? '', name: match[2] ?? '', count: Number(match[3] ?? 1) }
}

function identifiers(text: string): string[] {
  return [...text.matchAll(/(?<![.\w])[A-Za-z_]\w*/g)].map((match) => match[0])
}

function parse(source: string): Stage {
  const uniforms: Variable[] = []
  const inputs: Variable[] = []
  const outputs: Variable[] = []
  const blocks: Block[] = []
  const functions = new Map<string, string>()
  for (const statement of statements(preprocess(source))) {
    const plain = statement.replace(/^layout\s*\([^)]*\)\s*/, '')
    if (/^precision\b|^const\b|^struct\b/.test(plain)) continue
    const block = /^uniform\s+(\w+)\s*\{([^}]*)\}/.exec(plain)
    if (block) {
      const members = (block[2] ?? '')
        .split(';')
        .map((member) => member.trim())
        .filter(Boolean)
        .map(variable)
      blocks.push({ name: block[1] ?? '', members })
      continue
    }
    const qualified = /^(?:(?:flat|smooth|centroid|highp|mediump|lowp)\s+)*(uniform|in|out)\s+(.*)$/
    const declared = qualified.exec(plain)
    if (declared) {
      const target = declared[1] === 'uniform' ? uniforms : declared[1] === 'in' ? inputs : outputs
      target.push(variable((declared[2] ?? '').replace(/^(?:highp|mediump|lowp)\s+/, '')))
      continue
    }
    const fn = /^\w+\s+(\w+)\s*\([^)]*\)\s*\{([\s\S]*)\}$/.exec(plain)
    if (fn) functions.set(fn[1] ?? '', fn[2] ?? '')
    else throw new Error(`shader-budget: cannot read the statement "${plain.slice(0, 80)}"`)
  }
  const used = new Set<string>()
  for (const body of functions.values()) for (const name of identifiers(body)) used.add(name)
  const reachable = new Set<string>()
  const visit = (name: string) => {
    const body = functions.get(name)
    if (body === undefined || reachable.has(name)) return
    reachable.add(name)
    for (const identifier of identifiers(body)) {
      if (functions.has(identifier)) visit(identifier)
      else reachable.add(identifier)
    }
  }
  visit('main')
  return { uniforms, inputs, outputs, blocks, functions, used, reachable }
}

const shapes: Record<string, readonly [rows: number, columns: number, order: number]> = {
  mat4: [4, 4, 0],
  mat2: [2, 4, 1],
  vec4: [1, 4, 2],
  ivec4: [1, 4, 2],
  uvec4: [1, 4, 2],
  bvec4: [1, 4, 2],
  mat3: [3, 3, 3],
  vec3: [1, 3, 4],
  ivec3: [1, 3, 4],
  uvec3: [1, 3, 4],
  bvec3: [1, 3, 4],
  vec2: [1, 2, 5],
  ivec2: [1, 2, 5],
  uvec2: [1, 2, 5],
  bvec2: [1, 2, 5],
  float: [1, 1, 6],
  int: [1, 1, 6],
  uint: [1, 1, 6],
  bool: [1, 1, 6],
}

function shapeOf(type: string): readonly [number, number, number] {
  const shape = shapes[type]
  if (!shape) throw new Error(`shader-budget: unknown type ${type}`)
  return shape
}

function components(variables: readonly Variable[]): number {
  return variables.reduce((sum, { type, count }) => {
    const [rows, columns] = shapeOf(type)
    return sum + rows * (type === 'mat2' ? 2 : columns) * count
  }, 0)
}

export function packs(variables: readonly Variable[], rows: number): boolean {
  const grid = Array.from({ length: rows }, () => [false, false, false, false])
  const sorted = [...variables].sort((a, b) => {
    const order = shapeOf(a.type)[2] - shapeOf(b.type)[2]
    return order !== 0 ? order : b.count - a.count
  })
  const fill = (row: number, column: number, height: number, width: number) => {
    for (let r = row; r < row + height; r++)
      for (let c = column; c < column + width; c++) (grid[r] as boolean[])[c] = true
  }
  const free = (row: number, column: number, height: number, width: number) => {
    for (let r = row; r < row + height; r++)
      for (let c = column; c < column + width; c++) if (grid[r]?.[c] !== false) return false
    return true
  }
  let top = 0
  let switched = false
  for (const { type, count } of sorted) {
    const [height, width, order] = shapeOf(type)
    const needed = height * count
    if (order < 6) {
      if (!switched && top + needed <= rows) {
        fill(top, 0, needed, width)
        top += needed
        continue
      }
      if (width > 2) return false
      switched = true
      let placed = false
      for (let row = rows - needed; row >= 0 && !placed; row--) {
        for (let column = 0; column + width <= 4 && !placed; column++) {
          if (!free(row, column, needed, width)) continue
          fill(row, column, needed, width)
          placed = true
        }
      }
      if (!placed) return false
      continue
    }
    let best: readonly [number, number, number] | null = null
    for (let column = 0; column < 4; column++) {
      let row = 0
      while (row < rows) {
        if (grid[row]?.[column]) {
          row++
          continue
        }
        let end = row
        while (end < rows && grid[end]?.[column] === false) end++
        const length = end - row
        if (length >= needed && (!best || length < best[2])) best = [row, column, length]
        row = end
      }
    }
    if (!best) return false
    fill(best[0], best[1], needed, 1)
  }
  return true
}

export function rowsNeeded(variables: readonly Variable[], limit = 1024): number {
  for (let rows = 0; rows <= limit; rows++) if (packs(variables, rows)) return rows
  return Number.POSITIVE_INFINITY
}

const alignments: Record<string, readonly [align: number, size: number]> = {
  float: [4, 4],
  int: [4, 4],
  uint: [4, 4],
  bool: [4, 4],
  vec2: [8, 8],
  ivec2: [8, 8],
  uvec2: [8, 8],
  vec3: [16, 12],
  ivec3: [16, 12],
  uvec3: [16, 12],
  vec4: [16, 16],
  ivec4: [16, 16],
  uvec4: [16, 16],
  mat2: [16, 32],
  mat3: [16, 48],
  mat4: [16, 64],
}

export function std140Size(members: readonly Variable[]): number {
  let offset = 0
  for (const { type, count } of members) {
    const layout = alignments[type]
    if (!layout) throw new Error(`shader-budget: unknown block member type ${type}`)
    const [align, size] = count > 1 ? [16, Math.ceil(layout[1] / 16) * 16 * count] : layout
    offset = Math.ceil(offset / align) * align + size
  }
  return Math.ceil(offset / 16) * 16
}

const special: Record<string, Variable> = {
  gl_FragCoord: { name: 'gl_FragCoord', type: 'vec4', count: 1 },
  gl_FrontFacing: { name: 'gl_FrontFacing', type: 'float', count: 1 },
  gl_PointCoord: { name: 'gl_PointCoord', type: 'vec2', count: 1 },
}

function samplers(stage: Stage, names: ReadonlySet<string>): number {
  return stage.uniforms
    .filter((uniform) => opaque.test(uniform.type) && names.has(uniform.name))
    .reduce((sum, uniform) => sum + uniform.count, 0)
}

function activeBlocks(stage: Stage): Block[] {
  return stage.blocks.filter((block) => block.members.some((member) => stage.used.has(member.name)))
}

function uniformVectors(stage: Stage, limit: number): number {
  const plain = stage.uniforms.filter(
    (uniform) => !opaque.test(uniform.type) && stage.used.has(uniform.name),
  )
  return rowsNeeded(plain, limit + 1)
}

export function measureProgram(name: string, vertex: string, fragment: string): ProgramMeasure {
  const front = parse(vertex)
  const back = parse(fragment)
  const written = front.outputs.filter((output) => front.used.has(output.name))
  const read = back.inputs.filter((input) => back.used.has(input.name))
  const shared = read.filter((input) => written.some((output) => output.name === input.name))
  for (const name of Object.keys(special)) {
    const variable = special[name]
    if (variable && back.used.has(name)) shared.push(variable)
  }
  const vertexBlocks = activeBlocks(front)
  const fragmentBlocks = activeBlocks(back)
  const names = new Set([...vertexBlocks, ...fragmentBlocks].map((block) => block.name))
  const sizes = [...vertexBlocks, ...fragmentBlocks].map((block) => std140Size(block.members))
  const vertexSamplers = samplers(front, front.used)
  const fragmentSamplers = samplers(back, back.used)
  return {
    name,
    vertexSamplers,
    fragmentSamplers,
    combinedSamplers: vertexSamplers + fragmentSamplers,
    reachableSamplers: samplers(front, front.reachable),
    declaredSamplers: samplers(front, new Set(front.uniforms.map((uniform) => uniform.name))),
    varyingVectors: rowsNeeded(shared, webgl2Minimums.varyingVectors + 1),
    varyingComponents: components(shared),
    vertexOutputComponents: components(written),
    fragmentInputComponents: components(read),
    vertexBlocks: vertexBlocks.length,
    fragmentBlocks: fragmentBlocks.length,
    combinedBlocks: names.size,
    blockSize: Math.max(0, ...sizes),
    attributes: front.inputs
      .filter((input) => front.used.has(input.name))
      .reduce((sum, input) => sum + shapeOf(input.type)[0] * input.count, 0),
    vertexUniformVectors: uniformVectors(front, webgl2Minimums.vertexUniformVectors),
    fragmentUniformVectors: uniformVectors(back, webgl2Minimums.fragmentUniformVectors),
  }
}

export function budgetProblems(
  measure: ProgramMeasure,
  limits: ShaderLimits = webgl2Minimums,
): string[] {
  const problems: string[] = []
  for (const key of Object.keys(limits) as Array<keyof ShaderLimits>) {
    const value = measure[key]
    if (value > limits[key]) problems.push(`${measure.name}: ${key} ${value} > ${limits[key]}`)
  }
  return problems
}
