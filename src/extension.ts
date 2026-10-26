import type { MarkdownIt } from 'markdown-it';
import * as vscode from 'vscode';
import { getDiagramRenderSettings, getDiagramTheme } from './config';
import { MermaidEditorProvider } from './editorProvider';
import { decodeIconPack, IconStore, parseIconPack } from './iconStore';
import { mermaidMarkdownPlugin } from './markdown';
import { ThemeStore } from './themeStore';

const ICON_PACK_URL =
  'https://raw.githubusercontent.com/pdanpdan/mermaid-pele-preview/main/icons/font-awesome.json.gz';
const ICON_PACK_FILE = 'font-awesome.json.gz';

export async function activate(context: vscode.ExtensionContext) {
  const iconStore = new IconStore(context);
  const themeStore = new ThemeStore(context);
  context.subscriptions.push(iconStore, themeStore);
  await Promise.all([iconStore.load(), themeStore.load()]);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      MermaidEditorProvider.viewType,
      new MermaidEditorProvider(context.extensionUri, iconStore, themeStore),
      { supportsMultipleEditorsPerDocument: true }
    ),
    vscode.commands.registerCommand('mermaidView.openSource', async () => {
      const uri = activeDocumentUri();
      if (!uri) {
        void vscode.window.showInformationMessage('Open a Mermaid file first.');
        return;
      }
      await vscode.commands.executeCommand('vscode.openWith', uri, 'default');
    }),
    vscode.commands.registerCommand('mermaidView.openPreview', async (resource?: unknown) => {
      const uri = mermaidUri(resource);
      if (!uri) {
        void vscode.window.showInformationMessage('Open a Mermaid file first.');
        return;
      }
      await vscode.commands.executeCommand(
        'vscode.openWith',
        uri,
        MermaidEditorProvider.viewType
      );
    }),
    vscode.commands.registerCommand(
      'mermaidView.openPreviewToSide',
      async (resource?: unknown) => {
        const uri = mermaidUri(resource);
        if (!uri) {
          void vscode.window.showInformationMessage('Open a Mermaid file first.');
          return;
        }
        await vscode.commands.executeCommand(
          'vscode.openWith',
          uri,
          MermaidEditorProvider.viewType,
          vscode.ViewColumn.Beside
        );
      }
    ),
    vscode.commands.registerCommand('mermaidView.downloadIconPack', () =>
      downloadIconPack(context, iconStore)
    )
  );

  const refreshMarkdownPreview = () => {
    void vscode.commands.executeCommand('markdown.preview.refresh').then(
      undefined,
      () => undefined
    );
  };
  context.subscriptions.push(
    iconStore.onDidChange(refreshMarkdownPreview),
    themeStore.onDidChange(refreshMarkdownPreview),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('mermaidView')) {
        refreshMarkdownPreview();
      }
    })
  );

  return {
    extendMarkdownIt(md: MarkdownIt) {
      return mermaidMarkdownPlugin(
        md,
        getDiagramTheme,
        getDiagramRenderSettings,
        (source) => iconStore.iconsFor(source),
        () => themeStore.currentVariables
      );
    },
  };
}

async function downloadIconPack(
  context: vscode.ExtensionContext,
  iconStore: IconStore
): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Downloading Font Awesome icon pack',
    },
    async () => {
      try {
        const response = await fetch(ICON_PACK_URL, {
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        const data = new Uint8Array(await response.arrayBuffer());
        parseIconPack(decodeIconPack(data));

        const target = vscode.Uri.joinPath(context.globalStorageUri, ICON_PACK_FILE);
        await vscode.workspace.fs.createDirectory(context.globalStorageUri);
        await vscode.workspace.fs.writeFile(target, data);

        const configuration = vscode.workspace.getConfiguration('mermaidView');
        const inspected = configuration.inspect<string>('iconPack');
        await configuration.update(
          'iconPack',
          target.fsPath,
          vscode.ConfigurationTarget.Global
        );
        await iconStore.reload();

        if (
          inspected?.workspaceFolderValue !== undefined ||
          inspected?.workspaceValue !== undefined
        ) {
          void vscode.window.showWarningMessage(
            'The icon pack was downloaded, but a workspace mermaidView.iconPack setting takes precedence.'
          );
        } else {
          void vscode.window.showInformationMessage(
            `Font Awesome icon pack downloaded to ${target.fsPath}.`
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(
          `Could not download the Font Awesome icon pack: ${message}`
        );
      }
    }
  );
}

function activeDocumentUri(): vscode.Uri | undefined {
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  if (tab?.input instanceof vscode.TabInputCustom) {
    return tab.input.uri;
  }
  if (tab?.input instanceof vscode.TabInputText) {
    return tab.input.uri;
  }
  return vscode.window.activeTextEditor?.document.uri;
}

function mermaidUri(resource?: unknown): vscode.Uri | undefined {
  const uri = resource instanceof vscode.Uri ? resource : activeDocumentUri();
  return uri && /\.(mmd|mermaid)$/i.test(uri.path) ? uri : undefined;
}
