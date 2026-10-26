import type { MarkdownIt } from 'markdown-it';
import type { IconSelection } from './icons';
import type { DiagramRenderSettings } from './renderSettings';
import type { DiagramTheme, DiagramThemeVariables } from './theme';

const MERMAID_LANGS: Record<string, true> = { mermaid: true };

/**
 * Replaces ```mermaid fences with a placeholder that the preview script
 * renders with Pele. Rendering happens in the webview because the Markdown
 * preview sanitizes the HTML produced by markdown-it.
 */
export function mermaidMarkdownPlugin(
  md: MarkdownIt,
  getTheme: () => DiagramTheme,
  getSettings: () => DiagramRenderSettings,
  getIcons: (source: string) => IconSelection,
  getThemeVariables: () => DiagramThemeVariables | undefined
): MarkdownIt {
  const defaultFence = md.renderer.rules.fence;

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const language = token.info.trim().split(/\s+/, 1)[0].toLowerCase();

    if (MERMAID_LANGS[language] !== true) {
      return defaultFence
        ? defaultFence(tokens, idx, options, env, self)
        : self.renderToken(tokens, idx, options);
    }

    const theme = getTheme();
    const themeClass = theme === 'auto' ? '' : ` pele-theme-${theme}`;
    const settings = getSettings();
    const font = settings.fontFamily;
    const fontAttribute = font ? ` data-font="${md.utils.escapeHtml(font)}"` : '';
    const fontMonoAttribute = settings.fontFamilyMono
      ? ` data-font-mono="${md.utils.escapeHtml(settings.fontFamilyMono)}"`
      : '';
    const settingsAttribute = ` data-settings="${md.utils.escapeHtml(
      JSON.stringify(settings)
    )}"`;
    const icons = getIcons(token.content);
    const iconsAttribute =
      Object.keys(icons).length > 0
        ? ` data-icons="${md.utils.escapeHtml(JSON.stringify(icons))}"`
        : '';
    const themeVariables = getThemeVariables();
    const themeVariablesAttribute =
      themeVariables && (themeVariables.light || themeVariables.dark)
        ? ` data-theme-vars="${md.utils.escapeHtml(JSON.stringify(themeVariables))}"`
        : '';
    const line = token.map ? ` data-line="${token.map[0]}"` : '';
    return `<pre class="pele-mermaid${themeClass}"${fontAttribute}${fontMonoAttribute}${settingsAttribute}${iconsAttribute}${themeVariablesAttribute}${line}>${md.utils.escapeHtml(token.content)}</pre>\n`;
  };

  return md;
}
