import * as vscode from 'vscode';
import {
  DEFAULT_DIAGRAM_RENDER_SETTINGS,
  parseDiagramRenderSettings,
  type DiagramRenderSettings,
} from './renderSettings';
import { isDiagramTheme, type DiagramTheme } from './theme';

export function getDiagramTheme(): DiagramTheme {
  const value = vscode.workspace.getConfiguration('mermaidView').get<unknown>('theme');
  return isDiagramTheme(value) ? value : 'auto';
}

export function getDiagramFont(): string {
  const value = vscode.workspace.getConfiguration('mermaidView').get<unknown>('fontFamily');
  return typeof value === 'string' ? value.trim() : '';
}

export function getDiagramRenderSettings(): DiagramRenderSettings {
  const configuration = vscode.workspace.getConfiguration('mermaidView');
  return (
    parseDiagramRenderSettings({
      fontFamily: configuration.get('fontFamily'),
      fontFamilyMono: configuration.get('fontFamilyMono'),
      fontSize: configuration.get('fontSize'),
      monospace: configuration.get('monospace'),
      maxWidth: configuration.get('maxWidth'),
      autoDirection: configuration.get('autoDirection'),
      directionBreakpoint: configuration.get('directionBreakpoint'),
    }) ?? DEFAULT_DIAGRAM_RENDER_SETTINGS
  );
}
