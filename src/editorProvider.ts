import * as vscode from 'vscode';
import { getDiagramFont, getDiagramTheme } from './config';

export class MermaidEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = 'mermaidView.preview';

  constructor(private readonly extensionUri: vscode.Uri) {}

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
      void webview.postMessage({
        type: 'update',
        text: document.getText(),
        theme: getDiagramTheme(),
        font: getDiagramFont(),
      });
    };

    const messageSubscription = webview.onDidReceiveMessage((message: unknown) => {
      if (!message || typeof message !== 'object' || !('type' in message)) {
        return;
      }
      if (message.type === 'ready') {
        postUpdate();
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
      if (
        !event.affectsConfiguration('mermaidView.theme') &&
        !event.affectsConfiguration('mermaidView.fontFamily')
      ) {
        return;
      }
      void webview.postMessage({
        type: 'config',
        theme: getDiagramTheme(),
        font: getDiagramFont(),
      });
    });

    webviewPanel.onDidDispose(() => {
      clearTimeout(timer);
      changeSubscription.dispose();
      configSubscription.dispose();
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

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource};">
<title>Mermaid Preview</title>
<link rel="stylesheet" href="${styleUri}">
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
