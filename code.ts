figma.showUI(__html__, { width: 400, height: 700, themeColors: true });

type Level = "info" | "ok" | "warn" | "error";
const say = (level: Level, text: string) =>
  figma.ui.postMessage({ type: "status", level, text });

type Tok = [string, string, number, number];
const WEB: Tok[] = [
  ["H1", "Heading1", 64, 80],
  ["H2", "Heading2", 48, 60],
  ["H3", "Heading3", 32, 48],
  ["H4", "Heading4", 24, 36],
  ["H5", "Heading5", 20, 30],
  ["H6", "Heading6", 18, 28],
  ["subtitle1", "subtitle1", 16, 24],
  ["subtitle2", "subtitle2", 14, 22],
  ["body1", "body1", 16, 24],
  ["body2", "body2", 14, 22],
  ["capt", "Caption", 12, 18],
  ["button", "button", 16, 24],
];
const MOBILE_OVERRIDE: Record<string, [number, number]> = {
  H1: [40, 48],
  H2: [32, 40],
  H3: [28, 36],
  H4: [24, 32],
  H5: [20, 28],
  H6: [18, 26],
};
const MOBILE: Tok[] = WEB.map(
  ([id, l, s, h]) => [id, l, ...(MOBILE_OVERRIDE[id] || [s, h])] as Tok,
);

// ---------- Fuentes ----------
let fontsCache: Font[] | null = null;
async function allFonts(): Promise<Font[]> {
  if (!fontsCache) fontsCache = await figma.listAvailableFontsAsync();
  return fontsCache;
}
const norm = (s: string) => s.toLowerCase().replace(/[\s\-_]/g, "");
const WEIGHT_MAP: Record<string, number> = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  "": 400,
  regular: 400,
  book: 400,
  normal: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
};
function parseStyle(style: string) {
  const n = norm(style);
  const italic = /italic|oblique/.test(n);
  const base = n.replace(/italic|oblique/g, "");
  return { w: WEIGHT_MAP[base] !== undefined ? WEIGHT_MAP[base] : 400, italic };
}

async function resolveFont(family: string, styleName: string) {
  const fonts = (await allFonts()).filter(
    (f) => f.fontName.family.toLowerCase() === family.toLowerCase(),
  );
  if (!fonts.length) return null;
  const want = parseStyle(styleName);
  const score = (p: { w: number; italic: boolean }) =>
    Math.abs(p.w - want.w) + (p.italic !== want.italic ? 1000 : 0);
  const ranked = fonts
    .map((f) => ({ fn: f.fontName, p: parseStyle(f.fontName.style) }))
    .sort((a, b) => score(a.p) - score(b.p));
  for (const c of ranked) {
    try {
      await figma.loadFontAsync(c.fn);
      return {
        font: c.fn,
        exact: c.p.w === want.w && c.p.italic === want.italic,
      };
    } catch (e) {}
  }
  return null;
}

interface CreateOpts {
  platform: "Web" | "Mobile";
  group: string;
  family: string;
  weights: string[];
  dashboard: boolean;
}

async function createSystem(o: CreateOpts) {
  let family = o.family.trim() || "Inter";
  if (!(await resolveFont(family, "Regular"))) {
    say(
      "warn",
      `La fuente "${family}" no está instalada. Uso "Inter" como alternativa.`,
    );
    family = "Inter";
  }
  const toks = o.platform === "Mobile" ? MOBILE : WEB;
  const existing = new Map(
    (await figma.getLocalTextStylesAsync()).map(
      (s) => [s.name, s] as [string, TextStyle],
    ),
  );
  const styles = new Map<string, TextStyle>();
  let created = 0,
    updated = 0;

  for (const w of o.weights) {
    const r = await resolveFont(family, w);
    if (!r) {
      say("error", `No pude cargar ningún peso de "${family}". Omito ${w}.`);
      continue;
    }
    if (!r.exact)
      say("warn", `"${family}" no tiene ${w}; uso "${r.font.style}".`);
    say("info", `Creando estilos ${w}...`);
    for (const [id, , size, lh] of toks) {
      const name = `${o.platform}/${o.group}/${w}/${id}-${w.toLowerCase()}`;
      let s = existing.get(name);
      if (s) updated++;
      else {
        s = figma.createTextStyle();
        created++;
      }
      s.name = name;
      s.fontName = r.font;
      s.fontSize = size;
      s.lineHeight = { unit: "PIXELS", value: lh };
      styles.set(`${w}|${id}`, s);
    }
  }
  say("ok", `Estilos: ${created} creados, ${updated} actualizados.`);
  if (o.dashboard && styles.size) {
    say("info", "Generando dashboard...");
    await buildDashboard(o, toks, styles);
    say("ok", "Dashboard generado en el lienzo.");
  }
}

const DARK: RGB = { r: 0.12, g: 0.16, b: 0.21 };
const GRAY: RGB = { r: 0.55, g: 0.58, b: 0.65 };
const solid = (c: RGB): Paint[] => [{ type: "SOLID", color: c }];

function box(dir: "HORIZONTAL" | "VERTICAL", gap: number, width?: number) {
  const f = figma.createFrame();
  f.fills = [];
  f.layoutMode = dir;
  f.itemSpacing = gap;
  if (width) {
    f.resize(width, 10);
  }
  f.primaryAxisSizingMode = "AUTO";
  if (!width) f.counterAxisSizingMode = "AUTO";
  return f;
}
async function styled(chars: string, style: TextStyle) {
  const t = figma.createText();
  await figma.loadFontAsync(style.fontName);
  await t.setTextStyleIdAsync(style.id);
  t.characters = chars;
  t.fills = solid(DARK);
  return t;
}
async function plain(chars: string, size: number, color: RGB = GRAY) {
  const fn = { family: "Inter", style: "Regular" };
  await figma.loadFontAsync(fn);
  const t = figma.createText();
  t.fontName = fn;
  t.fontSize = size;
  t.characters = chars;
  t.fills = solid(color);
  return t;
}

