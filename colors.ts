type Level = "info" | "ok" | "warn" | "error";
const say = (level: Level, text: string) =>
  figma.ui.postMessage({ type: "status", level, text });

export interface ColorOpts {
  primary: string;
  secondary: string;
  tertiary?: string;
  error?: string;
  dashboard: boolean;
}

export const DEFAULT_COLORS = {
  primary: "#f2aa74",
  secondary: "#a9ca62",
  tertiary: "#9fd3e6",
  error: "#e5565b",
};

const GROUPS = ["Primary", "Secondary", "Tertiary", "Error"] as const;
type Group = (typeof GROUPS)[number];

type Rgb8 = [number, number, number];

interface Swatch {
  name: string;
  c: Rgb8;
  hex: string;
  style?: PaintStyle;
}

const STEPS: { name: string; mode: "tint" | "shade" | "base"; f: number }[] = [
  { name: "Light", mode: "tint", f: 0.9 },
  { name: "Light :hover", mode: "tint", f: 0.85 },
  { name: "Light :active", mode: "tint", f: 0.69 },
  { name: "Normal", mode: "base", f: 0 },
  { name: "Normal :hover", mode: "shade", f: 0.9 },
  { name: "Normal :active", mode: "shade", f: 0.8 },
  { name: "Dark", mode: "shade", f: 0.75 },
  { name: "Dark :hover", mode: "shade", f: 0.6 },
  { name: "Dark :active", mode: "shade", f: 0.45 },
  { name: "Darker", mode: "shade", f: 0.35 },
];
const NORMAL = STEPS.findIndex((s) => s.mode === "base");

const BLACK: RGB = { r: 0, g: 0, b: 0 };
const WHITE: RGB = { r: 1, g: 1, b: 1 };
const GRAY: RGB = { r: 0.6, g: 0.64, b: 0.7 };
const BORDER: RGB = { r: 0.9, g: 0.91, b: 0.95 };
const solid = (c: RGB): Paint[] => [{ type: "SOLID", color: c }];
const toRgb = (c: Rgb8): RGB => ({
  r: c[0] / 255,
  g: c[1] / 255,
  b: c[2] / 255,
});

