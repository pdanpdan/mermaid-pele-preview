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
const ZOOM_STEP = 1.25;

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
  private readonly zoomIn: HTMLButtonElement;
  private readonly zoomOut: HTMLButtonElement;
  private readonly fitButton: HTMLButtonElement;
  private mounted: Mounted | undefined;
  private svg: SVGSVGElement | null = null;
  private scale = 1;
  private offsetX = 0;
  private fitWidth = 0;
  private fitHeight = 0;
  private dragging = false;
  private dragX = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.figure = document.createElement('div');
    this.figure.className = 'pele-figure';

    this.toolbar = document.createElement('div');
    this.toolbar.className = 'pele-toolbar';
    this.toolbar.hidden = true;
    this.toolbar.setAttribute('role', 'group');
    this.toolbar.setAttribute('aria-label', 'Diagram zoom');

    this.zoomLevel = document.createElement('span');
    this.zoomLevel.className = 'pele-zoom-level';

    this.zoomOut = this.createButton('out', '−', 'Zoom out');
    this.zoomIn = this.createButton('in', '+', 'Zoom in');
    this.fitButton = this.createButton('fit', 'Fit', 'Fit diagram to width');

    this.toolbar.append(this.zoomLevel, this.zoomOut, this.zoomIn, this.fitButton);

    if (container.parentNode) {
      container.replaceWith(this.figure);
    }
    this.figure.append(this.toolbar, container);

    container.tabIndex = 0;
    container.classList.add('pele-viewport');
    this.bindEvents();
    this.updateToolbar();
  }

  render(source: string): void {
    if (!source.trim()) {
      this.mounted?.destroy();
      this.mounted = undefined;
      this.svg = null;
      this.scale = 1;
      this.applyZoom();
      this.container.replaceChildren(hint('Empty Mermaid diagram'));
      this.toolbar.hidden = true;
      return;
    }

    if (this.mounted) {
      this.mounted.update(source);
      if (this.mounted.error !== undefined) {
        this.scale = 1;
        this.applyZoom();
        this.toolbar.hidden = true;
      }
      return;
    }

    this.container.replaceChildren();
    try {
      this.mounted = mount(this.container, source, {
        zoom: false,
        icons: resolveIcon,
        onRender: () => this.handleRender(),
      });
      if (this.mounted.error !== undefined) {
        this.scale = 1;
        this.applyZoom();
        this.toolbar.hidden = true;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
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
    this.zoomIn.addEventListener('click', () => this.zoomBy(ZOOM_STEP));
    this.zoomOut.addEventListener('click', () => this.zoomBy(1 / ZOOM_STEP));
    this.fitButton.addEventListener('click', () => {
      this.scale = 1;
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
        const contentX = (pointerX - this.offsetX) / this.scale;
        const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
        const next = Math.min(MAX_ZOOM, Math.max(1, this.scale * factor));
        if (Math.abs(next - this.scale) < 0.001) {
          return;
        }
        this.scale = next;
        this.offsetX = pointerX - contentX * next;
        this.applyZoom();
      },
      { passive: false }
    );

    this.container.addEventListener('pointerdown', (event) => {
      if (this.scale <= 1 || event.button !== 0) {
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
      this.container.focus({ preventScroll: true });
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
      if (this.scale > 1.001) {
        this.scale = 1;
        this.applyZoom();
        return;
      }
      const rect = this.container.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      this.scale = Math.min(2, MAX_ZOOM);
      this.offsetX = pointerX - pointerX * this.scale;
      this.applyZoom();
    });

    this.container.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        this.zoomBy(ZOOM_STEP);
      } else if (event.key === '-') {
        event.preventDefault();
        this.zoomBy(1 / ZOOM_STEP);
      } else if (event.key === '0') {
        event.preventDefault();
        this.scale = 1;
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

    const rect = svg.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.fitWidth = rect.width;
      this.fitHeight = rect.height;
    }

    this.toolbar.hidden = false;
    this.applyZoom();
  }

  private zoomBy(factor: number): void {
    const next = Math.min(MAX_ZOOM, Math.max(1, this.scale * factor));
    if (Math.abs(next - this.scale) < 0.001) {
      return;
    }

    const center = this.container.clientWidth / 2;
    const contentX = (center - this.offsetX) / this.scale;
    this.scale = next;
    this.offsetX = center - contentX * next;
    this.applyZoom();
  }

  private panBy(delta: number): void {
    if (this.scale <= 1 || !this.svg) {
      return;
    }
    const width = Math.ceil(this.fitWidth * this.scale);
    const maxOffset = Math.min(0, this.container.clientWidth - width);
    this.offsetX = Math.min(0, Math.max(maxOffset, this.offsetX + delta));
    this.svg.style.marginLeft = `${this.offsetX}px`;
  }

  private applyZoom(): void {
    if (this.scale <= 1.0001 || this.fitWidth <= 0 || this.fitHeight <= 0) {
      this.resetStyles();
      return;
    }

    const svg = this.svg;
    if (!svg) {
      this.resetStyles();
      return;
    }

    const width = Math.ceil(this.fitWidth * this.scale);
    const height = Math.ceil(this.fitHeight * this.scale);
    const maxOffset = Math.min(0, this.container.clientWidth - width);
    this.offsetX = Math.min(0, Math.max(maxOffset, this.offsetX));

    svg.style.maxWidth = 'none';
    svg.style.width = `${width}px`;
    svg.style.height = `${height}px`;
    svg.style.marginLeft = `${this.offsetX}px`;

    this.container.style.height = `${height}px`;
    this.container.style.overflow = 'hidden';
    this.container.style.touchAction = 'pan-y';
    this.container.classList.add('pele-zoomed');
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
    this.zoomIn.disabled = this.scale >= MAX_ZOOM - 0.001;
    this.zoomOut.disabled = this.scale <= 1.001;
    this.fitButton.disabled = this.scale <= 1.001;
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

  const view = new DiagramView(container);

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
