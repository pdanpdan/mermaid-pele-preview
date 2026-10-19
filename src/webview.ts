import { mount, type Mounted } from 'pele';
import { resolveIcon } from './icons';

type VsCodeApi = {
  postMessage(message: unknown): void;
};

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

const MOUNTED_ATTRIBUTE = 'data-pele-mounted';
const THEME_CLASSES = ['pele-theme-light', 'pele-theme-dark'];
const MAX_ZOOM = 4;
const ZOOM_LEVEL_STEP = 1;
const WHEEL_ZOOM_STEP = 1.25;
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const PELE_STYLE_VARIABLES = [
  '--pele-bg',
  '--pele-fg',
  '--pele-muted',
  '--pele-line',
  '--pele-surface',
  '--pele-surface-alt',
  '--pele-border',
  '--pele-accent',
  '--pele-critical',
  '--pele-error',
  '--pele-font',
  '--pele-font-mono',
  '--pele-radius',
  ...Array.from({ length: 8 }, (_, index) => `--pele-series-${index + 1}`),
];

function hint(text: string): HTMLElement {
  const element = document.createElement('p');
  element.className = 'pele-hint';
  element.textContent = text;
  return element;
}

function applyTheme(theme: unknown): void {
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.dataset.peleTheme = theme;
  } else {
    delete document.documentElement.dataset.peleTheme;
  }
}

function applyFont(font: unknown): void {
  if (typeof font === 'string' && font.trim()) {
    document.documentElement.style.setProperty('--mermaid-view-font', font.trim());
  } else {
    document.documentElement.style.removeProperty('--mermaid-view-font');
  }
}

class DiagramView {
  readonly figure: HTMLElement;

  private readonly container: HTMLElement;
  private readonly toolbar: HTMLElement;
  private readonly zoomLevel: HTMLElement;
  private readonly saveButton: HTMLButtonElement;
  private readonly lightButton: HTMLButtonElement;
  private readonly darkButton: HTMLButtonElement;
  private readonly zoomIn: HTMLButtonElement;
  private readonly zoomOut: HTMLButtonElement;
  private readonly fitButton: HTMLButtonElement;
  private readonly onSave: ((svg: string, name: string) => void) | undefined;
  private readonly resizeObserver: ResizeObserver;
  private mounted: Mounted | undefined;
  private svg: SVGSVGElement | null = null;
  private scale = 1;
  private fitScale = 1;
  private fitMode = true;
  private offsetX = 0;
  private naturalWidth = 0;
  private naturalHeight = 0;
  private dragging = false;
  private dragX = 0;

  constructor(container: HTMLElement, onSave?: (svg: string, name: string) => void) {
    this.container = container;
    this.onSave = onSave;
    this.figure = document.createElement('div');
    this.figure.className = 'pele-figure';

    this.toolbar = document.createElement('div');
    this.toolbar.className = 'pele-toolbar';
    this.toolbar.hidden = true;
    this.toolbar.setAttribute('role', 'group');
    this.toolbar.setAttribute('aria-label', 'Diagram controls');

    this.zoomLevel = document.createElement('span');
    this.zoomLevel.className = 'pele-zoom-level';

    this.saveButton = this.createButton('save', 'Save SVG', 'Save diagram as SVG');
    this.lightButton = this.createButton('light', '☀', 'Force light theme');
    this.darkButton = this.createButton('dark', '☾', 'Force dark theme');
    this.lightButton.setAttribute('aria-pressed', 'false');
    this.darkButton.setAttribute('aria-pressed', 'false');
    this.zoomOut = this.createButton('out', '−', 'Zoom out');
    this.zoomIn = this.createButton('in', '+', 'Zoom in');
    this.fitButton = this.createButton('fit', 'Fit', 'Fit diagram to width');

    const zoomRow = document.createElement('div');
    zoomRow.className = 'pele-toolbar-row';
    zoomRow.append(this.zoomLevel, this.zoomOut, this.zoomIn, this.fitButton);

    const actionRow = document.createElement('div');
    actionRow.className = 'pele-toolbar-row';
    actionRow.append(this.lightButton, this.darkButton, this.saveButton);

    this.toolbar.append(zoomRow, actionRow);

    if (container.parentNode) {
      container.replaceWith(this.figure);
    }
    this.figure.append(this.toolbar, container);

    container.tabIndex = 0;
    container.classList.add('pele-viewport');
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
    this.bindEvents();
    this.updateToolbar();
  }

