import { createSystem } from "./typography";
import { ensureColorStyles, ColorMaps } from "./colors";

type Level = "info" | "ok" | "warn" | "error";
const say = (level: Level, text: string) =>
  figma.ui.postMessage({ type: "status", level, text });

export interface ButtonOpts {
  platforms: ("Web" | "Mobile")[];
  primary: string;
  secondary: string;
  label: string;
  proto: boolean;
  typo: {
    primary: string;
    secondary: string;
    buttonsUse: "Primary" | "Secondary";
  };
}

type Platform = "Web" | "Mobile";
type St = "Default" | "Hover" | "Pressed" | "Disabled";
type Col = "Primary" | "Secondary";
type Tone = PaintStyle | RGB;

const STATES: St[] = ["Default", "Hover", "Pressed", "Disabled"];
const TYPES = ["Filled", "Outlined"];
const ICONS = ["No Icon", "Right Icon", "Left Icon"];
const SHAPES = ["8", "32"];
const COLORS: Col[] = ["Primary", "Secondary"];

const SPEC: Record<
  Platform,
  {
    padX: number;
    padY: number;
    gap: number;
    icon: number;
    dot: number;
    minW: number;
  }
> = {
  Web: { padX: 10, padY: 10, gap: 10, icon: 20, dot: 12, minW: 157 },
  Mobile: { padX: 10, padY: 10, gap: 10, icon: 16, dot: 10, minW: 150 },
};

const WHITE: RGB = { r: 1, g: 1, b: 1 };
const INK: RGB = { r: 0.12, g: 0.16, b: 0.21 };
const GRID_X = 96;
const GRID_Y = 24;
const PAD = 56;
const MARGIN = 100;

const solid = (c: RGB): Paint[] => [{ type: "SOLID", color: c }];
const isStyle = (t: Tone): t is PaintStyle => "id" in t;

async function fillTone(n: MinimalFillsMixin, t: Tone) {
  if (isStyle(t)) await n.setFillStyleIdAsync(t.id);
  else n.fills = solid(t);
}

async function strokeTone(n: MinimalStrokesMixin, t: Tone) {
  if (isStyle(t)) await n.setStrokeStyleIdAsync(t.id);
  else n.strokes = solid(t);
}

async function textStyle(platform: Platform) {
  const styles = await figma.getLocalTextStylesAsync();
  return (
    styles.find((s) => s.name.startsWith(`${platform}/Buttons/Button1`)) || null
  );
}

let fallbackCache: FontName | null = null;
async function fallbackFont(): Promise<FontName> {
  if (fallbackCache) return fallbackCache;
  const all = await figma.listAvailableFontsAsync();
  const inter = all
    .filter((f) => f.fontName.family === "Inter")
    .map((f) => f.fontName);
  const compact = (v: string) => v.replace(/[\s\-_]/g, "").toLowerCase();
  const pick =
    inter.find((f) => compact(f.style) === "semibold") ||
    inter.find((f) => compact(f.style) === "bold") ||
    inter.find((f) => compact(f.style) === "regular") ||
    inter[0] ||
    all[0].fontName;
  await figma.loadFontAsync(pick);
  fallbackCache = pick;
  return pick;
}

let fontListCache: Font[] | null = null;
const compactName = (v: string) => v.replace(/[\s\-_]/g, "").toLowerCase();

async function gummyFont(weight: string): Promise<FontName> {
  if (!fontListCache) fontListCache = await figma.listAvailableFontsAsync();
  const fam = fontListCache.filter((f) => f.fontName.family === "Sour Gummy");
  const hit =
    fam.find((f) => compactName(f.fontName.style) === compactName(weight)) ||
    fam.find((f) => compactName(f.fontName.style) === "regular") ||
    fam[0];
  const fn = hit ? hit.fontName : await fallbackFont();
  await figma.loadFontAsync(fn);
  return fn;
}

async function makeLabel(chars: string, style: TextStyle | null, tone: Tone) {
  const frame = figma.createFrame();
  frame.name = "Label";
  frame.fills = [];
  frame.clipsContent = false;
  frame.layoutMode = "HORIZONTAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "AUTO";
  frame.primaryAxisAlignItems = "CENTER";
  frame.counterAxisAlignItems = "CENTER";

  const t = figma.createText();
  t.name = "Text";
  try {
    if (style) {
      await figma.loadFontAsync(style.fontName);
      await t.setTextStyleIdAsync(style.id);
    } else {
      t.fontName = await fallbackFont();
      t.fontSize = 16;
    }
    t.characters = chars;
    await fillTone(t, tone);
    frame.appendChild(t);
    return frame;
  } catch (e) {
    t.remove();
    frame.remove();
    throw e;
  }
}

