import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: 'out/main' }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: 'out/preload' }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    server: { host: '127.0.0.1' },
    build: { outDir: resolve(__dirname, 'out/renderer') }
  }
});
