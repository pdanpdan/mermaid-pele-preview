import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPath = path.join(root, 'package.json');
const workspacePath = path.join(root, 'pnpm-workspace.yaml');
const tempDir = path.join(root, '.vsce-tmp');

function readCatalog(source) {
  const catalog = {};
  let inCatalog = false;

  for (const line of source.split('\n')) {
    if (inCatalog) {
      if (/^\S/.test(line)) {
        break;
      }
      const match = line.match(/^\s{2,}(['"]?)([^'":]+)\1:\s+(.+?)\s*$/);
      if (match) {
        catalog[match[2]] = match[3].replace(/^['"]|['"]$/g, '');
      }
      continue;
    }
    inCatalog = /^catalog:\s*$/.test(line);
  }

  return catalog;
}

function resolveDependencies(dependencies, catalog) {
  return Object.fromEntries(
    Object.entries(dependencies ?? {}).map(([name, spec]) => {
      if (spec !== 'catalog:') {
        return [name, spec];
      }
      const version = catalog[name];
      if (!version) {
        throw new Error(`No catalog version for "${name}"`);
      }
      return [name, version];
    })
  );
}

const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
const catalog = readCatalog(await readFile(workspacePath, 'utf8'));

const manifest = {
  ...packageJson,
  dependencies: resolveDependencies(packageJson.dependencies, catalog),
  devDependencies: resolveDependencies(packageJson.devDependencies, catalog),
};

delete manifest.scripts;

await rm(tempDir, { recursive: true, force: true });
await mkdir(path.join(tempDir, 'dist'), { recursive: true });
await mkdir(path.join(tempDir, 'media'), { recursive: true });

await writeFile(path.join(tempDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(path.join(tempDir, '.vscodeignore'), '.vscodeignore\n');
await cp(path.join(root, 'README.md'), path.join(tempDir, 'README.md'));
await cp(path.join(root, 'CHANGELOG.md'), path.join(tempDir, 'CHANGELOG.md'));
await cp(path.join(root, 'LICENSE'), path.join(tempDir, 'LICENSE'));
await cp(path.join(root, 'THIRD_PARTY_NOTICES.md'), path.join(tempDir, 'THIRD_PARTY_NOTICES.md'));
await cp(path.join(root, 'dist', 'extension.js'), path.join(tempDir, 'dist', 'extension.js'));
await cp(path.join(root, 'media', 'webview.js'), path.join(tempDir, 'media', 'webview.js'));
await cp(path.join(root, 'media', 'preview.css'), path.join(tempDir, 'media', 'preview.css'));
await cp(path.join(root, 'media', 'temml.css'), path.join(tempDir, 'media', 'temml.css'));
await cp(path.join(root, 'media', 'Temml.woff2'), path.join(tempDir, 'media', 'Temml.woff2'));
await cp(path.join(root, 'syntaxes'), path.join(tempDir, 'syntaxes'), { recursive: true });

const vsce = path.join(
  root,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vsce.cmd' : 'vsce'
);
const output = path.join(root, `${packageJson.name}-${packageJson.version}.vsix`);
const result = spawnSync(
  vsce,
  ['package', '--no-dependencies', '--out', output],
  { cwd: tempDir, stdio: 'inherit' }
);

await rm(tempDir, { recursive: true, force: true });

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
