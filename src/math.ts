import type { MathMarkup, MathResolver } from 'pele';
import temml from 'temml';

let probe: HTMLElement | undefined;

function measurementProbe(): HTMLElement {
  if (probe) {
    return probe;
  }

  probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;left:-9999px;top:0;visibility:hidden;' +
    'display:inline-block;white-space:nowrap';
  document.body.append(probe);
  return probe;
}

/**
 * Typesets Pele's `$$...$$` labels with Temml. Pele inserts this MathML in a
 * foreignObject; returning only the math element keeps Temml wrappers from
 * affecting the measured box.
 */
export const resolveMath: MathResolver = (tex: string, size: number): MathMarkup | null => {
  try {
    const element = measurementProbe();
    element.style.fontSize = `${size}px`;
    element.innerHTML = temml.renderToString(tex, {
      displayMode: true,
      throwOnError: true,
    });

    const math = element.querySelector('math');
    if (!math) {
      return null;
    }

    const { width, height } = math.getBoundingClientRect();
    if (!(width > 0) || !(height > 0)) {
      return null;
    }

    return { html: math.outerHTML, width, height };
  } catch {
    // Pele falls back to the TeX source when the resolver returns nothing.
    return null;
  }
};
