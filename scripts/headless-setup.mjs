import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach } from 'vitest'

const require = createRequire(import.meta.url)
const typescript = dirname(require.resolve('typescript/package.json'))
const { default: executable } = await import(
  pathToFileURL(join(typescript, 'lib/getExePath.js')).href
)
const declarations = readFileSync(join(dirname(executable()), 'lib.dom.d.ts'), 'utf8')
const declared = /^declare (?:var|function|const|let|class) ([A-Za-z_$][\w$]*)/gm
const names = new Set([...declarations.matchAll(declared)].map((match) => match[1]))
const library = fileURLToPath(new URL('../src/', import.meta.url))
const touched = new Set()

for (const name of names) {
  if (name in globalThis) continue
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get() {
      const caller = new Error().stack?.split('\n')[2] ?? ''
      if (!caller.includes(library)) return undefined
      touched.add(name)
      throw new ReferenceError(`headless: the DOM global ${name} was touched`)
    },
  })
}

afterEach(() => {
  if (touched.size === 0) return
  const names = [...touched].join(', ')
  touched.clear()
  throw new Error(`headless: DOM globals touched: ${names}`)
})