function parseHex(h: string): Rgb8 | null {
  const m = h.trim().replace("#", "");
  const full =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function scale(base: Rgb8): Swatch[] {
  return STEPS.map((s) => {
    const c = base.map((v) =>
      s.mode === "tint"
        ? Math.round(v + (255 - v) * s.f)
        : s.mode === "shade"
          ? Math.round(v * s.f)
          : v,
    ) as Rgb8;
    const hex = "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
    return { name: s.name, c, hex };
  });
}

const lin = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const luminance = (c: Rgb8) =>
  0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
function contrast(a: Rgb8, b: Rgb8) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function grade(r: number) {
  return {
    large: r >= 4.5 ? "AAA" : r >= 3 ? "AA" : "",
    normal: r >= 7 ? "AAA" : r >= 4.5 ? "AA" : "",
  };
}

const saveCfg = (c: object) =>
  figma.root.setPluginData(
    "colorCfg",
    JSON.stringify({ ...c, rev: Date.now() }),
  );
const loadCfg = () => {
  try {
    return JSON.parse(figma.root.getPluginData("colorCfg") || "{}");
  } catch (e) {
    return {};
  }
};
export const sendColorCfg = () =>
  figma.ui.postMessage({ type: "colors-saved", saved: loadCfg() });

let fontList: Font[] | null = null;
const compact = (v: string) => v.replace(/[\s\-_]/g, "").toLowerCase();
async function inter(weight: string): Promise<FontName> {
  if (!fontList) fontList = await figma.listAvailableFontsAsync();
  const inters = fontList.filter((f) => f.fontName.family === "Inter");
  const hit =
    inters.find((f) => compact(f.fontName.style) === compact(weight)) ||
    inters.find((f) => compact(f.fontName.style) === "regular") ||
    fontList[0];
  await figma.loadFontAsync(hit.fontName);
  return hit.fontName;
}

async function txt(chars: string, size: number, weight: string, color: RGB) {
  const fn = await inter(weight);
  const t = figma.createText();
  t.fontName = fn;
  t.fontSize = size;
  t.characters = chars;
  t.fills = solid(color);
  return t;
}

async function gummy(chars: string, size: number, weight: string, color: RGB) {
  if (!fontList) fontList = await figma.listAvailableFontsAsync();
  const fam = fontList.filter((f) => f.fontName.family === "Sour Gummy");
  const hit =
    fam.find((f) => compact(f.fontName.style) === compact(weight)) ||
    fam.find((f) => compact(f.fontName.style) === "regular") ||
    fam[0];
  const fn = hit ? hit.fontName : await inter("Regular");
  await figma.loadFontAsync(fn);
  const t = figma.createText();
  t.fontName = fn;
  t.fontSize = size;
  t.lineHeight = { unit: "AUTO" };
  t.characters = chars;
  t.textAutoResize = "WIDTH_AND_HEIGHT";
  t.fills = solid(color);
  return t;
}

function box(dir: "HORIZONTAL" | "VERTICAL", gap: number) {
  const f = figma.createFrame();
  f.fills = [];
  f.clipsContent = false;
  f.layoutMode = dir;
  f.itemSpacing = gap;
  f.primaryAxisSizingMode = "AUTO";
  f.counterAxisSizingMode = "AUTO";
  return f;
}

async function upsert(
  group: string,
  sw: Swatch[],
  existing: Map<string, PaintStyle>,
) {
  let created = 0;
  let updated = 0;
  for (const s of sw) {
    const name = `${group}/${s.name}`;
    let st = existing.get(name);
    if (st) updated++;
    else {
      st = figma.createPaintStyle();
      created++;
      existing.set(name, st);
    }
    st.name = name;
    st.paints = solid(toRgb(s.c));
    s.style = st;
  }
  return { created, updated };
}

async function badge(dot: RGB, ratio: number) {
  const pill = box("HORIZONTAL", 8);
  pill.name = "Contrast";
  pill.counterAxisAlignItems = "CENTER";
  pill.paddingLeft = 8;
  pill.paddingRight = 12;
  pill.paddingTop = 4;
  pill.paddingBottom = 4;
  pill.cornerRadius = 100;
  pill.fills = [{ type: "SOLID", color: WHITE, opacity: 0.8 }];

  const d = figma.createEllipse();
  d.resize(20, 20);
  d.fills = solid(dot);
  d.strokes = solid(BORDER);
  d.strokeWeight = 1;
  pill.appendChild(d);

  pill.appendChild(await txt(ratio.toFixed(2), 20, "Regular", BLACK));
  const g = grade(ratio);
  if (g.large) pill.appendChild(await txt(g.large, 16, "Regular", BLACK));
  if (g.normal) pill.appendChild(await txt(g.normal, 11, "Regular", BLACK));
  return pill;
}

async function column(title: string, sw: Swatch[]) {
  const col = box("VERTICAL", 34);
  col.name = title;
  col.appendChild(await gummy(title, 56, "Bold", BLACK));
  for (const s of sw) {
    const row = box("HORIZONTAL", 32);
    row.name = s.name;
    row.counterAxisAlignItems = "CENTER";

    const chip = figma.createFrame();
    chip.name = "Swatch";
    chip.layoutMode = "VERTICAL";
    chip.primaryAxisSizingMode = "FIXED";
    chip.counterAxisSizingMode = "FIXED";
    chip.resize(318, 110);
    chip.primaryAxisAlignItems = "CENTER";
    chip.counterAxisAlignItems = "MIN";
    chip.itemSpacing = 8;
    chip.paddingLeft = 16;
    chip.paddingRight = 16;
    chip.cornerRadius = 20;
    chip.clipsContent = false;
    chip.fills = solid(toRgb(s.c));
    chip.strokes = solid(BORDER);
    chip.strokeWeight = 2;
    chip.strokeAlign = "INSIDE";
    if (s.style) await chip.setFillStyleIdAsync(s.style.id);

    chip.appendChild(await badge(BLACK, contrast(s.c, [0, 0, 0])));
    chip.appendChild(await badge(WHITE, contrast(s.c, [255, 255, 255])));

    const info = box("VERTICAL", 4);
    info.appendChild(await txt(s.name, 26, "Regular", BLACK));
    info.appendChild(await txt(s.hex, 20, "Regular", GRAY));
    info.appendChild(
      await txt(`rgb(${s.c[0]}, ${s.c[1]}, ${s.c[2]})`, 20, "Regular", GRAY),
    );

    row.appendChild(chip);
    row.appendChild(info);
    col.appendChild(row);
  }
  return col;
}

async function buildBoard(scales: Record<Group, Swatch[]>) {
  const name = "COLORS";
  const old = figma.currentPage.findChild(
    (n) => n.type === "FRAME" && n.name === name,
  );
  const pos = old
    ? { x: old.x, y: old.y }
    : { x: figma.viewport.center.x, y: figma.viewport.center.y };
  if (old) old.remove();

  const root = figma.createFrame();
  root.name = name;
  root.layoutMode = "HORIZONTAL";
  root.primaryAxisSizingMode = "AUTO";
  root.counterAxisSizingMode = "AUTO";
  root.counterAxisAlignItems = "MIN";
  root.itemSpacing = 140;
  root.paddingLeft = root.paddingRight = 85;
  root.paddingTop = root.paddingBottom = 85;
  root.fills = solid(WHITE);
  for (const g of GROUPS) root.appendChild(await column(g, scales[g]));
  root.x = pos.x;
  root.y = pos.y;
  figma.currentPage.appendChild(root);
  return root;
}

export type ColorMaps = Record<Group, Map<string, PaintStyle>>;

export async function ensureColorStyles(
  primary: string,
  secondary: string,
  tertiary?: string,
  error?: string,
) {
  const saved = loadCfg();
  const inputs: Record<Group, string> = {
    Primary: primary,
    Secondary: secondary,
    Tertiary: tertiary || saved.tertiary || DEFAULT_COLORS.tertiary,
    Error: error || saved.error || DEFAULT_COLORS.error,
  };
  const scales = {} as Record<Group, Swatch[]>;
  for (const g of GROUPS) {
    const rgb = parseHex(inputs[g]);
    if (!rgb) return null;
    scales[g] = scale(rgb);
  }
  saveCfg({
    primary: scales.Primary[NORMAL].hex,
    secondary: scales.Secondary[NORMAL].hex,
    tertiary: scales.Tertiary[NORMAL].hex,
    error: scales.Error[NORMAL].hex,
  });

  const existing = new Map(
    (await figma.getLocalPaintStylesAsync()).map(
      (x) => [x.name, x] as [string, PaintStyle],
    ),
  );

  let created = 0;
  let updated = 0;
  const maps = {} as ColorMaps;
  for (const g of GROUPS) {
    const r = await upsert(g, scales[g], existing);
    created += r.created;
    updated += r.updated;
    maps[g] = new Map(
      scales[g].map((x): [string, PaintStyle] => [
        x.name,
        x.style as PaintStyle,
      ]),
    );
  }

  return {
    scales,
    prim: scales.Primary,
    sec: scales.Secondary,
    ter: scales.Tertiary,
    err: scales.Error,
    maps,
    created,
    updated,
  };
}

export async function createColors(o: ColorOpts) {
  say("info", "Creando estilos de color...");
  const r = await ensureColorStyles(
    o.primary,
    o.secondary,
    o.tertiary,
    o.error,
  );
  if (!r) {
    say("error", "Escribe colores hex válidos, por ejemplo #e8a77b.");
    return;
  }
  say("ok", `Colores: ${r.created} creados, ${r.updated} actualizados.`);

  if (o.dashboard) {
    say("info", "Generando tablero de colores...");
    const board = await buildBoard(r.scales);
    figma.viewport.scrollAndZoomIntoView([board]);
    say("ok", "Tablero de colores generado.");
  }
}
