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

export function boxMessage(title, text, process) {
  const cols =
    process && process.stdout && process.stdout.columns
      ? process.stdout.columns
      : 80;
  const maxContentWidth = Math.min(80, cols - 4); // border(2) + padding(2)

  // 1. Wrap content
  const wrapped = wrapText(text, maxContentWidth, process);
  const lines = wrapped.split("\n");

  // 2. Calculate max width of the box
  let contentWidth = 0;
  lines.forEach((l) => {
    const w = getVisualWidth(l);
    if (w > contentWidth) contentWidth = w;
  });
  const titleWidth = getVisualWidth(title);
  // Ensure minimal width for title
  contentWidth = Math.max(contentWidth, titleWidth + 2);

  const boxWidth = contentWidth + 2; // +2 for padding spaces

  // 3. Draw
  const topBorder = "┌" + "─".repeat(boxWidth) + "┐";
  const bottomBorder = "└" + "─".repeat(boxWidth) + "┘";
  const separator = "├" + "─".repeat(boxWidth) + "┤";

  const out = [];

  // Title part? p.note style puts title inside or on top?
  // p.note style:
  // ┌  Title  ──────────────────────┐
  // │  ...                          │
  // └───────────────────────────────┘
  // Let's mimic a simple box with title embedded in top border or just inside.
  // Actually p.note puts title as a label. Let's make it look like a clean box.

  // Custom Box Style:
  // ┌─ Title ─────────────────────┐
  // │ content...                  │
  // └─────────────────────────────┘

  // Pad title with dashes
  const rightDashes = boxWidth - titleWidth - 3; // -3 for "┌─ " (3) and " " (1) ... wait.
  // Left: "┌─ " (3) + title + " " (1) = 4 + title
  // Right: "┐" (1)
  // Total fixed: 5 + title
  // Total target: boxWidth + 2 (because topBorder is boxWidth dashes + 2 corners? No wait)
  // topBorder = "┌" + "─".repeat(boxWidth) + "┐" -> Width is 1 + boxWidth + 1 = boxWidth + 2.
  // So Target is boxWidth + 2.
  // rightDashes = (boxWidth + 2) - (5 + titleWidth) = boxWidth - titleWidth - 3.
  // Correct.
  const topWithTitle =
    "┌─ " + title + " " + "─".repeat(Math.max(0, rightDashes)) + "┐";

  out.push(topWithTitle);

  lines.forEach((line) => {
    const w = getVisualWidth(line);
    const padding = boxWidth - w - 1; // -1 for left space
    // Using 1 space left padding
    out.push("│ " + line + " ".repeat(Math.max(0, padding)) + "│");
  });

  out.push(bottomBorder);

  return out.join("\n");
}