  render(source: string): void {
    if (!source.trim()) {
      this.mounted?.destroy();
      this.mounted = undefined;
      this.svg = null;
      this.scale = 1;
      this.fitMode = true;
      this.applyZoom();
      this.container.replaceChildren(hint('Empty Mermaid diagram'));
      this.toolbar.hidden = true;
      return;
    }

    if (this.mounted) {
      this.mounted.update(source);
      if (this.mounted.error !== undefined) {
        this.svg = null;
        this.scale = 1;
        this.fitMode = true;
        this.applyZoom();
        this.toolbar.hidden = true;
      }
      return;
    }

    this.container.replaceChildren();
    try {
      this.mounted = mount(this.container, source, {
        zoom: false,
        responsive: false,
        maxWidth: Number.MAX_SAFE_INTEGER,
        icons: resolveIcon,
        onRender: () => this.handleRender(),
      });
      if (this.mounted.error !== undefined) {
        this.svg = null;
        this.scale = 1;
        this.fitMode = true;
        this.applyZoom();
        this.toolbar.hidden = true;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.svg = null;
      this.scale = 1;
      this.fitMode = true;
      this.container.replaceChildren(hint(`Could not render diagram: ${message}`));
      this.toolbar.hidden = true;
    }
  }

  private createButton(action: string, text: string, label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = action;
    button.textContent = text;
    button.title = label;
    button.setAttribute('aria-label', label);
    return button;
  }

  private bindEvents(): void {
    this.saveButton.addEventListener('click', () => this.saveSvg());
    this.lightButton.addEventListener('click', () => this.toggleTheme('light'));
    this.darkButton.addEventListener('click', () => this.toggleTheme('dark'));
    this.zoomIn.addEventListener('click', () => this.zoomBy(1));
    this.zoomOut.addEventListener('click', () => this.zoomBy(-1));
    this.fitButton.addEventListener('click', () => {
      this.scale = this.fitScale;
      this.fitMode = true;
      this.offsetX = 0;
      this.applyZoom();
    });

    this.container.addEventListener(
      'wheel',
      (event) => {
        if (!event.ctrlKey && !event.metaKey) {
          return;
        }
        event.preventDefault();
        const rect = this.container.getBoundingClientRect();
        const pointerX = event.clientX - rect.left;
        const factor = event.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
        const next = Math.min(MAX_ZOOM, Math.max(this.fitScale, this.scale * factor));
        this.setZoom(next, pointerX);
      },
      { passive: false }
    );

    this.container.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) {
        return;
      }
      this.container.focus({ preventScroll: true });
      if (!this.canPan()) {
        return;
      }
      this.dragging = true;
      this.dragX = event.clientX;
      try {
        this.container.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is unavailable in some synthetic event environments.
      }
      this.container.classList.add('pele-dragging');
    });

    this.container.addEventListener('pointermove', (event) => {
      if (!this.dragging) {
        return;
      }
      const delta = event.clientX - this.dragX;
      this.dragX = event.clientX;
      this.panBy(delta);
      event.preventDefault();
    });

    const stopDrag = (event: PointerEvent) => {
      if (!this.dragging) {
        return;
      }
      this.dragging = false;
      try {
        this.container.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore pointers that were never captured.
      }
      this.container.classList.remove('pele-dragging');
    };

    this.container.addEventListener('pointerup', stopDrag);
    this.container.addEventListener('pointercancel', stopDrag);

    this.container.addEventListener('dblclick', (event) => {
      event.preventDefault();
      if (this.scale > this.fitScale + 0.001) {
        this.scale = this.fitScale;
        this.fitMode = true;
        this.offsetX = 0;
        this.applyZoom();
        return;
      }
      const rect = this.container.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      this.setZoom(this.nextZoomIn(), pointerX);
    });

    this.container.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        this.zoomBy(1);
      } else if (event.key === '-') {
        event.preventDefault();
        this.zoomBy(-1);
      } else if (event.key === '0') {
        event.preventDefault();
        this.scale = this.fitScale;
        this.fitMode = true;
        this.offsetX = 0;
        this.applyZoom();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.panBy(48);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.panBy(-48);
      }
    });
  }

  private handleRender(): void {
    const svg = this.container.querySelector<SVGSVGElement>('svg.pele');
    this.svg = svg;
    if (!svg) {
      this.toolbar.hidden = true;
      return;
    }

    const widthAttribute = Number(svg.getAttribute('width'));
    const heightAttribute = Number(svg.getAttribute('height'));
    const viewBox = svg.viewBox.baseVal;
    const fallback = svg.getBoundingClientRect();
    const width =
      Number.isFinite(widthAttribute) && widthAttribute > 0
        ? widthAttribute
        : viewBox.width > 0
          ? viewBox.width
          : fallback.width;
    const height =
      Number.isFinite(heightAttribute) && heightAttribute > 0
        ? heightAttribute
        : viewBox.height > 0
          ? viewBox.height
          : fallback.height;
    if (width > 0 && height > 0) {
      this.naturalWidth = width;
      this.naturalHeight = height;
    }

    const wasFit = this.fitMode;
    this.fitScale = this.computeFitScale();
    if (wasFit || this.scale <= this.fitScale + 0.0001) {
      this.scale = this.fitScale;
      this.fitMode = true;
      this.offsetX = 0;
    } else {
      this.fitMode = false;
    }

    this.toolbar.hidden = false;
    this.applyZoom();
  }

  private computeFitScale(): number {
    const available = this.container.clientWidth;
    if (this.naturalWidth <= 0 || available <= 0) {
      return 1;
    }
    return Math.min(1, available / this.naturalWidth);
  }

  private handleResize(): void {
    const nextFit = this.computeFitScale();
    const changed = Math.abs(nextFit - this.fitScale) >= 0.0001;
    this.fitScale = nextFit;
    if (this.fitMode || this.scale < nextFit) {
      this.scale = nextFit;
      this.fitMode = true;
      this.offsetX = 0;
      this.applyZoom();
    } else if (changed) {
      this.applyZoom();
    }
  }

  private canPan(): boolean {
    return (
      this.naturalWidth > 0 &&
      this.naturalWidth * this.scale > this.container.clientWidth + 1
    );
  }

  private zoomBy(direction: 1 | -1): void {
    this.setZoom(
      direction > 0 ? this.nextZoomIn() : this.previousZoomOut(),
      this.container.clientWidth / 2
    );
  }

  private setZoom(next: number, anchorX: number): void {
    if (Math.abs(next - this.scale) < 0.001) {
      return;
    }

    const contentX = (anchorX - this.offsetX) / this.scale;
    this.scale = next;
    this.fitMode = Math.abs(next - this.fitScale) < 0.001;
    this.offsetX = anchorX - contentX * next;
    this.applyZoom();
  }

  private nextZoomIn(): number {
    return Math.min(
      MAX_ZOOM,
      Math.floor(this.scale / ZOOM_LEVEL_STEP + 0.000001) * ZOOM_LEVEL_STEP +
        ZOOM_LEVEL_STEP
    );
  }

  private previousZoomOut(): number {
    return Math.max(
      this.fitScale,
      Math.ceil(this.scale / ZOOM_LEVEL_STEP - 0.000001) * ZOOM_LEVEL_STEP -
        ZOOM_LEVEL_STEP
    );
  }

  private panBy(delta: number): void {
    if (!this.svg || !this.canPan()) {
      return;
    }
    const width = Math.ceil(this.naturalWidth * this.scale);
    const maxOffset = Math.min(0, this.container.clientWidth - width);
    this.offsetX = Math.min(0, Math.max(maxOffset, this.offsetX + delta));
    this.svg.style.marginLeft = `${this.offsetX}px`;
  }

  private applyZoom(): void {
    const svg = this.svg;
    if (!svg || this.naturalWidth <= 0 || this.naturalHeight <= 0) {
      this.resetStyles();
      return;
    }

    const panning = this.canPan();
    if (!panning && Math.abs(this.scale - 1) < 0.0001) {
      this.resetStyles();
      return;
    }

    const width =
      this.scale <= this.fitScale + 0.0001
        ? Math.floor(this.naturalWidth * this.scale)
        : Math.ceil(this.naturalWidth * this.scale);
    const height = Math.ceil(this.naturalHeight * this.scale);

    if (panning) {
      const maxOffset = Math.min(0, this.container.clientWidth - width);
      this.offsetX = Math.min(0, Math.max(maxOffset, this.offsetX));
    } else {
      this.offsetX = 0;
    }

    svg.style.maxWidth = 'none';
    svg.style.width = `${width}px`;
    svg.style.height = `${height}px`;
    svg.style.marginLeft = `${this.offsetX}px`;

    this.container.style.height = `${height}px`;
    this.container.style.overflow = panning ? 'hidden' : '';
    this.container.style.touchAction = panning ? 'pan-y' : '';
    this.container.classList.toggle('pele-zoomed', panning);
    this.updateToolbar();
  }

  private resetStyles(): void {
    if (this.svg) {
      this.svg.style.width = '';
      this.svg.style.height = '';
      this.svg.style.maxWidth = '';
      this.svg.style.marginLeft = '';
    }
    this.container.style.height = '';
    this.container.style.overflow = '';
    this.container.style.touchAction = '';
    this.container.classList.remove('pele-zoomed');
    this.offsetX = 0;
    this.updateToolbar();
  }

  private updateToolbar(): void {
    this.zoomLevel.textContent = `${Math.round(this.scale * 100)}%`;
    this.saveButton.disabled = !this.svg;
    const theme = this.forcedTheme();
    this.lightButton.setAttribute('aria-pressed', String(theme === 'light'));
    this.darkButton.setAttribute('aria-pressed', String(theme === 'dark'));
    const atFit = Math.abs(this.scale - this.fitScale) < 0.001;
    this.zoomIn.disabled = this.scale >= MAX_ZOOM - 0.001;
    this.zoomOut.disabled = this.scale <= this.fitScale + 0.001;
    this.fitButton.disabled = atFit;
  }

  private forcedTheme(): 'light' | 'dark' | undefined {
    if (this.container.classList.contains('pele-theme-light')) {
      return 'light';
    }
    if (this.container.classList.contains('pele-theme-dark')) {
      return 'dark';
    }
    return undefined;
  }

  private toggleTheme(theme: 'light' | 'dark'): void {
    const next = this.forcedTheme() === theme ? undefined : theme;
    this.container.classList.toggle('pele-theme-light', next === 'light');
    this.container.classList.toggle('pele-theme-dark', next === 'dark');
    this.updateToolbar();
  }

  private saveSvg(): void {
    if (!this.svg) {
      return;
    }

    const svg = this.serializeSvg();
    if (!svg) {
      return;
    }

    const name = this.suggestedSvgName();
    if (this.onSave) {
      this.onSave(svg, name);
      return;
    }
    this.downloadSvg(svg, name);
  }

  private serializeSvg(): string {
    const source = this.svg;
    if (!source) {
      return '';
    }

    const clone = source.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', SVG_NAMESPACE);
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    clone.style.removeProperty('width');
    clone.style.removeProperty('height');
    clone.style.removeProperty('margin-left');
    clone.style.removeProperty('max-width');

    const computed = getComputedStyle(this.container);
    const variables = new Set(PELE_STYLE_VARIABLES);
    for (const match of source.outerHTML.matchAll(/--pele-[a-z0-9-]+/gi)) {
      variables.add(match[0]);
    }
    for (const name of variables) {
      const value = computed.getPropertyValue(name).trim();
      if (value) {
        clone.style.setProperty(name, value);
      }
    }

    const background = computed.getPropertyValue('--pele-bg').trim() || '#ffffff';
    const backgroundRect = document.createElementNS(SVG_NAMESPACE, 'rect');
    backgroundRect.setAttribute('x', '0');
    backgroundRect.setAttribute('y', '0');
    backgroundRect.setAttribute('width', '100%');
    backgroundRect.setAttribute('height', '100%');
    backgroundRect.setAttribute('fill', background);
    clone.insertBefore(backgroundRect, clone.firstChild);

    return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}\n`;
  }

  private suggestedSvgName(): string {
    const line = Number(this.figure.dataset.line);
    return Number.isFinite(line) ? `mermaid-diagram-${line + 1}.svg` : 'mermaid-diagram.svg';
  }

  private downloadSvg(svg: string, name: string): void {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function initMarkdownPreview(): void {
  if (document.documentElement.dataset.pelePreviewInitialized) {
    return;
  }
  document.documentElement.dataset.pelePreviewInitialized = 'true';

  const scan = () => {
    for (const block of document.querySelectorAll<HTMLElement>(
      `pre.pele-mermaid:not([${MOUNTED_ATTRIBUTE}])`
    )) {
      block.setAttribute(MOUNTED_ATTRIBUTE, '');
      const source = block.textContent ?? '';
      const container = document.createElement('div');
      container.className = 'pele-diagram';
      if (block.dataset.font) {
        container.style.setProperty('--mermaid-view-font', block.dataset.font);
      }
      for (const themeClass of THEME_CLASSES) {
        if (block.classList.contains(themeClass)) {
          container.classList.add(themeClass);
        }
      }
      const view = new DiagramView(container);
      if (block.dataset.line) {
        view.figure.dataset.line = block.dataset.line;
      }
      block.replaceWith(view.figure);
      view.render(source);
    }
  };

  new MutationObserver(scan).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan, { once: true });
  } else {
    scan();
  }
}

function initEditor(container: HTMLElement): void {
  const vscode = window.acquireVsCodeApi?.();
  if (!vscode) {
    return;
  }

  const view = new DiagramView(container, (svg, name) => {
    vscode.postMessage({ type: 'saveSvg', svg, name });
  });

  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (!data || typeof data !== 'object') {
      return;
    }
    if (!('type' in data)) {
      return;
    }
    if (data.type === 'config') {
      if ('theme' in data) {
        applyTheme(data.theme);
      }
      if ('font' in data) {
        applyFont(data.font);
      }
      return;
    }
    if (data.type !== 'update' || !('text' in data) || typeof data.text !== 'string') {
      return;
    }
    if ('theme' in data) {
      applyTheme(data.theme);
    }
    if ('font' in data) {
      applyFont(data.font);
    }
    view.render(data.text);
  });

  vscode.postMessage({ type: 'ready' });
}

const editorRoot = document.getElementById('diagram');
if (editorRoot && typeof window.acquireVsCodeApi === 'function') {
  initEditor(editorRoot);
} else {
  initMarkdownPreview();
}
