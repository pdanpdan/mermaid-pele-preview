import * as path from 'node:path';
import { gunzipSync } from 'node:zlib';
import * as vscode from 'vscode';
import { resolveConfigFileUri } from './configFile';
import {
  selectIcons,
  type IconEntry,
  type IconPack,
  type IconSelection,
} from './icons';

const CONFIGURATION_KEY = 'iconPack';
const MAX_PACK_BYTES = 8 * 1024 * 1024;
const MAX_ICONS = 20_000;
const MAX_BODY_CHARS = 1024 * 1024;

function readEntry(input: unknown, name: string): IconEntry {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error(`Icon "${name}" must be an object.`);
  }
  const value = input as Record<string, unknown>;
  const entry: IconEntry = {};

  if (value.width !== undefined) {
    if (typeof value.width !== 'number' || !Number.isFinite(value.width) || value.width <= 0) {
      throw new Error(`Icon "${name}" has an invalid width.`);
    }
    entry.width = value.width;
  }
  if (value.height !== undefined) {
    if (
      typeof value.height !== 'number' ||
      !Number.isFinite(value.height) ||
      value.height <= 0
    ) {
      throw new Error(`Icon "${name}" has an invalid height.`);
    }
    entry.height = value.height;
  }
  if (value.viewBox !== undefined) {
    const validViewBox =
      (typeof value.viewBox === 'string' &&
        value.viewBox
          .trim()
          .split(/[\s,]+/)
          .map(Number)
          .every(Number.isFinite)) ||
      (Array.isArray(value.viewBox) &&
        value.viewBox.length === 4 &&
        value.viewBox.every((part) => Number.isFinite(part)));
    if (!validViewBox) {
      throw new Error(`Icon "${name}" has an invalid viewBox.`);
    }
    entry.viewBox = value.viewBox as IconEntry['viewBox'];
  }
  if (value.paths !== undefined) {
    if (typeof value.paths === 'string') {
      entry.paths = value.paths;
    } else if (
      Array.isArray(value.paths) &&
      value.paths.every((part) => typeof part === 'string')
    ) {
      entry.paths = value.paths as string[];
    } else {
      throw new Error(`Icon "${name}" has invalid paths.`);
    }
  }
  if (value.body !== undefined) {
    if (typeof value.body !== 'string' || value.body.length > MAX_BODY_CHARS) {
      throw new Error(`Icon "${name}" has an invalid body.`);
    }
    entry.body = value.body;
  }
  for (const key of ['fill', 'stroke'] as const) {
    const color = value[key];
    if (color !== undefined) {
      if (typeof color !== 'string') {
        throw new Error(`Icon "${name}" has an invalid ${key}.`);
      }
      entry[key] = color;
    }
  }
  if (value.strokeWidth !== undefined) {
    if (
      typeof value.strokeWidth !== 'number' ||
      !Number.isFinite(value.strokeWidth) ||
      value.strokeWidth < 0
    ) {
      throw new Error(`Icon "${name}" has an invalid strokeWidth.`);
    }
    entry.strokeWidth = value.strokeWidth;
  }
  if (!entry.paths && !entry.body) {
    throw new Error(`Icon "${name}" needs paths or body.`);
  }

  return entry;
}

