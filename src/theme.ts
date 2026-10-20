export type DiagramTheme = 'auto' | 'light' | 'dark';

export type ThemeVariables = Record<string, string>;

export interface DiagramThemeVariables {
  light?: ThemeVariables;
  dark?: ThemeVariables;
}

export function isDiagramTheme(value: unknown): value is DiagramTheme {
  return value === 'auto' || value === 'light' || value === 'dark';
}
