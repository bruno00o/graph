import { spawnSync } from 'node:child_process'
import { cpSync, rmSync } from 'node:fs'

const copy = '.skills-publish-check'

rmSync(copy, { recursive: true, force: true })
try {
  cpSync('skills', `${copy}/skills`, { recursive: true })
  const run = spawnSync(
    'pnpm',
    ['exec', 'intent', 'validate', `${copy}/skills`, '--set-version', '0.0.0'],
    {
      encoding: 'utf8',
    },
  )
  if (run.status !== 0) {
    const output = `${run.stdout}${run.stderr}`
      .split('\n')
      .filter((line) => !line.includes('is not covered by the "files" array'))
      .join('\n')
    console.error(output)
    console.error('The skills fail validation once npm publish writes library_version into them.')
    process.exitCode = 1
  } else {
    console.log('Skills still validate once library_version is written.')
  }
} finally {
  rmSync(copy, { recursive: true, force: true })
}