export function decodeIconPack(data: Uint8Array): string {
  if (data[0] !== 0x1f || data[1] !== 0x8b) {
    return Buffer.from(data).toString('utf8');
  }

  try {
    return gunzipSync(data, { maxOutputLength: MAX_PACK_BYTES }).toString('utf8');
  } catch (error) {
    throw new Error(
      `Icon pack could not be decompressed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export function parseIconPack(text: string): IconPack {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Icon pack is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Icon pack must be a JSON object.');
  }
  const packValue = value as Record<string, unknown>;
  if (packValue.version !== undefined && packValue.version !== 1) {
    throw new Error('Icon pack version must be 1.');
  }
  if (
    typeof packValue.icons !== 'object' ||
    packValue.icons === null ||
    Array.isArray(packValue.icons)
  ) {
    throw new Error('Icon pack is missing an "icons" object.');
  }
  const iconsValue = packValue.icons as Record<string, unknown>;

  const names = Object.keys(iconsValue);
  if (names.length > MAX_ICONS) {
    throw new Error(`Icon pack contains more than ${MAX_ICONS} icons.`);
  }

  const icons: Record<string, IconEntry> = {};
  for (const name of names) {
    icons[name] = readEntry(iconsValue[name], name);
  }

  let aliases: Record<string, string> | undefined;
  if (packValue.aliases !== undefined) {
    if (
      typeof packValue.aliases !== 'object' ||
      packValue.aliases === null ||
      Array.isArray(packValue.aliases)
    ) {
      throw new Error('Icon pack "aliases" must be an object.');
    }
    aliases = {};
    for (const [name, target] of Object.entries(
      packValue.aliases as Record<string, unknown>
    )) {
      if (typeof target !== 'string') {
        throw new Error(`Alias "${name}" must point to a string.`);
      }
      aliases[name] = target;
    }
  }

  const pack: IconPack = { version: 1, icons };
  if (typeof packValue.name === 'string') {
    pack.name = packValue.name;
  }
  if (typeof packValue.license === 'string') {
    pack.license = packValue.license;
  }
  if (aliases) {
    pack.aliases = aliases;
  }
  return pack;
}

export class IconStore implements vscode.Disposable {
  private pack: IconPack | undefined;
  private packUri: vscode.Uri | undefined;
  private watcher: vscode.FileSystemWatcher | undefined;
  private generation = 0;
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private readonly subscriptions: vscode.Disposable[] = [];
  readonly onDidChange = this.changeEmitter.event;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(`mermaidView.${CONFIGURATION_KEY}`)) {
          void this.reload();
        }
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        void this.reload();
      })
    );
  }

  get currentPack(): IconPack | undefined {
    return this.pack;
  }

  get currentUri(): vscode.Uri | undefined {
    return this.packUri;
  }

  async load(): Promise<void> {
    await this.reload();
  }

  iconsFor(source: string): IconSelection {
    return selectIcons(this.pack, source);
  }

  async reload(): Promise<void> {
    const generation = ++this.generation;
    const uri = await resolveConfigFileUri(this.context, CONFIGURATION_KEY, [
      'mermaid-icons.json',
      'mermaid-icons.json.gz',
    ]);
    if (generation !== this.generation) {
      return;
    }
    if (!uri) {
      this.setPack(undefined, undefined);
      return;
    }

    try {
      const data = await vscode.workspace.fs.readFile(uri);
      if (generation !== this.generation) {
        return;
      }
      if (data.byteLength > MAX_PACK_BYTES) {
        throw new Error(`Icon pack is larger than ${MAX_PACK_BYTES} bytes.`);
      }
      const pack = parseIconPack(decodeIconPack(data));
      this.setPack(pack, uri);
    } catch (error) {
      if (generation !== this.generation) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Mermaid icon pack "${uri.toString()}": ${message}`);
      this.setPack(undefined, uri);
    }
  }

  dispose(): void {
    this.generation++;
    this.watcher?.dispose();
    this.changeEmitter.dispose();
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
  }

  private setPack(pack: IconPack | undefined, uri: vscode.Uri | undefined): void {
    this.pack = pack;
    this.packUri = uri;
    this.watch(uri);
    this.changeEmitter.fire();
  }

  private watch(uri: vscode.Uri | undefined): void {
    this.watcher?.dispose();
    this.watcher = undefined;
    if (!uri || uri.scheme !== 'file') {
      return;
    }

    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(path.dirname(uri.fsPath)), path.basename(uri.fsPath))
    );
    const reload = () => {
      void this.reload();
    };
    watcher.onDidCreate(reload);
    watcher.onDidChange(reload);
    watcher.onDidDelete(reload);
    this.watcher = watcher;
  }
}

