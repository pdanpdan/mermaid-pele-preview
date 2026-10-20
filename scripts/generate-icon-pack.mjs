import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { fab } from '@fortawesome/free-brands-svg-icons';
import { far } from '@fortawesome/free-regular-svg-icons';
import { fas } from '@fortawesome/free-solid-svg-icons';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'icons', 'font-awesome.json.gz');
const styles = [
  ['fa', fas],
  ['far', far],
  ['fab', fab],
];

const icons = {};
for (const [prefix, pack] of styles) {
  for (const icon of Object.values(pack)) {
    const [width, height, , , paths] = icon.icon;
    icons[`${prefix}:fa-${icon.iconName}`] = {
      width,
      height,
      paths,
    };
  }
}

const pack = {
  version: 1,
  name: 'Font Awesome Free',
  license:
    'Icons: CC BY 4.0. Fonts: SIL OFL 1.1. Code: MIT. https://fontawesome.com/license/free',
  icons,
};

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, gzipSync(`${JSON.stringify(pack)}\n`, { level: 9 }));
console.log(`Wrote ${Object.keys(icons).length} icons to ${path.relative(root, output)}`);
