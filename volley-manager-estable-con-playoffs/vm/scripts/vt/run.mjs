// Ejecuta los archivos de pruebas (*.test.ts) en Node SIN instalar Vitest, con un ejecutor mínimo compatible.
// Uso: node scripts/vt/run.mjs src/game/game.test.ts src/engine/match.test.ts
// Necesita esbuild (variable ESBUILD_PATH si no está en node_modules).
import { createRequire } from 'node:module';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let esbuild; try { esbuild = require(process.env.ESBUILD_PATH ?? 'esbuild'); } catch { esbuild = require('/home/claude/.npm-global/lib/node_modules/tsx/node_modules/esbuild'); }
const files = process.argv.slice(2).map(f => resolve(f));
const entry = files.map(f => `import ${JSON.stringify(f)};`).join('\n') + "\nimport { run } from 'vitest'; run();";
const r = await esbuild.build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'cjs', platform: 'node', target: 'node20',
  alias: { vitest: resolve('scripts/vt/shim.cjs') }, logLevel: 'warning' });
const out = join(mkdtempSync(join(tmpdir(), 'vt-')), 'bundle.cjs'); writeFileSync(out, r.outputFiles[0].text);
try { execFileSync('node', [out], { stdio: 'inherit' }); } catch { process.exit(1); }
