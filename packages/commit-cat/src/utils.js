import * as p from "@clack/prompts";
import process from "node:process";

export function sleep(ms = 1000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function handleCancel(value, i18n) {
  if (p.isCancel(value)) {
    // If i18n is not provided, use english fallback
    const msg = i18n
      ? i18n.t("common.cancelled")
      : "Operation cancelled. Meow! 🐱";
    p.cancel(msg);
    process.exit(0);
  }
  return value;
}

export function getVisualWidth(str) {
  let width = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // CJK and some symbols take 2 columns
    width += code > 255 ? 2 : 1;
  }
  return width;
}

export function wrapText(text, maxWidth, process) {
  if (!text) return "";
  const cols =
    process && process.stdout && process.stdout.columns
      ? process.stdout.columns
      : 80;
  // Default margin 12 per previous fix
  const limit = maxWidth || Math.min(80, cols - 12);

  const lines = [];
  for (const paragraph of text.split("\n")) {
    let currentLine = "";
    let currentWidth = 0;

    for (const char of paragraph) {
      const charWidth = getVisualWidth(char);
      if (currentWidth + charWidth > limit) {
        lines.push(currentLine);
        currentLine = char;
        currentWidth = charWidth;
      } else {
        currentLine += char;
        currentWidth += charWidth;
      }
    }
    lines.push(currentLine);
  }
  return lines.join("\n");
}
