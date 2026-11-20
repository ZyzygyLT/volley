// Empaqueta la aplicación (React + motor + liga) en un único HTML autocontenido.
// Uso: node scripts/build-single.mjs [salida.html]   (necesita esbuild; resuelve react desde NODE_PATH o node_modules)
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const G = process.env.GLOBAL_NODE_MODULES ?? '/home/claude/.npm-global/lib/node_modules';
const require = createRequire(import.meta.url);
let esbuild; try { esbuild = require('esbuild'); } catch { esbuild = require(`${G}/tsx/node_modules/esbuild`); }
const out = process.argv[2] ?? 'dist/volley-manager.html';
const r = await esbuild.build({ entryPoints: [process.env.ENTRY ?? 'src/main.tsx'], bundle: true, minify: true, write: false, format: 'iife', target: 'es2020', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' }, nodePaths: [G], loader: { '.css': 'text' }, logLevel: 'warning' });
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync('src/styles.css', 'utf8');
const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Volley Manager</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%8F%90%3C/text%3E%3C/svg%3E">
<style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
import { mkdirSync } from 'node:fs'; import { dirname } from 'node:path'; mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html); console.log(`${out}: ${(html.length / 1024).toFixed(0)} KB`);