async function makeIcon(size: number, dot: number, tone: Tone) {
  const f = figma.createFrame();
  f.name = "Icon";
  f.fills = [];
  f.clipsContent = false;
  f.layoutMode = "HORIZONTAL";
  f.primaryAxisSizingMode = "FIXED";
  f.counterAxisSizingMode = "FIXED";
  f.primaryAxisAlignItems = "CENTER";
  f.counterAxisAlignItems = "CENTER";
  f.resize(size, size);
  const e = figma.createEllipse();
  e.name = "Dot";
  e.resize(dot, dot);
  await fillTone(e, tone);
  f.appendChild(e);
  return f;
}

interface VariantArgs {
  platform: Platform;
  style: TextStyle | null;
  text: string;
  type: string;
  color: Col;
  shape: string;
  icon: string;
  state: St;
  tones: ColorMaps;
}

async function makeVariant(a: VariantArgs) {
  const spec = SPEC[a.platform];
  const T = (name: string): Tone => a.tones[a.color].get(name) as PaintStyle;
  const filled = a.type === "Filled";

  let bg: Tone | null = null;
  let stroke: Tone | null = null;
  let fg: Tone = WHITE;

  if (filled) {
    if (a.state === "Default") bg = T("Normal");
    else if (a.state === "Hover") bg = T("Normal :hover");
    else if (a.state === "Pressed") bg = T("Normal :active");
    else {
      bg = T("Light");
      fg = T("Light :active");
    }
  } else if (a.state === "Default") {
    fg = T("Normal");
  } else if (a.state === "Hover") {
    stroke = T("Normal :hover");
    fg = T("Normal :hover");
  } else if (a.state === "Pressed") {
    bg = T("Normal :active");
  } else {
    stroke = T("Light :active");
    fg = T("Light :active");
  }

  const c = figma.createComponent();
  try {
    c.name = `Type=${a.color}, State=${a.state}, Icon=${a.icon}, Style=${a.type}, Border Radius=${a.shape}`;
    c.layoutMode = "HORIZONTAL";
    c.primaryAxisSizingMode = "AUTO";
    c.counterAxisSizingMode = "AUTO";
    c.primaryAxisAlignItems = "CENTER";
    c.counterAxisAlignItems = "CENTER";
    c.itemSpacing = spec.gap;
    c.paddingLeft = c.paddingRight = spec.padX;
    c.paddingTop = c.paddingBottom = spec.padY;
    c.minWidth = spec.minW;
    c.clipsContent = false;
    c.cornerRadius = a.shape === "Pill" ? 32 : Number(a.shape);
    if (bg) await fillTone(c, bg);
    else c.fills = [];
    if (stroke) {
      await strokeTone(c, stroke);
      c.strokeWeight = 1;
      c.strokeAlign = "INSIDE";
    }

    const label = await makeLabel(a.text, a.style, fg);
    if (a.icon === "Left Icon")
      c.appendChild(await makeIcon(spec.icon, spec.dot, fg));
    c.appendChild(label);
    if (a.icon === "Right Icon")
      c.appendChild(await makeIcon(spec.icon, spec.dot, fg));
    return c;
  } catch (e) {
    c.remove();
    throw e;
  }
}

const key = (t: string, c: string, s: string, i: string, st: string) =>
  `${t}|${c}|${s}|${i}|${st}`;

const go = (id: string, trigger: "ON_HOVER" | "ON_PRESS"): Reaction =>
  ({
    trigger: { type: trigger },
    actions: [
      {
        type: "NODE",
        destinationId: id,
        navigation: "CHANGE_TO",
        transition: {
          type: "SMART_ANIMATE",
          easing: { type: "EASE_OUT" },
          duration: 0.2,
        },
        preserveScrollPosition: false,
      },
    ],
  }) as Reaction;

async function headText(
  board: FrameNode,
  chars: string,
  size: number,
  x: number,
  y: number,
  w: number,
) {
  const fn = await gummyFont("Bold");
  const t = figma.createText();
  t.fontName = fn;
  t.fontSize = size;
  t.characters = chars;
  t.textAlignHorizontal = "CENTER";
  t.textAutoResize = "HEIGHT";
  t.resize(w, t.height);
  t.fills = solid(INK);
  t.x = x;
  t.y = y;
  board.appendChild(t);
}

