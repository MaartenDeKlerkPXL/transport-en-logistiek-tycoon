// Vite: npm run dev (lokaal spelen met automatisch herladen), npm run build (map dist/ voor GitHub Pages)
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',            // werkt ook in een submap (github.io/transport-en-logistiek-tycoon/)
  build: { outDir: 'dist', target: 'es2020', sourcemap: true },
  server: { open: false },
});
