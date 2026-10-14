import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wasmFile = path.resolve(here, 'node_modules/web-ifc/web-ifc.wasm');

// web-ifc loads its WebAssembly at runtime from "/web-ifc.wasm": serve it in dev, emit it in the build
function webIfcWasm() {
  return {
    name: 'web-ifc-wasm',
    configureServer(server) {
      server.middlewares.use('/web-ifc.wasm', (_req, res) => {
        res.setHeader('Content-Type', 'application/wasm');
        fs.createReadStream(wasmFile).pipe(res);
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'web-ifc.wasm', source: fs.readFileSync(wasmFile) });
    },
  };
}

export default defineConfig({
  plugins: [react(), webIfcWasm()],
  resolve: { alias: { '@shared': path.resolve(here, '../shared') } },
  server: {
    port: 5173,
    fs: { allow: ['..'] }, // the shared engine lives one level up
    proxy: { '/api': 'http://localhost:4000' },
  },
});
