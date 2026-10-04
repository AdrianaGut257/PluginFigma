import { createSystem } from "./typography";
import { ensureColorStyles } from "./colors";
const say = (level, text) => figma.ui.postMessage({ type: "status", level, text });
const STATES = ["Default", "Hover", "Pressed", "Disabled"];
const TYPES = ["Filled", "Outlined"];
const ICONS = ["No Icon", "Right Icon", "Left Icon"];
const SHAPES = ["8", "Pill"];
const COLORS = ["Primary", "Secondary"];
const SPEC = {
    Web: { padX: 10, padY: 10, gap: 10, icon: 20, dot: 12, minW: 157 },
    Mobile: { padX: 10, padY: 10, gap: 10, icon: 16, dot: 10, minW: 150 },
};
const WHITE = { r: 1, g: 1, b: 1 };
const INK = { r: 0.12, g: 0.16, b: 0.21 };
const GRID_X = 96;
const GRID_Y = 24;
const PAD = 56;
const MARGIN = 100;
const solid = (c) => [{ type: "SOLID", color: c }];
const isStyle = (t) => "id" in t;
async function fillTone(n, t) {
    if (isStyle(t))
        await n.setFillStyleIdAsync(t.id);
    else
        n.fills = solid(t);
}
async function strokeTone(n, t) {
    if (isStyle(t))
        await n.setStrokeStyleIdAsync(t.id);
    else
        n.strokes = solid(t);
}
async function textStyle(platform) {
    const styles = await figma.getLocalTextStylesAsync();
    return (styles.find((s) => s.name.startsWith(`${platform}/Buttons/Button1`)) || null);
}
let fallbackCache = null;
async function fallbackFont() {
    if (fallbackCache)
        return fallbackCache;
    const all = await figma.listAvailableFontsAsync();
    const inter = all
        .filter((f) => f.fontName.family === "Inter")
        .map((f) => f.fontName);
    const compact = (v) => v.replace(/[\s\-_]/g, "").toLowerCase();
    const pick = inter.find((f) => compact(f.style) === "semibold") ||
        inter.find((f) => compact(f.style) === "bold") ||
        inter.find((f) => compact(f.style) === "regular") ||
        inter[0] ||
        all[0].fontName;
    await figma.loadFontAsync(pick);
    fallbackCache = pick;
    return pick;
}
async function makeLabel(chars, style, tone) {
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
        }
        else {
            t.fontName = await fallbackFont();
            t.fontSize = 16;
        }
        t.characters = chars;
        await fillTone(t, tone);
        frame.appendChild(t);
        return frame;
    }
    catch (e) {
        t.remove();
        frame.remove();
        throw e;
    }
}
async function makeIcon(size, dot, tone) {
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
async function makeVariant(a) {
    const spec = SPEC[a.platform];
    const T = (name) => a.tones[a.color].get(name);
    const filled = a.type === "Filled";
    let bg = null;
    let stroke = null;
    let fg = WHITE;
    if (filled) {
        if (a.state === "Default")
            bg = T("Normal");
        else if (a.state === "Hover")
            bg = T("Normal :hover");
        else if (a.state === "Pressed")
            bg = T("Normal :active");
        else {
            bg = T("Light");
            fg = T("Light :active");
        }
    }
    else if (a.state === "Default") {
        fg = T("Normal");
    }
    else if (a.state === "Hover") {
        stroke = T("Normal :hover");
        fg = T("Normal :hover");
    }
    else if (a.state === "Pressed") {
        bg = T("Normal :active");
    }
    else {
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
        c.cornerRadius = a.shape === "Pill" ? 999 : Number(a.shape);
        if (bg)
            await fillTone(c, bg);
        else
            c.fills = [];
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
    }
    catch (e) {
        c.remove();
        throw e;
    }
}
const key = (t, c, s, i, st) => `${t}|${c}|${s}|${i}|${st}`;
const go = (id, trigger) => ({
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
});
async function headText(board, chars, size, x, y, w) {
    const fn = { family: "Inter", style: "Bold" };
    await figma.loadFontAsync(fn);
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
async function buildSet(platform, o, tones, style, x) {
    const name = "Buttons";
    const legacy = `${platform}/Buttons`;
    const boardName = `${platform}/Buttons board`;
    const olds = figma.currentPage.findAll((n) => (n.type === "FRAME" && n.name === boardName) ||
        (n.type === "COMPONENT_SET" &&
            (n.name === name || n.name === legacy) &&
            n.parent === figma.currentPage));
    const first = olds[0];
    const pos = first
        ? { x: first.x, y: first.y }
        : {
            x: x !== null ? x : figma.viewport.center.x,
            y: figma.viewport.center.y,
        };
    olds.forEach((n) => n.remove());
    const cols = [];
    for (const t of TYPES)
        for (const i of ICONS)
            cols.push([t, i]);
    const rows = [];
    for (const s of SHAPES)
        for (const c of COLORS)
            for (const st of STATES)
                rows.push([s, c, st]);
    const comps = new Map();
    const grid = [];
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
    }
    catch (e) {
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
    const set = figma.combineAsVariants(grid.map((g) => g.node), figma.currentPage);
    set.name = name;
    say("info", `${platform}: propiedades ${Object.keys(set.variantGroupProperties).join(", ")}`);
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
                        if (!d || !h || !p)
                            continue;
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
export async function createButtons(o) {
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
    const boards = [];
    let nextX = null;
    for (const platform of o.platforms) {
        let style = await textStyle(platform);
        if (!style) {
            say("info", `No hay estilos tipográficos ${platform}. Los creo con la tipografía elegida...`);
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
            say("warn", `No pude crear ${platform}/Buttons/Button1. Uso Inter para el texto.`);
        say("info", `Creando botones ${platform}...`);
        const board = await buildSet(platform, o, colors.maps, style, nextX);
        nextX = board.x + board.width + 200;
        boards.push(board);
    }
    figma.viewport.scrollAndZoomIntoView(boards);
    say("ok", `Botones listos: ${boards.length} tablero(s) de 96 variantes.`);
}
