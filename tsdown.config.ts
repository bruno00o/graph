import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts', react: 'src/react/index.tsx', db: 'src/db/index.ts' },
  format: 'esm',
  platform: 'neutral',
  target: 'es2023',
  dts: true,
  sourcemap: true,
  clean: true,
  copy: [{ from: 'src/theme/theme.css', to: 'dist', flatten: true }],
})
