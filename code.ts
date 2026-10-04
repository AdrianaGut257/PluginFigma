import { createSystem, applyFonts, scan } from "./typography";
import { createButtons } from "./buttons";
import { createColors, sendColorCfg } from "./colors";

figma.showUI(__html__, { width: 400, height: 720, themeColors: true });

figma.ui.onmessage = async (msg: any) => {
  try {
    if (msg.type === "scan") {
      await scan();
      sendColorCfg();
    } else if (msg.type === "create") await createSystem(msg.opts);
    else if (msg.type === "apply") await applyFonts(msg.opts);
    else if (msg.type === "colors") await createColors(msg.opts);
    else if (msg.type === "buttons") await createButtons(msg.opts);
  } catch (e) {
    figma.ui.postMessage({
      type: "status",
      level: "error",
      text: `Error inesperado: ${e instanceof Error ? e.message : String(e)}`,
    });
  } finally {
    figma.ui.postMessage({ type: "done" });
  }
};
