import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  getDiagramFont,
  getDiagramRenderSettings,
  getDiagramTheme,
} from './config';
import type { IconStore } from './iconStore';
import type { ThemeStore } from './themeStore';

export class MermaidEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = 'mermaidView.preview';

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly iconStore: IconStore,
    private readonly themeStore: ThemeStore
  ) {}

  resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): void {
    const webview = webviewPanel.webview;

    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };
    webview.html = this.getHtml(webview);

    const postUpdate = () => {
      const text = document.getText();
      void webview.postMessage({
        type: 'update',
        text,
        icons: this.iconStore.iconsFor(text),
        themeVariables: this.themeStore.currentVariables,
        theme: getDiagramTheme(),
        font: getDiagramFont(),
        settings: getDiagramRenderSettings(),
      });
    };

    const saveSvg = async (svg: string): Promise<void> => {
      const sourcePath =
        document.uri.scheme === 'file' ? document.uri.fsPath : document.uri.path;
      const base =
        path.basename(sourcePath, path.extname(sourcePath)) || 'mermaid-diagram';
      const defaultUri =
        document.uri.scheme === 'file'
          ? vscode.Uri.file(path.join(path.dirname(document.uri.fsPath), `${base}.svg`))
          : undefined;
      try {
        const target = await vscode.window.showSaveDialog({
          defaultUri,
          filters: { 'SVG image': ['svg'] },
          saveLabel: 'Save SVG',
        });
        if (!target) {
          return;
        }
        await vscode.workspace.fs.writeFile(target, Buffer.from(svg, 'utf8'));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Could not save SVG: ${message}`);
      }
    };

    const messageSubscription = webview.onDidReceiveMessage((message: unknown) => {
      if (!message || typeof message !== 'object' || !('type' in message)) {
        return;
      }
      if (message.type === 'ready') {
        postUpdate();
        return;
      }
      if (message.type === 'saveSvg' && 'svg' in message && typeof message.svg === 'string') {
        void saveSvg(message.svg);
      }
    });

    let timer: NodeJS.Timeout | undefined;
    const changeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() !== document.uri.toString()) {
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(postUpdate, 80);
    });

    const configSubscription = vscode.workspace.onDidChangeConfiguration((event) => {
      const settings = [
        'theme',
        'fontFamily',
        'fontFamilyMono',
        'fontSize',
        'monospace',
        'maxWidth',
        'autoDirection',
        'directionBreakpoint',
      ];
      if (
        !settings.some((key) => event.affectsConfiguration(`mermaidView.${key}`))
      ) {
        return;
      }
      void webview.postMessage({
        type: 'config',
        theme: getDiagramTheme(),
        font: getDiagramFont(),
        themeVariables: this.themeStore.currentVariables,
        settings: getDiagramRenderSettings(),
      });
    });

    const iconSubscription = this.iconStore.onDidChange(postUpdate);
    const themeSubscription = this.themeStore.onDidChange(postUpdate);

    webviewPanel.onDidDispose(() => {
      clearTimeout(timer);
      changeSubscription.dispose();
      configSubscription.dispose();
      iconSubscription.dispose();
      themeSubscription.dispose();
      messageSubscription.dispose();
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = createNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'webview.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'preview.css')
    );
    const mathStyleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'temml.css')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource};">
<title>Mermaid Preview</title>
<link rel="stylesheet" href="${styleUri}">
<link rel="stylesheet" href="${mathStyleUri}">
</head>
<body>
<main id="root">
<div id="diagram" class="pele-diagram" aria-label="Mermaid diagram"></div>
</main>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function createNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return nonce;
}
