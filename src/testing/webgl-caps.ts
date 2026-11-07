export type LimitName =
  | 'MAX_TEXTURE_SIZE'
  | 'MAX_ARRAY_TEXTURE_LAYERS'
  | 'MAX_RENDERBUFFER_SIZE'
  | 'MAX_VIEWPORT_DIMS'
  | 'MAX_VERTEX_TEXTURE_IMAGE_UNITS'
  | 'MAX_TEXTURE_IMAGE_UNITS'
  | 'MAX_COMBINED_TEXTURE_IMAGE_UNITS'
  | 'MAX_VARYING_VECTORS'
  | 'MAX_VARYING_COMPONENTS'
  | 'MAX_VERTEX_UNIFORM_BLOCKS'
  | 'MAX_FRAGMENT_UNIFORM_BLOCKS'
  | 'MAX_UNIFORM_BLOCK_SIZE'
  | 'MAX_UNIFORM_BUFFER_BINDINGS'
  | 'MAX_VERTEX_ATTRIBS'

export interface WebglCaps {
  readonly hidden?: readonly string[]
  readonly limits?: Readonly<Partial<Record<LimitName, number>>>
  readonly renderer?: string
}

export const minimumLimits: Readonly<Record<LimitName, number>> = {
  MAX_TEXTURE_SIZE: 2048,
  MAX_ARRAY_TEXTURE_LAYERS: 256,
  MAX_RENDERBUFFER_SIZE: 2048,
  MAX_VIEWPORT_DIMS: 2048,
  MAX_VERTEX_TEXTURE_IMAGE_UNITS: 16,
  MAX_TEXTURE_IMAGE_UNITS: 16,
  MAX_COMBINED_TEXTURE_IMAGE_UNITS: 32,
  MAX_VARYING_VECTORS: 15,
  MAX_VARYING_COMPONENTS: 60,
  MAX_VERTEX_UNIFORM_BLOCKS: 12,
  MAX_FRAGMENT_UNIFORM_BLOCKS: 12,
  MAX_UNIFORM_BLOCK_SIZE: 16384,
  MAX_UNIFORM_BUFFER_BINDINGS: 24,
  MAX_VERTEX_ATTRIBS: 16,
}

export const optionalExtensions: readonly string[] = [
  'EXT_color_buffer_float',
  'EXT_color_buffer_half_float',
  'EXT_float_blend',
  'OES_texture_float_linear',
  'EXT_texture_filter_anisotropic',
  'KHR_parallel_shader_compile',
  'WEBGL_debug_renderer_info',
  'WEBGL_lose_context',
]

export const lowCaps: WebglCaps = { hidden: optionalExtensions, limits: minimumLimits }

export const softwareCaps: WebglCaps = { renderer: 'Google SwiftShader' }

export interface LimitedWebgl {
  readonly violations: readonly string[]
  restore(): void
}

type Method = (...args: never[]) => unknown

interface Patchable {
  readonly RENDERER?: number
  [name: string]: unknown
}

const debugRenderer = 0x9246
const invalidValue = 0x0501

