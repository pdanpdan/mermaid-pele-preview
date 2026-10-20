import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

export async function resolveConfigFileUri(
  context: vscode.ExtensionContext,
  setting: string,
  filenames: string[]
): Promise<vscode.Uri | undefined> {
  const configured = vscode.workspace
    .getConfiguration('mermaidView')
    .get<unknown>(setting);
  const value = typeof configured === 'string' ? configured.trim() : '';

  if (value) {
    return expandPath(value, context);
  }

  const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
  const candidates: vscode.Uri[] = [];
  if (folder) {
    for (const filename of filenames) {
      candidates.push(vscode.Uri.joinPath(folder, '.vscode', filename));
    }
    for (const filename of filenames) {
      candidates.push(vscode.Uri.joinPath(folder, filename));
    }
  }
  for (const filename of filenames) {
    candidates.push(vscode.Uri.joinPath(context.globalStorageUri, filename));
  }

  for (const candidate of candidates) {
    try {
      await vscode.workspace.fs.stat(candidate);
      return candidate;
    } catch {
      // Keep looking.
    }
  }
  return undefined;
}

function expandPath(
  value: string,
  context: vscode.ExtensionContext
): vscode.Uri | undefined {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
  const workspacePrefix = '${workspaceFolder}';

  if (value.startsWith(workspacePrefix)) {
    if (!workspaceFolder) {
      return undefined;
    }
    const relative = value.slice(workspacePrefix.length).replace(/^[/\\]/, '');
    return relative ? vscode.Uri.joinPath(workspaceFolder, relative) : workspaceFolder;
  }

  if (value === '~' || value.startsWith('~/')) {
    return vscode.Uri.file(path.join(os.homedir(), value.slice(2)));
  }

  if (path.isAbsolute(value)) {
    return vscode.Uri.file(value);
  }

  return workspaceFolder
    ? vscode.Uri.joinPath(workspaceFolder, value)
    : vscode.Uri.joinPath(context.globalStorageUri, value);
}
