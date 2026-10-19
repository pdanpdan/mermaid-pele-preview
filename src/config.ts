import * as vscode from 'vscode';
import { isDiagramTheme, type DiagramTheme } from './theme';

export function getDiagramTheme(): DiagramTheme {
  const value = vscode.workspace.getConfiguration('mermaidView').get<unknown>('theme');
  return isDiagramTheme(value) ? value : 'auto';
}

export function getDiagramFont(): string {
  const value = vscode.workspace.getConfiguration('mermaidView').get<unknown>('fontFamily');
  return typeof value === 'string' ? value.trim() : '';
}