export function limitWebgl(
  caps: WebglCaps,
  prototype: object = globalThis.WebGL2RenderingContext?.prototype ?? {},
): LimitedWebgl {
  const target = prototype as Patchable
  const hidden = new Set(caps.hidden ?? [])
  const limits = caps.limits ?? {}
  const violations: string[] = []
  const pending = new WeakMap<object, number>()
  const originals = new Map<string, unknown>()
  const limitOf = (gl: Patchable, name: LimitName) => {
    const own = limits[name]
    const real = (originals.get('getParameter') as (this: unknown, p: number) => unknown).call(
      gl,
      gl[name] as number,
    )
    const value = Array.isArray(real) || ArrayBuffer.isView(real) ? (real as Int32Array)[0] : real
    return own === undefined ? (value as number) : Math.min(own, (value as number) ?? own)
  }
  const refuse = (gl: object, message: string) => {
    violations.push(message)
    pending.set(gl, invalidValue)
  }
  const patch = (name: string, wrap: (original: Method) => Method) => {
    const original = target[name]
    if (typeof original !== 'function') return
    originals.set(name, original)
    target[name] = wrap(original as Method)
  }
  patch(
    'getExtension',
    (original) =>
      function (this: unknown, ...args: never[]) {
        const name = String(args[0])
        return hidden.has(name) ? null : original.apply(this, args)
      },
  )
  patch(
    'getSupportedExtensions',
    (original) =>
      function (this: unknown, ...args: never[]) {
        const names = original.apply(this, args) as string[] | null
        return names?.filter((name) => !hidden.has(name)) ?? null
      },
  )
  patch(
    'getParameter',
    (original) =>
      function (this: Patchable, ...args: never[]) {
        const parameter = Number(args[0])
        if (caps.renderer && (parameter === this.RENDERER || parameter === debugRenderer)) {
          return caps.renderer
        }
        const real = original.apply(this, args)
        for (const [name, value] of Object.entries(limits) as Array<[LimitName, number]>) {
          if (parameter !== this[name]) continue
          if (name === 'MAX_VIEWPORT_DIMS') {
            const dims = real as Int32Array
            return new Int32Array([
              Math.min(value, dims[0] ?? value),
              Math.min(value, dims[1] ?? value),
            ])
          }
          return Math.min(value, real as number)
        }
        return real
      },
  )
  patch(
    'getError',
    (original) =>
      function (this: object, ...args: never[]) {
        const error = pending.get(this)
        if (error === undefined) return original.apply(this, args)
        pending.delete(this)
        return error
      },
  )
  const sized =
    (name: string, sizes: (args: readonly unknown[]) => readonly [number, number, number]) =>
    (original: Method) =>
      function (this: Patchable, ...args: never[]) {
        const [width, height, depth] = sizes(args)
        const side = name.startsWith('renderbuffer') ? 'MAX_RENDERBUFFER_SIZE' : 'MAX_TEXTURE_SIZE'
        const most = limitOf(this, side)
        const layers = limitOf(this, 'MAX_ARRAY_TEXTURE_LAYERS')
        if (width > most || height > most || depth > layers) {
          refuse(this, `${name} ${width}x${height}x${depth} exceeds ${most}x${most}x${layers}`)
          return undefined
        }
        return original.apply(this, args)
      }
  const at = (args: readonly unknown[], index: number) => Number(args[index] ?? 0)
  patch(
    'texImage2D',
    sized('texImage2D', (args) => (args.length >= 8 ? [at(args, 3), at(args, 4), 1] : [0, 0, 1])),
  )
  patch(
    'texStorage2D',
    sized('texStorage2D', (args) => [at(args, 3), at(args, 4), 1]),
  )
  patch(
    'texImage3D',
    sized('texImage3D', (args) => [at(args, 3), at(args, 4), at(args, 5)]),
  )
  patch(
    'texStorage3D',
    sized('texStorage3D', (args) => [at(args, 3), at(args, 4), at(args, 5)]),
  )
  patch(
    'renderbufferStorage',
    sized('renderbufferStorage', (args) => [at(args, 2), at(args, 3), 1]),
  )
  return {
    violations,
    restore() {
      for (const [name, original] of originals) target[name] = original
      originals.clear()
    },
  }
}

const presets: Readonly<Record<string, WebglCaps>> = {
  low: lowCaps,
  software: softwareCaps,
  'low-software': { ...lowCaps, ...softwareCaps },
}

export function capsFromQuery(search: string): WebglCaps | null {
  const params = new URLSearchParams(search)
  const base = presets[params.get('caps') ?? ''] ?? null
  const texture = Number(params.get('texture'))
  if (!base || !(texture > 0)) return base
  return { ...base, limits: { ...base.limits, MAX_TEXTURE_SIZE: Math.max(1024, texture) } }
}
