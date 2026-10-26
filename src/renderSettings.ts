export type DiagramMonospacePart = 'members' | 'attributes' | 'files' | 'messages';

export interface DiagramRenderSettings {
  readonly fontFamily: string;
  readonly fontFamilyMono: string;
  readonly fontSize: number;
  readonly monospace: readonly DiagramMonospacePart[];
  readonly maxWidth: number;
  readonly autoDirection: boolean;
  readonly directionBreakpoint: number;
}

export const DEFAULT_DIAGRAM_RENDER_SETTINGS: DiagramRenderSettings = {
  fontFamily: '',
  fontFamilyMono: '',
  fontSize: 16,
  monospace: [],
  maxWidth: 0,
  autoDirection: true,
  directionBreakpoint: 640,
};

const MONOSPACE_PARTS: Record<DiagramMonospacePart, true> = {
  members: true,
  attributes: true,
  files: true,
  messages: true,
};

function numberInRange(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function monospaceParts(value: unknown): DiagramMonospacePart[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [
    ...new Set(
      value.filter(
        (part): part is DiagramMonospacePart =>
          typeof part === 'string' &&
          MONOSPACE_PARTS[part as DiagramMonospacePart] === true
      )
    ),
  ];
}

export function parseDiagramRenderSettings(
  value: unknown
): DiagramRenderSettings | undefined {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return undefined;
    }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }

  const settings = parsed as Record<string, unknown>;
  return {
    fontFamily:
      typeof settings.fontFamily === 'string'
        ? settings.fontFamily.trim()
        : DEFAULT_DIAGRAM_RENDER_SETTINGS.fontFamily,
    fontFamilyMono:
      typeof settings.fontFamilyMono === 'string'
        ? settings.fontFamilyMono.trim()
        : DEFAULT_DIAGRAM_RENDER_SETTINGS.fontFamilyMono,
    fontSize: numberInRange(
      settings.fontSize,
      DEFAULT_DIAGRAM_RENDER_SETTINGS.fontSize,
      6,
      48
    ),
    monospace: monospaceParts(settings.monospace),
    maxWidth: numberInRange(
      settings.maxWidth,
      DEFAULT_DIAGRAM_RENDER_SETTINGS.maxWidth,
      0,
      10000
    ),
    autoDirection:
      typeof settings.autoDirection === 'boolean'
        ? settings.autoDirection
        : DEFAULT_DIAGRAM_RENDER_SETTINGS.autoDirection,
    directionBreakpoint: numberInRange(
      settings.directionBreakpoint,
      DEFAULT_DIAGRAM_RENDER_SETTINGS.directionBreakpoint,
      200,
      2000
    ),
  };
}