async function buildDashboard(
  o: CreateOpts,
  toks: Tok[],
  styles: Map<string, TextStyle>,
) {
  const title = `${o.platform.toUpperCase()}/TYPOGRAPHY`;
  const old = figma.currentPage.findChild(
    (n) => n.type === "FRAME" && n.name === title,
  );
  const pos = old
    ? { x: old.x, y: old.y }
    : { x: figma.viewport.center.x, y: figma.viewport.center.y };
  if (old) old.remove();

  const any = Array.from(styles.values())[0];
  const pick = (w: string, id: string) => styles.get(`${w}|${id}`) || any;
  const boldest = o.weights[o.weights.length - 1];
  const W = 340;

  const root = figma.createFrame();
  root.name = title;
  root.layoutMode = "VERTICAL";
  root.resize(1600, 100);
  root.primaryAxisSizingMode = "AUTO";
  root.paddingLeft = root.paddingRight = 100;
  root.paddingTop = root.paddingBottom = 80;
  root.itemSpacing = 48;
  root.fills = solid({ r: 1, g: 1, b: 1 });

  root.appendChild(await styled(title, pick(boldest, "H3")));

  // Alfabeto + "Aa"
  const top = box("HORIZONTAL", 48);
  const alpha = box("VERTICAL", 8);
  alpha.appendChild(await plain("Alphabet", 20, { r: 0, g: 0.68, b: 0.3 }));
  alpha.appendChild(
    await plain(
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n1234567890",
      14,
      DARK,
    ),
  );
  top.appendChild(alpha);
  for (const w of o.weights) {
    const c = box("VERTICAL", 4);
    c.appendChild(await styled("Aa", pick(w, "H1")));
    c.appendChild(await plain(w, 12));
    top.appendChild(c);
  }
  root.appendChild(top);

  const specs = (size: number) =>
    `${size}px / ${o.weights.map((w) => w.toLowerCase()).join(" / ")}`;
  async function section(name: string, list: Tok[]) {
    root.appendChild(await styled(name, pick(boldest, "H2")));
    for (const [id, label, size] of list) {
      const row = box("HORIZONTAL", 24);
      for (let i = 0; i < o.weights.length; i++) {
        const cell = box("VERTICAL", 8, W);
        cell.appendChild(await styled(label, pick(o.weights[i], id)));
        if (i === 0) cell.appendChild(await plain(specs(size), 12));
        row.appendChild(cell);
      }
      root.appendChild(row);
    }
  }
  await section(
    "Container",
    toks.filter((t) => t[0] !== "button"),
  );
  await section(
    "Buttons",
    toks.filter((t) => t[0] === "button"),
  );

  root.x = pos.x;
  root.y = pos.y;
  figma.currentPage.appendChild(root);
  figma.viewport.scrollAndZoomIntoView([root]);
}

// ---------- MODO 2: cambio masivo ----------
async function scan() {
  const styles = await figma.getLocalTextStylesAsync();
  const families: Record<string, number> = {};
  styles.forEach((s) => {
    families[s.fontName.family] = (families[s.fontName.family] || 0) + 1;
  });
  const installed = Array.from(
    new Set((await allFonts()).map((f) => f.fontName.family)),
  ).sort();
  figma.ui.postMessage({
    type: "scan-result",
    families,
    installed,
    total: styles.length,
  });
}

async function applyFont(target: string, scope: string) {
  target = target.trim();
  if (!target) {
    say("error", "Escribe la fuente de destino.");
    return;
  }
  if (!(await resolveFont(target, "Regular"))) {
    say(
      "error",
      `"${target}" no está instalada o no existe. No se modificó ningún estilo.`,
    );
    return;
  }
  const styles = (await figma.getLocalTextStylesAsync()).filter(
    (s) => !scope || s.name.startsWith(scope),
  );
  if (!styles.length) {
    say("warn", "No hay estilos que coincidan con el filtro.");
    return;
  }

  let ok = 0,
    same = 0,
    fb = 0,
    fail = 0;
  for (let i = 0; i < styles.length; i++) {
    const s = styles[i];
    try {
      const r = await resolveFont(target, s.fontName.style);
      if (!r) {
        fail++;
        say("error", `${s.name}: sin fuente disponible, sin cambios.`);
        continue;
      }
      if (!r.exact) {
        fb++;
        say(
          "warn",
          `${s.name}: "${target}" no tiene "${s.fontName.style}", uso "${r.font.style}".`,
        );
      }
      if (
        s.fontName.family === r.font.family &&
        s.fontName.style === r.font.style
      ) {
        same++;
        continue;
      }
      s.fontName = r.font;
      ok++;
    } catch (e) {
      fail++;
      say("error", `${s.name}: ${(e as Error).message}`);
    }
    if (i % 10 === 0) say("info", `Procesando ${i + 1}/${styles.length}...`);
  }
  say(
    fail ? "warn" : "ok",
    `Listo: ${ok} actualizados, ${same} ya estaban, ${fb} con peso alternativo, ${fail} con error.`,
  );
  await scan();
}

figma.ui.onmessage = async (msg: any) => {
  try {
    if (msg.type === "scan") await scan();
    else if (msg.type === "create") await createSystem(msg.opts);
    else if (msg.type === "apply") await applyFont(msg.target, msg.scope || "");
  } catch (e) {
    say("error", `Error inesperado: ${(e as Error).message}`);
  } finally {
    figma.ui.postMessage({ type: "done" });
  }
};
