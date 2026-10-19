import esbuild from 'esbuild';
import { mkdir } from 'node:fs/promises';

const watch = process.argv.includes('--watch');

await mkdir('dist', { recursive: true });
await mkdir('media', { recursive: true });

const shared = {
  bundle: true,
  sourcemap: true,
  logLevel: 'info',
};

const extension = await esbuild.context({
  ...shared,
  entryPoints: ['src/extension.ts'],
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile: 'dist/extension.js',
  external: ['vscode'],
});

const webview = await esbuild.context({
  ...shared,
  entryPoints: ['src/webview.ts'],
  platform: 'browser',
  format: 'iife',
  target: ['chrome100', 'firefox100', 'safari15'],
  outfile: 'media/webview.js',
  minify: true,
});

if (watch) {
  await Promise.all([extension.watch(), webview.watch()]);
} else {
  await Promise.all([extension.rebuild(), webview.rebuild()]);
  await Promise.all([extension.dispose(), webview.dispose()]);
}
