export type DiagramTheme = 'auto' | 'light' | 'dark';

export function isDiagramTheme(value: unknown): value is DiagramTheme {
  return value === 'auto' || value === 'light' || value === 'dark';
}
