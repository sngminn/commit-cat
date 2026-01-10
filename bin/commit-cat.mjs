#!/usr/bin/env node

import * as p from "@clack/prompts";
import chalk from "chalk";
import dotenv from "dotenv";
import fs from "node:fs";
import process from "node:process";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { generateReviewAndCommit } from "../src/ai.js";
import {
  getFileDiff,
  getCommentSyntax,
  editCommitMessage,
} from "../src/git.js";
import { I18n } from "../src/i18n.js";
import { printTitle } from "../src/ui.js";
import { handleCancel, wrapText } from "../src/utils.js";

// Load env from package root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(__dirname, "..");
dotenv.config({ path: path.join(packageRoot, ".env") });

// Config
const args = process.argv.slice(2);
// Default to system locale? No, default to English unless -k or --lang ko is passed
const lang =
  args.includes("-k") || args.includes("--korean") || args.includes("--lang=ko")
    ? "ko"
    : "en";
const i18n = new I18n(lang);

async function main() {
  printTitle(i18n);

  // Check API Key
  if (!process.env.GEMINI_API_KEY) {
    p.cancel(i18n.t("errors.no_api_key"));
    process.exit(1);
  }

  // 1. STAGE CHECK
  try {
    const stagedCheck = execSync("git diff --staged --name-only")
      .toString()
      .trim();
    if (!stagedCheck) {
      const statusCheck = execSync("git status --porcelain").toString().trim();
      if (!statusCheck) {
        p.cancel(i18n.t("errors.nothing_to_commit"));
        process.exit(0);
      }

      p.log.warn(i18n.t("errors.no_staged"));
      const shouldStage = handleCancel(
        await p.confirm({
          message: i18n.t("errors.stage_all_confirm"),
          initialValue: true,
        }),
        i18n
      );

      if (shouldStage) {
        const s = p.spinner();
        s.start(i18n.t("ui.re_stage_info")); // "Staging files..."
        execSync("git add .");
        s.stop(chalk.green("Staged!"));
      } else {
        p.cancel(i18n.t("common.cancelled"));
        process.exit(0);
      }
    }
  } catch (e) {
    p.cancel(i18n.t("common.error") + ": " + e.message);
    process.exit(1);
  }

  // 2. GET DIFF
  const stagedFiles = execSync("git diff --staged --name-only")
    .toString()
    .trim()
    .split("\n");
  let fullDiff = "";
  for (const file of stagedFiles) {
    if (!file) continue;
    fullDiff += `File: ${file}\n`;
    fullDiff += getFileDiff(file);
    fullDiff += "\n\n";
  }

  // 3. AI ANALYSIS
  const s = p.spinner();
  s.start(i18n.t("ui.analyzing"));

  let result;
  try {
    result = await generateReviewAndCommit(fullDiff, i18n);
  } catch (e) {
    s.stop(chalk.red("Error"));

    let originalMsg = e.message || "";
    let displayMsg = originalMsg;

    // 1. Handle 429 specifically (Common in free tier)
    if (
      originalMsg.includes("429") ||
      originalMsg.includes("Too Many Requests")
    ) {
      // User wants the raw message up to the JSON junk, without generic replacement.
      // Regex: Capture from "[429" until " [{" (start of JSON array)
      const match = originalMsg.match(
        /(\[429 Too Many Requests\].*?)(?=\s*\[\{"@type")/s
      );
      if (match && match[1]) {
        displayMsg = match[1].trim();
      } else {
        // Fallback if regex fails: just cut at the first brace if it looks like JSON
        displayMsg = originalMsg.split('[{"@type"')[0].trim();
      }
    } else {
      // 2. Generic Cleaner: Remove URL prefixes and JSON dumps
      // Example: "[GoogleGenerativeAI Error]: Error fetching from ... : [400 ...] details..."
      // Try to capture the bracketed status code message.
      const statusMatch = originalMsg.match(
        /\[(4\d{2}|5\d{2})\s+.*?\](.*?)(?=\[|\n|$)/s
      );
      if (statusMatch) {
        displayMsg = `${statusMatch[0].trim()}`;
      }
    }

    p.note(chalk.red(wrapText(displayMsg, 0, process)), "AI Error");
    process.exit(1);
  }

  s.stop(chalk.green(i18n.t("common.done")));

  const { commitMessage, review } = result;

  // 4. REPORT
  if (review?.critical?.length > 0) {
    p.log.error(chalk.bold.red(i18n.t("ui.critical_issues")));
    review.critical.forEach((c) => {
      const loc = `[${c.filePath}:${c.lineNumber || "?"}]`;
      console.log(chalk.red(` ${loc} ${c.message}`));
    });
  }

  if (review?.suggestions?.length > 0) {
    p.log.warn(chalk.bgYellow.black(i18n.t("ui.suggestions")));
    console.log(""); // Gap
    review.suggestions.forEach((c) => {
      const loc = `[${c.filePath}:${c.lineNumber || "?"}]`;
      console.log(chalk.bgYellow.black(` ${loc} `));
      if (c.contextLine) {
        console.log(chalk.dim(`  ${c.contextLine.trim()}`));
      }
      // console.log(chalk.dim("  -"));
      console.log(
        chalk.yellow(wrapText(c.message, process.stdout.columns - 8, process))
      );
      console.log(""); // Spacing
    });
  }

  let currentMessage = commitMessage;

  // 5. ACTION LOOP
  while (true) {
    console.log("");
    p.note(
      wrapText(currentMessage, 0, process),
      i18n.t("ui.title_fallback").trim()
    );

    const action = handleCancel(
      await p.select({
        message: i18n.t("ui.confirm_commit"),
        options: [
          { value: "commit", label: i18n.t("ui.action_commit") },
          { value: "edit", label: i18n.t("ui.action_edit") },
          {
            value: "issues",
            label: i18n.t("ui.action_issues"),
            disabled: !review?.suggestions?.length,
          },
          { value: "cancel", label: i18n.t("ui.action_cancel") },
        ],
      }),
      i18n
    );

    if (action === "cancel") {
      p.cancel(i18n.t("common.cancelled"));
      process.exit(0);
    }

    if (action === "commit") {
      try {
        execSync(`git commit -m "${currentMessage}"`, { stdio: "inherit" });
        p.outro(chalk.green(i18n.t("ui.generated_commit")));
        process.exit(0);
      } catch (e) {
        p.log.error("Commit failed: " + e.message);
        process.exit(1);
      }
    }

    if (action === "edit") {
      currentMessage = editCommitMessage(currentMessage);
    }

    if (action === "issues") {
      const selected = handleCancel(
        await p.multiselect({
          message: i18n.t("ui.select_issues"),
          options: review.suggestions.map((s, idx) => {
            // Truncate file path if excessively long to prevent header wrap breaking the border
            let fileStr = `${s.filePath}:${s.lineNumber || "?"}`;
            const maxPrefix = Math.max(20, process.stdout.columns - 15);
            if (fileStr.length > maxPrefix) {
              fileStr = "..." + fileStr.slice(-(maxPrefix - 3));
            }

            const prefix = chalk.bgYellow.black(` [${fileStr}] `);

            // Further reduced safeWidth (columns - 15) to be absolutely safe for the left border line
            const safeWidth = Math.max(30, process.stdout.columns - 15);
            const body = wrapText(s.message, safeWidth, process);

            return {
              value: idx,
              // Clean format: Highlighted Header + Newline + Wrapped Body.
              // Removed context code, separators, and trailing newlines to prevent layout glitching.
              label: `${prefix}\n${body}`,
            };
          }),
        }),
        i18n
      );

      if (selected.length > 0) {
        let appliedCount = 0;

        // Sort selected indices descending to remove from array correctly later if we were splicing,
        // but since we are filtering, it's easier.
        // Actually, we need to iterate to apply, then filter.

        const indicesToRemove = new Set();

        selected.forEach((idx) => {
          const item = review.suggestions[idx];
          if (!fs.existsSync(item.filePath)) return;

          const content = fs.readFileSync(item.filePath, "utf-8");
          const lines = content.split("\n");
          const todo = getCommentSyntax(item.filePath, item.message);

          let injected = false;
          if (item.contextLine) {
            const lineIdx = lines.findIndex((l) =>
              l.includes(item.contextLine.trim())
            );
            if (lineIdx !== -1) {
              const indent = lines[lineIdx].match(/^\s*/)[0];
              lines.splice(lineIdx, 0, `${indent}${todo}`);
              injected = true;
            }
          }

          if (!injected && item.lineNumber) {
            const l = parseInt(item.lineNumber) - 1;
            if (lines[l]) {
              lines.splice(l, 0, todo);
              injected = true;
            }
          }

          if (injected) {
            fs.writeFileSync(item.filePath, lines.join("\n"));
            appliedCount++;
            indicesToRemove.add(idx); // Mark for removal
          }
        });

        // REMOVE applied suggestions to prevent duplicates
        review.suggestions = review.suggestions.filter(
          (_, i) => !indicesToRemove.has(i)
        );

        p.log.success(`Applied ${appliedCount} TODO comments!`);

        if (review.suggestions.length === 0) {
          p.log.info("All suggestions applied.");
        }

        // Re-stage
        const commitNow = handleCancel(
          await p.confirm({
            message: i18n.t("ui.commit_now"),
            initialValue: true,
          }),
          i18n
        );

        if (commitNow) {
          p.log.info(i18n.t("ui.re_stage_info"));
          execSync("git add .");
        } else {
          p.log.info("Done!");
          process.exit(0);
        }
      }
    }
  }
}

main().catch(console.error);
