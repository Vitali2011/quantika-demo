import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, cpSync } from 'fs';

const watch = process.argv.includes('--watch');
const opts = {
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  platform: 'browser',
  minify: !watch,
  sourcemap: true,
  outdir: 'dist',
};

await esbuild.build({
  ...opts,
  entryPoints: ['src/background.ts', 'src/content.ts', 'src/sidebar/index.ts'],
});

mkdirSync('dist/sidebar', { recursive: true });
copyFileSync('src/sidebar/index.html', 'dist/sidebar/index.html');
copyFileSync('manifest.json', 'dist/manifest.json');
cpSync('public/icons', 'dist/icons', { recursive: true });

console.log('[Quantika ext] build complete → extensions/gmail/dist/');
