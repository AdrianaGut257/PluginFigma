type Level = "info" | "ok" | "warn" | "error";
const say = (level: Level, text: string) =>
  figma.ui.postMessage({ type: "status", level, text });

export interface ColorOpts {
  primary: string;
  secondary: string;
  dashboard: boolean;
}

type Rgb8 = [number, number, number];

interface Swatch {
  name: string;
  c: Rgb8;
  hex: string;
  style?: PaintStyle;
}

const STEPS: { name: string; mode: "tint" | "shade" | "base"; f: number }[] = [
  { name: "Clear", mode: "tint", f: 0.9 },
  { name: "Light", mode: "tint", f: 0.59 },
  { name: "Light :hover", mode: "tint", f: 0.42 },
  { name: "Light :active", mode: "tint", f: 0.17 },
  { name: "Normal", mode: "base", f: 0 },
  { name: "Normal :hover", mode: "shade", f: 0.7 },
  { name: "Normal :active", mode: "shade", f: 0.61 },
  { name: "Dark", mode: "shade", f: 0.45 },
];

const BLACK: RGB = { r: 0, g: 0, b: 0 };
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
    chip.resize(318, 110);
    chip.cornerRadius = 20;
    chip.clipsContent = false;
    chip.fills = solid(toRgb(s.c));
    chip.strokes = solid(BORDER);
    chip.strokeWeight = 2;
    chip.strokeAlign = "INSIDE";
    if (s.style) await chip.setFillStyleIdAsync(s.style.id);

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

async function buildBoard(prim: Swatch[], sec: Swatch[]) {
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
  root.fills = solid({ r: 1, g: 1, b: 1 });
  root.appendChild(await column("Primary", prim));
  root.appendChild(await column("Secondary", sec));
  root.x = pos.x;
  root.y = pos.y;
  figma.currentPage.appendChild(root);
  return root;
}

export type ColorMaps = Record<
  "Primary" | "Secondary",
  Map<string, PaintStyle>
>;

export async function ensureColorStyles(primary: string, secondary: string) {
  const p = parseHex(primary);
  const s = parseHex(secondary);
  if (!p || !s) return null;
  const prim = scale(p);
  const sec = scale(s);
  saveCfg({ primary: prim[4].hex, secondary: sec[4].hex });

  const existing = new Map(
    (await figma.getLocalPaintStylesAsync()).map(
      (x) => [x.name, x] as [string, PaintStyle],
    ),
  );
  const a = await upsert("Primary", prim, existing);
  const b = await upsert("Secondary", sec, existing);

  const maps: ColorMaps = { Primary: new Map(), Secondary: new Map() };
  prim.forEach((x) => maps.Primary.set(x.name, x.style as PaintStyle));
  sec.forEach((x) => maps.Secondary.set(x.name, x.style as PaintStyle));
  return {
    prim,
    sec,
    maps,
    created: a.created + b.created,
    updated: a.updated + b.updated,
  };
}

export async function createColors(o: ColorOpts) {
  say("info", "Creando estilos de color...");
  const r = await ensureColorStyles(o.primary, o.secondary);
  if (!r) {
    say("error", "Escribe colores hex válidos, por ejemplo #e8a77b.");
    return;
  }
  say("ok", `Colores: ${r.created} creados, ${r.updated} actualizados.`);

  if (o.dashboard) {
    say("info", "Generando tablero de colores...");
    const board = await buildBoard(r.prim, r.sec);
    figma.viewport.scrollAndZoomIntoView([board]);
    say("ok", "Tablero de colores generado.");
  }
}
