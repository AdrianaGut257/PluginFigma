const say = (level, text) => figma.ui.postMessage({ type: "status", level, text });
const T = (id, label, g, w, size, lh, ls, d) => ({ id, label, g, w, size, lh, ls, d });
const WEB = [
    T("H1", "Heading1", "Primary", "Bold", 64, 72, -0.5, "Títulos principales de la pantalla"),
    T("H2", "Heading2", "Primary", "Bold", 48, 56, 0, "Títulos de secciones principales"),
    T("H3", "Heading3", "Primary", "Bold", 36, 44, 0, "Títulos de secciones secundarias"),
    T("H4", "Heading4", "Primary", "SemiBold", 28, 36, 0, "Encabezados pequeños o elementos destacados"),
    T("Subtitle1", "Subtitle1", "Primary", "SemiBold", 18, 26, 0, "Subtítulos y textos de apoyo destacados"),
    T("Body1", "Body1", "Secondary", "Regular", 20, 28, -1, "Texto principal y contenido informativo"),
    T("Body2", "Body2", "Secondary", "Regular", 16, 24, 0, "Texto secundario y descripciones"),
    T("Body3", "Body3", "Secondary", "Medium", 14, 18, 0, "Texto auxiliar y elementos de interfaz pequeños"),
    T("Caption1", "Caption 1", "Secondary", "SemiBold", 12, 16, -0.3, "Información secundaria, etiquetas o metadatos destacados"),
    T("Caption2", "Caption 2", "Secondary", "Regular", 12, 16, -0.3, "Información auxiliar de menor prioridad"),
    T("Button1", "Button 1", "Buttons", "SemiBold", 16, 24, -0.3, "Acciones principales y botones destacados"),
    T("Button2", "Button 2", "Buttons", "SemiBold", 14, 20, -0.3, "Acciones secundarias o botones pequeños"),
];
const MOB = {
    H1: [36, 38],
    H2: [24, 30],
    H3: [20, 26],
    H4: [18, 20],
    Subtitle1: [16, 20],
    Body1: [18, 24],
    Body2: [16, 21],
    Button2: [14, 16],
};
const MOBILE = WEB.map((t) => MOB[t.id] ? { ...t, size: MOB[t.id][0], lh: MOB[t.id][1] } : t);
let fontsCache = null;
async function allFonts() {
    if (!fontsCache)
        fontsCache = await figma.listAvailableFontsAsync();
    return fontsCache;
}
const norm = (s) => s.toLowerCase().replace(/[\s\-_]/g, "");
const WMAP = {
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
function parseStyle(style) {
    const n = norm(style);
    const italic = /italic|oblique/.test(n);
    const base = n.replace(/italic|oblique/g, "");
    return { w: WMAP[base] !== undefined ? WMAP[base] : 400, italic };
}
async function resolveFont(family, styleName) {
    const fonts = (await allFonts()).filter((f) => f.fontName.family.toLowerCase() === family.toLowerCase());
    if (!fonts.length)
        return null;
    const want = parseStyle(styleName);
    const score = (p) => Math.abs(p.w - want.w) + (p.italic !== want.italic ? 1000 : 0);
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
        }
        catch (e) { }
    }
    return null;
}
const saveCfg = (c) => figma.root.setPluginData("typoCfg", JSON.stringify(c));
const loadCfg = () => {
    try {
        return JSON.parse(figma.root.getPluginData("typoCfg") || "{}");
    }
    catch (e) {
        return {};
    }
};
async function safeFamily(f, label) {
    let fam = f.trim() || "Inter";
    if (!(await resolveFont(fam, "Regular"))) {
        say("warn", `Fuente ${label} "${fam}" no instalada. Uso "Inter" como alternativa.`);
        fam = "Inter";
    }
    return fam;
}
export async function createSystem(o) {
    if (!o.platforms.length) {
        say("error", "Elige al menos una plataforma.");
        return;
    }
    const pf = await safeFamily(o.primary, "primaria");
    const sf = await safeFamily(o.secondary, "secundaria");
    const fam = {
        Primary: pf,
        Secondary: sf,
        Buttons: o.buttonsUse === "Secondary" ? sf : pf,
    };
    saveCfg({ primary: pf, secondary: sf, buttonsUse: o.buttonsUse });
    const existing = new Map((await figma.getLocalTextStylesAsync()).map((s) => [s.name, s]));
    const cache = new Map();
    const frames = [];
    let created = 0, updated = 0, nextX = null;
    for (const platform of o.platforms) {
        const toks = platform === "Mobile" ? MOBILE : WEB;
        const styles = new Map();
        say("info", `Creando estilos ${platform}...`);
        for (const t of toks) {
            const w = t.w;
            const key = `${fam[t.g]}|${w}`;
            if (!cache.has(key)) {
                const r = await resolveFont(fam[t.g], w);
                if (r && !r.exact)
                    say("warn", `"${fam[t.g]}" no tiene ${w}; uso "${r.font.style}".`);
                if (!r)
                    say("error", `No pude cargar "${fam[t.g]}" ${w}. Omito esos estilos.`);
                cache.set(key, r);
            }
            const r = cache.get(key);
            if (!r)
                continue;
            const name = `${platform}/${t.g}/${t.id}-${w.toLowerCase()}`;
            let s = existing.get(name);
            if (s)
                updated++;
            else {
                s = figma.createTextStyle();
                created++;
                existing.set(name, s);
            }
            s.name = name;
            s.fontName = r.font;
            s.fontSize = t.size;
            s.lineHeight = { unit: "PIXELS", value: t.lh };
            s.letterSpacing = { unit: "PIXELS", value: t.ls };
            styles.set(`${w}|${t.id}`, s);
        }
        if (o.dashboard && styles.size) {
            say("info", `Generando dashboard ${platform}...`);
            const f = await buildDashboard(platform, toks, styles, nextX);
            nextX = f.x + f.width + 200;
            frames.push(f);
        }
    }
    say("ok", `Estilos: ${created} creados, ${updated} actualizados.`);
    if (frames.length) {
        figma.viewport.scrollAndZoomIntoView(frames);
        say("ok", "Dashboard(s) generado(s).");
    }
    await scan();
}
const DARK = { r: 0.12, g: 0.16, b: 0.21 };
const GRAY = { r: 0.55, g: 0.6, b: 0.68 };
const solid = (c) => [{ type: "SOLID", color: c }];
const CW = 1600;
const COLS = [400, 240, 200, 240, 240, 280];
function fbox(dir, gap, width) {
    const f = figma.createFrame();
    f.fills = [];
    f.clipsContent = false;
    f.layoutMode = dir;
    f.itemSpacing = gap;
    if (width) {
        f.resize(width, 10);
        if (dir === "HORIZONTAL") {
            f.primaryAxisSizingMode = "FIXED";
            f.counterAxisSizingMode = "AUTO";
        }
        else {
            f.primaryAxisSizingMode = "AUTO";
            f.counterAxisSizingMode = "FIXED";
        }
    }
    else {
        f.primaryAxisSizingMode = "AUTO";
        f.counterAxisSizingMode = "AUTO";
    }
    return f;
}
async function styled(chars, style) {
    const t = figma.createText();
    await figma.loadFontAsync(style.fontName);
    await t.setTextStyleIdAsync(style.id);
    t.characters = chars;
    t.fills = solid(DARK);
    return t;
}
async function plain(chars, size, color, wrap = false) {
    const fn = { family: "Inter", style: "Regular" };
    await figma.loadFontAsync(fn);
    const t = figma.createText();
    t.fontName = fn;
    t.fontSize = size;
    t.characters = chars;
    t.fills = solid(color);
    if (wrap) {
        t.layoutAlign = "STRETCH";
        t.textAutoResize = "HEIGHT";
    }
    return t;
}
async function gummy(chars, size, weight, color) {
    const r = await resolveFont("Sour Gummy", weight);
    const fn = r ? r.font : { family: "Inter", style: "Regular" };
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
function line() {
    const r = figma.createRectangle();
    r.resize(CW, 1);
    r.fills = solid(DARK);
    r.layoutAlign = "STRETCH";
    return r;
}
async function buildDashboard(platform, toks, styles, x) {
    const weights = ["Regular", "Medium", "SemiBold", "Bold"];
    const title = `${platform.toUpperCase()}/TYPOGRAPHY`;
    const old = figma.currentPage.findChild((n) => n.type === "FRAME" && n.name === title);
    const pos = old
        ? { x: old.x, y: old.y }
        : {
            x: x !== null ? x : figma.viewport.center.x,
            y: figma.viewport.center.y,
        };
    if (old)
        old.remove();
    const pick = (w, id) => styles.get(`${w}|${id}`) ||
        weights
            .map((k) => styles.get(`${k}|${id}`))
            .filter(Boolean)[0];
    const bold = weights.indexOf("Bold") >= 0 ? "Bold" : weights[weights.length - 1];
    const root = figma.createFrame();
    root.name = title;
    root.layoutMode = "VERTICAL";
    root.resize(CW + 200, 100);
    root.primaryAxisSizingMode = "AUTO";
    root.paddingLeft = root.paddingRight = 100;
    root.paddingTop = root.paddingBottom = 80;
    root.itemSpacing = 32;
    root.fills = solid({ r: 1, g: 1, b: 1 });
    const ttl = await gummy(title, pick(bold, "H3").fontSize, "Bold", DARK);
    ttl.layoutAlign = "STRETCH";
    ttl.textAlignHorizontal = "CENTER";
    ttl.textAutoResize = "HEIGHT";
    root.appendChild(ttl);
    const aaRow = fbox("HORIZONTAL", 32, CW);
    aaRow.primaryAxisAlignItems = "MAX";
    for (const w of weights) {
        const c = fbox("VERTICAL", 4);
        c.counterAxisAlignItems = "CENTER";
        c.appendChild(await gummy("Aa", 64, w, DARK));
        c.appendChild(await gummy(w === "SemiBold" ? "Semibold" : w, 16, "Regular", GRAY));
        aaRow.appendChild(c);
    }
    root.appendChild(aaRow);
    for (const g of ["Primary", "Secondary", "Buttons"]) {
        root.appendChild(line());
        root.appendChild(await gummy(g, pick(bold, "H2").fontSize, "Bold", DARK));
        const head = fbox("HORIZONTAL", 0, CW);
        const heads = [
            "Scale",
            "Weight",
            "Size",
            "Line-Height",
            "Letter spacing",
            "Description",
        ];
        for (let i = 0; i < heads.length; i++) {
            const c = fbox("VERTICAL", 0, COLS[i]);
            c.appendChild(await plain(heads[i], 20, GRAY));
            head.appendChild(c);
        }
        root.appendChild(head);
        for (const t of toks.filter((k) => k.g === g)) {
            const row = fbox("HORIZONTAL", 0, CW);
            row.counterAxisAlignItems = "CENTER";
            row.paddingTop = row.paddingBottom = 12;
            const vals = [
                null,
                t.w === "SemiBold" ? "Semibold" : t.w,
                `${t.size}px`,
                `${t.lh}px`,
                `${t.ls}px`,
                t.d,
            ];
            for (let i = 0; i < vals.length; i++) {
                const c = fbox("VERTICAL", 0, COLS[i]);
                c.appendChild(vals[i] === null
                    ? await styled(t.label, pick(t.w, t.id))
                    : await plain(vals[i], 18, DARK, i === 5));
                row.appendChild(c);
            }
            root.appendChild(row);
        }
    }
    root.x = pos.x;
    root.y = pos.y;
    figma.currentPage.appendChild(root);
    return root;
}
export async function scan() {
    const styles = await figma.getLocalTextStylesAsync();
    const byGroup = {};
    styles.forEach((s) => {
        const g = s.name.split("/")[1] || "(sin grupo)";
        byGroup[g] = byGroup[g] || [];
        if (byGroup[g].indexOf(s.fontName.family) < 0)
            byGroup[g].push(s.fontName.family);
    });
    const installed = Array.from(new Set((await allFonts()).map((f) => f.fontName.family))).sort();
    figma.ui.postMessage({
        type: "scan-result",
        byGroup,
        installed,
        total: styles.length,
        saved: loadCfg(),
    });
}
export async function applyFonts(o) {
    const primary = o.primary.trim(), secondary = o.secondary.trim();
    if (!primary && !secondary) {
        say("error", "Escribe al menos una fuente (primaria o secundaria).");
        return;
    }
    for (const [label, f] of [
        ["primaria", primary],
        ["secundaria", secondary],
    ]) {
        if (f && !(await resolveFont(f, "Regular"))) {
            say("error", `La fuente ${label} "${f}" no está instalada o no existe. No se modificó ningún estilo.`);
            return;
        }
    }
    const targetFor = (g) => g === "Primary"
        ? primary
        : g === "Secondary"
            ? secondary
            : g === "Buttons"
                ? o.buttonsUse === "Secondary"
                    ? secondary
                    : primary
                : "";
    const styles = (await figma.getLocalTextStylesAsync()).filter((s) => !o.scope || s.name.startsWith(o.scope + "/"));
    if (!styles.length) {
        say("warn", "No hay estilos que coincidan.");
        return;
    }
    let ok = 0, same = 0, fb = 0, fail = 0, skipped = 0;
    for (let i = 0; i < styles.length; i++) {
        const s = styles[i];
        const target = targetFor(s.name.split("/")[1] || "");
        if (!target) {
            skipped++;
            continue;
        }
        try {
            const r = await resolveFont(target, s.fontName.style);
            if (!r) {
                fail++;
                say("error", `${s.name}: sin fuente disponible, sin cambios.`);
                continue;
            }
            if (!r.exact) {
                fb++;
                say("warn", `${s.name}: "${target}" no tiene "${s.fontName.style}", uso "${r.font.style}".`);
            }
            if (s.fontName.family === r.font.family &&
                s.fontName.style === r.font.style) {
                same++;
                continue;
            }
            s.fontName = r.font;
            ok++;
        }
        catch (e) {
            fail++;
            say("error", `${s.name}: ${e.message}`);
        }
        if (i % 10 === 0)
            say("info", `Procesando ${i + 1}/${styles.length}...`);
    }
    const cfg = loadCfg();
    saveCfg({
        primary: primary || cfg.primary,
        secondary: secondary || cfg.secondary,
        buttonsUse: o.buttonsUse,
    });
    say(fail ? "warn" : "ok", `Listo: ${ok} actualizados, ${same} ya estaban, ${fb} con peso alternativo, ${skipped} sin tocar, ${fail} con error.`);
    await scan();
}
