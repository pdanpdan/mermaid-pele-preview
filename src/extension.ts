import type MarkdownIt from 'markdown-it';
import * as vscode from 'vscode';
import { getDiagramFont, getDiagramTheme } from './config';
import { MermaidEditorProvider } from './editorProvider';
import { mermaidMarkdownPlugin } from './markdown';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      MermaidEditorProvider.viewType,
      new MermaidEditorProvider(context.extensionUri),
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
    )
  );

  return {
    extendMarkdownIt(md: MarkdownIt) {
      return mermaidMarkdownPlugin(md, getDiagramTheme, getDiagramFont);
    },
  };
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
