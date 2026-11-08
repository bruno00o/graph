const targets = {
  'air-routes': './showcase-data/air-routes.mjs',
  'language-influences': './showcase-data/language-influences.mjs',
}

const argument = process.argv[2]
const target = argument && !argument.startsWith('--') ? argument : 'air-routes'
const module = targets[target]
if (!module) {
  console.error(`Unknown data set "${target}". Choose one of: ${Object.keys(targets).join(', ')}.`)
  process.exit(1)
}
await import(module)
