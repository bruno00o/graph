import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { graphAgent } from './vite'

type Hook = (this: unknown, ...args: unknown[]) => unknown

interface Injector {
  transform(code: string, id: string): { code: string } | null
}

interface Loader {
  setup(build: {
    onLoad(options: { filter: RegExp }, load: (args: { path: string }) => unknown): void
  }): void
}

const source = join(import.meta.dirname, '..')
const entry = join(source, 'index.ts')
const client = join(import.meta.dirname, 'dev.ts')

function configOf(version: string, options = {}) {
  const plugin = graphAgent(options)
  const config = plugin.config as Hook
  return config.call(
    { meta: { viteVersion: version } },
    {},
    { command: 'serve', mode: 'development' },
  ) as
    | {
        optimizeDeps: {
          rolldownOptions?: { plugins: Injector[] }
          esbuildOptions?: { plugins: Loader[] }
        }
      }
    | undefined
}

function transformOf(environment: string, options = {}) {
  const plugin = graphAgent(options)
  const transform = plugin.transform as { handler: Hook }
  return (code: string, id: string) =>
    transform.handler.call({ environment: { name: environment } }, code, id) as {
      code: string
    } | null
}

describe('graphAgent', () => {
  it('only serves', () => {
    expect(graphAgent().apply).toBe('serve')
  })

  it('adds the client to the entries of the library while Vite 8 pre-bundles them', () => {
    const [injector] = configOf('8.3.5')?.optimizeDeps.rolldownOptions?.plugins ?? []
    expect(injector?.transform('export {}', entry)?.code).toContain(
      `import(${JSON.stringify(client)})`,
    )
    expect(injector?.transform('export {}', `${entry}?v=1`)?.code).toContain('import(')
    expect(injector?.transform('export {}', join(source, 'marks.ts'))).toBeNull()
    expect(injector?.transform('export {}', '/elsewhere/index.ts')).toBeNull()
  })

  it('adds the client while Vite 7 pre-bundles with esbuild', () => {
    const [loader] = configOf('7.1.0')?.optimizeDeps.esbuildOptions?.plugins ?? []
    let filter: RegExp | null = null
    loader?.setup({
      onLoad(options) {
        filter = options.filter
      },
    })
    expect(filter).not.toBeNull()
    expect(
      (filter as unknown as RegExp).test('/app/node_modules/@bruno00o/graph/dist/index.js'),
    ).toBe(true)
  })

  it('adds the client to the entries served to the browser only', () => {
    expect(transformOf('client')('export {}', entry)?.code).toContain('import(')
    expect(transformOf('ssr')('export {}', entry)).toBeNull()
    expect(transformOf('client')('export {}', join(source, 'marks.ts'))).toBeNull()
  })

  it('leaves the client to the app with inject: false', () => {
    expect(configOf('8.3.5', { inject: false })).toBeUndefined()
    expect(transformOf('client', { inject: false })('export {}', entry)).toBeNull()
  })
})
