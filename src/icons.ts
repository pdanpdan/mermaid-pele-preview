export interface IconEntry {
  width?: number;
  height?: number;
  viewBox?: string | [number, number, number, number];
  paths?: string | string[];
  body?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface IconPack {
  version?: 1;
  name?: string;
  license?: string;
  icons: Record<string, IconEntry>;
  aliases?: Record<string, string>;
}

export type IconSelection = Record<string, IconEntry>;

const ICON_REFERENCE = /(?:^|[^A-Za-z0-9_-])([A-Za-z][A-Za-z0-9-]*:[A-Za-z0-9_-]+)/g;
const MINDMAP_ICON = /::icon\(\s*([A-Za-z][A-Za-z0-9-]*)\s+([A-Za-z0-9_-]+)\s*\)/g;
const STYLE_ALIASES: Record<string, string> = {
  fa: 'fa',
  fas: 'fa',
  fal: 'fa',
  fad: 'fa',
  fak: 'fa',
  far: 'far',
  fab: 'fab',
};
const ALLOWED_BODY_TAGS: Record<string, true> = {
  circle: true,
  ellipse: true,
  g: true,
  line: true,
  path: true,
  polygon: true,
  polyline: true,
  rect: true,
};
const ALLOWED_BODY_ATTRIBUTES: Record<string, true> = {
  cx: true,
  cy: true,
  d: true,
  fill: true,
  'fill-rule': true,
  height: true,
  opacity: true,
  points: true,
  r: true,
  rx: true,
  ry: true,
  stroke: true,
  'stroke-linecap': true,
  'stroke-linejoin': true,
  'stroke-width': true,
  transform: true,
  width: true,
  x: true,
  x1: true,
  x2: true,
  y: true,
  y1: true,
  y2: true,
};
const sanitizedBodies = new WeakMap<IconEntry, string | undefined>();

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function safeColor(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }
  if (/^(?:currentColor|none|transparent|[a-z]+|#[0-9a-f]{3,8})$/i.test(value)) {
    return value;
  }
  if (/^(?:rgba?|hsla?)\([0-9.,% ]+\)$/i.test(value)) {
    return value;
  }
  return fallback;
}

function keyCandidates(name: string): string[] {
  const trimmed = name.trim();
  const separator = trimmed.indexOf(':');
  if (separator <= 0) {
    return [trimmed];
  }

  const style = trimmed.slice(0, separator).toLowerCase();
  let icon = trimmed.slice(separator + 1);
  if (icon.startsWith('fa-')) {
    icon = icon.slice(3);
  }
  const canonicalStyle = STYLE_ALIASES[style] ?? style;
  return [
    ...new Set([
      trimmed,
      `${style}:${icon}`,
      `${style}:fa-${icon}`,
      `${canonicalStyle}:${icon}`,
      `${canonicalStyle}:fa-${icon}`,
    ]),
  ];
}

function findEntry(pack: IconPack, name: string): IconEntry | undefined {
  const pending = [name];
  const seen = new Set<string>();

  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || seen.has(current)) {
      continue;
    }
    seen.add(current);

    const direct = pack.icons[current];
    if (direct) {
      return direct;
    }

    const alias = pack.aliases?.[current];
    if (alias) {
      pending.push(alias);
    }
    for (const candidate of keyCandidates(current)) {
      pending.push(candidate);
    }
  }

  return undefined;
}

function parseViewBox(
  value: IconEntry['viewBox']
): [number, number, number, number] | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const parts = trimmed ? trimmed.split(/[\s,]+/).map(Number) : [];
    return parts.length === 4 &&
      parts.every(Number.isFinite) &&
      parts[2] > 0 &&
      parts[3] > 0
      ? [parts[0], parts[1], parts[2], parts[3]]
      : undefined;
  }
  if (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every(Number.isFinite) &&
    value[2] > 0 &&
    value[3] > 0
  ) {
    return value;
  }
  return undefined;
}

function sanitizeBody(entry: IconEntry): string | undefined {
  if (!entry.body || typeof DOMParser === 'undefined') {
    return undefined;
  }
  if (sanitizedBodies.has(entry)) {
    return sanitizedBodies.get(entry);
  }

  let document: Document;
  try {
    document = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg">${entry.body}</svg>`,
      'image/svg+xml'
    );
  } catch {
    sanitizedBodies.set(entry, undefined);
    return undefined;
  }
  const root = document.documentElement;
  if (!root || document.querySelector('parsererror')) {
    sanitizedBodies.set(entry, undefined);
    return undefined;
  }

  for (const element of Array.from(document.querySelectorAll('*'))) {
    if (element === root) {
      continue;
    }
    if (ALLOWED_BODY_TAGS[element.localName] !== true) {
      element.remove();
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      if (ALLOWED_BODY_ATTRIBUTES[attribute.name] !== true) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  const markup = Array.from(document.documentElement.childNodes)
    .map((node) => new XMLSerializer().serializeToString(node))
    .join('');
  sanitizedBodies.set(entry, markup);
  return markup;
}

function iconMarkup(entry: IconEntry): string | undefined {
  const viewBox = parseViewBox(entry.viewBox);
  const width = entry.width ?? viewBox?.[2] ?? 24;
  const height = entry.height ?? viewBox?.[3] ?? 24;
  const scale = 24 / Math.max(width, height);
  const x = (24 - width * scale) / 2 - (viewBox?.[0] ?? 0) * scale;
  const y = (24 - height * scale) / 2 - (viewBox?.[1] ?? 0) * scale;
  const transform =
    Math.abs(scale - 1) > 0.0001 || x !== 0 || y !== 0
      ? ` transform="translate(${round(x)} ${round(y)}) scale(${round(scale)})"`
      : '';

  const body = sanitizeBody(entry);
  if (body) {
    return `<g${transform}>${body}</g>`;
  }

  if (!entry.paths) {
    return undefined;
  }

  const paths = Array.isArray(entry.paths) ? entry.paths : [entry.paths];
  if (paths.length === 0 || paths.some((path) => typeof path !== 'string')) {
    return undefined;
  }

  const attributes = [
    `fill="${escapeAttribute(safeColor(entry.fill, entry.stroke ? 'none' : 'currentColor'))}"`,
  ];
  if (entry.stroke) {
    attributes.push(`stroke="${escapeAttribute(safeColor(entry.stroke, 'none'))}"`);
    if (entry.strokeWidth !== undefined) {
      attributes.push(`stroke-width="${round(entry.strokeWidth)}"`);
    }
  } else {
    attributes.push('stroke="none"');
  }

  const pathElements = paths
    .map((path) => `<path ${attributes.join(' ')} d="${escapeAttribute(path)}"/>`)
    .join('');
  return `<g${transform}>${pathElements}</g>`;
}

export function collectIconNames(source: string): string[] {
  const names = new Set<string>();

  for (const match of source.matchAll(ICON_REFERENCE)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(MINDMAP_ICON)) {
    names.add(`${match[1]}:${match[2]}`);
  }

  return [...names];
}

export function selectIcons(pack: IconPack | undefined, source: string): IconSelection {
  if (!pack) {
    return {};
  }

  const icons: IconSelection = {};
  for (const name of collectIconNames(source)) {
    const entry = findEntry(pack, name);
    if (entry) {
      icons[name] = entry;
    }
  }
  return icons;
}

export function resolveIcon(name: string, icons: IconSelection | undefined): string | undefined {
  if (!icons) {
    return undefined;
  }

  for (const candidate of keyCandidates(name)) {
    const entry = icons[candidate];
    if (entry) {
      return iconMarkup(entry);
    }
  }
  return undefined;
}
