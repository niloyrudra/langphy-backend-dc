import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['index.ts', 'content.ts'],
  format: ['esm'],
  dts: true,
  bundle: true,
  external: ['express', 'cors', 'mongoose'],
  outDir: 'dist'
})