import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  // Relative paths so the same build works inside Capacitor and on any static host.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // es2022: top-level await (iOS 15+, Android WebView 89+).
  build: { target: 'es2022', assetsInlineLimit: 0 },
});
