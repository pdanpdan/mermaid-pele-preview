import type { MarkdownIt } from 'markdown-it';
import type { DiagramTheme } from './theme';

const MERMAID_LANGS: Record<string, true> = { mermaid: true };

/**
 * Replaces ```mermaid fences with a placeholder that the preview script
 * renders with Pele. Rendering happens in the webview because the Markdown
 * preview sanitizes the HTML produced by markdown-it.
 */
export function mermaidMarkdownPlugin(
  md: MarkdownIt,
  getTheme: () => DiagramTheme,
  getFont: () => string
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
    const font = getFont();
    const fontAttribute = font ? ` data-font="${md.utils.escapeHtml(font)}"` : '';
    const line = token.map ? ` data-line="${token.map[0]}"` : '';
    return `<pre class="pele-mermaid${themeClass}"${fontAttribute}${line}>${md.utils.escapeHtml(token.content)}</pre>\n`;
  };

  return md;
}
