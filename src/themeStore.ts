import * as path from 'node:path';
import * as vscode from 'vscode';
import { resolveConfigFileUri } from './configFile';
import type { DiagramThemeVariables, ThemeVariables } from './theme';

const CONFIGURATION_KEY = 'themeFile';
const MAX_THEME_BYTES = 256 * 1024;
const MAX_VARIABLES = 500;
const PELE_VARIABLE = /^--pele-[a-z0-9-]+$/i;
const INVALID_VALUE = /[;{}<>]/;

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) {
      return true;
    }
  }
  return false;
}

function readVariables(value: unknown, mode: string): ThemeVariables {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Theme "${mode}" must be an object.`);
  }

  const variables: ThemeVariables = {};
  for (const [name, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!PELE_VARIABLE.test(name)) {
      throw new Error(`Theme variable "${name}" must start with "--pele-".`);
    }
    if (typeof entry !== 'string' || !entry.trim()) {
      throw new Error(`Theme variable "${name}" must be a non-empty string.`);
    }
    const variable = entry.trim();
    if (
      variable.length > 1000 ||
      INVALID_VALUE.test(variable) ||
      hasControlCharacter(variable)
    ) {
      throw new Error(`Theme variable "${name}" has an invalid value.`);
    }
    variables[name] = variable;
  }
  return variables;
}

export function parseThemeFile(text: string): DiagramThemeVariables {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Theme file is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Theme file must be a JSON object.');
  }

  const file = value as Record<string, unknown>;
  if (file.version !== undefined && file.version !== 1) {
    throw new Error('Theme file version must be 1.');
  }

  const theme: DiagramThemeVariables = {};
  let count = 0;
  for (const mode of ['light', 'dark'] as const) {
    if (file[mode] === undefined) {
      continue;
    }
    const variables = readVariables(file[mode], mode);
    count += Object.keys(variables).length;
    if (count > MAX_VARIABLES) {
      throw new Error(`Theme file contains more than ${MAX_VARIABLES} variables.`);
    }
    if (Object.keys(variables).length > 0) {
      theme[mode] = variables;
    }
  }

  if (!theme.light && !theme.dark) {
    throw new Error('Theme file must define "light", "dark", or both.');
  }
  return theme;
}

export class ThemeStore implements vscode.Disposable {
  private variables: DiagramThemeVariables | undefined;
  private themeUri: vscode.Uri | undefined;
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

  get currentVariables(): DiagramThemeVariables | undefined {
    return this.variables;
  }

  get currentUri(): vscode.Uri | undefined {
    return this.themeUri;
  }

  async load(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    const generation = ++this.generation;
    const uri = await resolveConfigFileUri(this.context, CONFIGURATION_KEY, [
      'mermaid-theme.json',
    ]);
    if (generation !== this.generation) {
      return;
    }
    if (!uri) {
      this.setVariables(undefined, undefined);
      return;
    }

    try {
      const data = await vscode.workspace.fs.readFile(uri);
      if (generation !== this.generation) {
        return;
      }
      if (data.byteLength > MAX_THEME_BYTES) {
        throw new Error(`Theme file is larger than ${MAX_THEME_BYTES} bytes.`);
      }
      const variables = parseThemeFile(Buffer.from(data).toString('utf8'));
      this.setVariables(variables, uri);
    } catch (error) {
      if (generation !== this.generation) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Mermaid theme "${uri.toString()}": ${message}`);
      this.setVariables(undefined, uri);
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

  private setVariables(
    variables: DiagramThemeVariables | undefined,
    uri: vscode.Uri | undefined
  ): void {
    this.variables = variables;
    this.themeUri = uri;
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
      new vscode.RelativePattern(
        vscode.Uri.file(path.dirname(uri.fsPath)),
        path.basename(uri.fsPath)
      )
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
