import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

// package.json is "type":"module", so vite-plugin-electron emits the preload as
// ESM (`import {...} from "electron"` + `export default ...`). Electron loads
// preload scripts as CommonJS, so those statements throw at runtime and leave
// window.monke undefined (blank window). This rollup hook rewrites the emitted
// preload chunk to plain CommonJS.
function preloadToCjs() {
  return {
    name: 'preload-to-cjs',
    renderChunk(code: string) {
      let out = code
        .replace(/import\s*\{([^}]*)\}\s*from\s*["']electron["'];?/,
          (_m, names) => `const {${names.trim()}} = require("electron");`)
        .replace(/export\s+default\s+([^;]+);?/, '$1;')
      return { code: out, map: null }
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            // better-sqlite3 is a native module: it uses __filename at runtime to
            // locate its .node binary. Bundling it breaks that ("__filename is not
            // defined"). Externalize it so it's require()d from node_modules.
            rollupOptions: { external: ['better-sqlite3'] },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(o){ o.reload() },
        vite: { build: { outDir: 'dist-electron', rollupOptions: { plugins: [preloadToCjs()] } } },
      },
    ]),
    renderer(),
  ],
  build: { outDir: 'dist' },
  server: { port: 5178 },
})
