import gradient from "gradient-string";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function cleanTitle(rawTitle) {
  return rawTitle
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n");
}

export function printTitle(i18n) {
  // assets are up one level from src, then in assets
  const titlePath = path.join(__dirname, "..", "assets", "title.txt");

  if (fs.existsSync(titlePath)) {
    let title = fs.readFileSync(titlePath, "utf-8");
    title = cleanTitle(title);

    // Check width
    const titleWidth = Math.max(...title.split("\n").map((l) => l.length));
    if (process.stdout.columns < titleWidth + 4) {
      // Fallback on narrow screens
      console.log("\n" + gradient.pastel(i18n.t("ui.title_fallback")));
      return;
    }

    // Vibrant Neon Rainbow 2
    const rainbow2 = gradient([
      "#ffff00", // Bright Yellow
      "#00ff00", // Neon Green
      "#00ffff", // Cyan
      "#3399ff", // Vibrant Light Blue
      "#9933ff", // Vibrant Purple
      "#ff00ff", // Neon Pink
      "#ff0000", // Red
      "#ff8c00", // Orange
      "#ffff00", // Loop back
    ]);
    console.log("\n" + rainbow2.multiline(title));
  } else {
    console.log("\n" + gradient.pastel(i18n.t("ui.title_fallback")));
  }
}