async function buildSet(
  platform: Platform,
  o: ButtonOpts,
  tones: ColorMaps,
  style: TextStyle | null,
  x: number | null,
) {
  const name = "Buttons";
  const legacy = `${platform}/Buttons`;
  const boardName = `${platform}/Buttons board`;
  const olds = figma.currentPage.findAll(
    (n) =>
      (n.type === "FRAME" && n.name === boardName) ||
      (n.type === "COMPONENT_SET" &&
        (n.name === name || n.name === legacy) &&
        n.parent === figma.currentPage),
  );
  const first = olds[0];
  const pos = first
    ? { x: first.x, y: first.y }
    : {
        x: x !== null ? x : figma.viewport.center.x,
        y: figma.viewport.center.y,
      };
  olds.forEach((n) => n.remove());

  const cols: [string, string][] = [];
  for (const t of TYPES) for (const i of ICONS) cols.push([t, i]);
  const rows: [string, Col, St][] = [];
  for (const s of SHAPES)
    for (const c of COLORS) for (const st of STATES) rows.push([s, c, st]);

  const comps = new Map<string, ComponentNode>();
  const grid: { node: ComponentNode; col: number; row: number }[] = [];

  try {
    for (let r = 0; r < rows.length; r++) {
      const [shape, color, state] = rows[r];
      for (let c = 0; c < cols.length; c++) {
        const [type, icon] = cols[c];
        const node = await makeVariant({
          platform,
          style,
          text: o.label.trim() || state,
          type,
          color,
          shape,
          icon,
          state,
          tones,
        });
        comps.set(key(type, color, shape, icon, state), node);
        grid.push({ node, col: c, row: r });
      }
      if (r % 4 === 3)
        say("info", `${platform}: ${r + 1}/${rows.length} filas`);
    }
  } catch (e) {
    grid.forEach((g) => g.node.remove());
    throw e;
  }

  let maxW = 0;
  let maxH = 0;
  for (const g of grid) {
    maxW = Math.max(maxW, g.node.width);
    maxH = Math.max(maxH, g.node.height);
  }
  for (const g of grid) {
    g.node.x = g.col * (maxW + GRID_X);
    g.node.y = g.row * (maxH + GRID_Y);
  }

  const set = figma.combineAsVariants(
    grid.map((g) => g.node),
    figma.currentPage,
  );
  set.name = name;
  say(
    "info",
    `${platform}: propiedades ${Object.keys(set.variantGroupProperties).join(", ")}`,
  );
  set.fills = solid({ r: 0.93, g: 0.93, b: 0.93 });

  const gridW = cols.length * maxW + (cols.length - 1) * GRID_X;
  const gridH = rows.length * maxH + (rows.length - 1) * GRID_Y;
  for (const ch of set.children) {
    ch.x += PAD;
    ch.y += PAD;
  }
  const setW = gridW + PAD * 2;
  const setH = gridH + PAD * 2;
  set.resizeWithoutConstraints(setW, setH);

  if (o.proto) {
    say("info", `Conectando prototype ${platform}...`);
    for (const t of TYPES)
      for (const i of ICONS)
        for (const s of SHAPES)
          for (const c of COLORS) {
            const d = comps.get(key(t, c, s, i, "Default"));
            const h = comps.get(key(t, c, s, i, "Hover"));
            const p = comps.get(key(t, c, s, i, "Pressed"));
            if (!d || !h || !p) continue;
            await d.setReactionsAsync([
              go(h.id, "ON_HOVER"),
              go(p.id, "ON_PRESS"),
            ]);
            await h.setReactionsAsync([go(p.id, "ON_PRESS")]);
          }
  }

  const HEAD = 300;
  const board = figma.createFrame();
  board.name = boardName;
  board.fills = solid(WHITE);
  board.clipsContent = false;
  board.resize(setW + MARGIN * 2, HEAD + setH + MARGIN);
  board.x = pos.x;
  board.y = pos.y;

  await headText(board, platform.toUpperCase(), 48, 0, 40, board.width);
  const groupW = 3 * maxW + 2 * GRID_X;
  for (let t = 0; t < TYPES.length; t++) {
    const gx = MARGIN + PAD + t * 3 * (maxW + GRID_X);
    await headText(board, TYPES[t].toUpperCase(), 32, gx, 140, groupW);
  }
  for (let c = 0; c < cols.length; c++) {
    const cx = MARGIN + PAD + c * (maxW + GRID_X);
    await headText(board, cols[c][1], 22, cx, 220, maxW);
  }

  board.appendChild(set);
  set.x = MARGIN;
  set.y = HEAD;
  return board;
}

export async function createButtons(o: ButtonOpts) {
  if (!o.platforms.length) {
    say("error", "Elige al menos una plataforma.");
    return;
  }

  say("info", "Aplicando colores de la paleta...");
  const colors = await ensureColorStyles(o.primary, o.secondary);
  if (!colors) {
    say("error", "Colores no válidos. Revisa la pestaña Colores.");
    return;
  }

  const boards: FrameNode[] = [];
  let nextX: number | null = null;

  for (const platform of o.platforms) {
    let style = await textStyle(platform);
    if (!style) {
      say(
        "info",
        `No hay estilos tipográficos ${platform}. Los creo con la tipografía elegida...`,
      );
      await createSystem({
        platforms: [platform],
        primary: o.typo.primary,
        secondary: o.typo.secondary,
        buttonsUse: o.typo.buttonsUse,
        dashboard: false,
      });
      style = await textStyle(platform);
    }
    if (!style)
      say(
        "warn",
        `No pude crear ${platform}/Buttons/Button1. Uso Inter para el texto.`,
      );

    say("info", `Creando botones ${platform}...`);
    const board = await buildSet(platform, o, colors.maps, style, nextX);
    nextX = board.x + board.width + 200;
    boards.push(board);
  }

  figma.viewport.scrollAndZoomIntoView(boards);
  say("ok", `Botones listos: ${boards.length} tablero(s) de 96 variantes.`);
}
