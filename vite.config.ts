/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Politique de sécurité ajoutée seulement à la version compilée : en développement,
// Vite injecte un petit script en ligne (rechargement à chaud) que la CSP bloquerait.
const CSP = "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'";
const securityPolicy: Plugin = {
  name: 'gwb-csp',
  apply: 'build',
  transformIndexHtml: html => html.replace('<head>', `<head>\n<meta http-equiv="Content-Security-Policy" content="${CSP}">`),
};

// base './' : l'application packagée charge les fichiers depuis le disque (file://).
export default defineConfig({
  base: './',
  plugins: [react(), securityPolicy],
  server: { port: 5173, strictPort: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
