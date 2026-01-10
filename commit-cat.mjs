import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import * as p from "@clack/prompts";
import chalk from "chalk";
import gradient from "gradient-string";

// --- SETUP ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

// --- CONSTANTS ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODELS = {
  lite: "gemini-2.5-flash-lite",
  flash: "gemini-3-flash-preview", // User requested this specific ID
};
const LIMITS = {
  MAX_FILE_SIZE: 30000,
  MAX_TOTAL_SIZE: 100000,
};
const IGNORE_PATTERNS = [
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  ".map",
  "dist/",
  "build/",
  ".DS_Store",
];
const BINARY_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".svg",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp4",
  ".mov",
  ".mp3",
  ".zip",
  ".tar",
  ".gz",
  ".pdf",
];

// --- UTILS ---
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function handleCancel(value) {
  if (p.isCancel(value)) {
    p.cancel("Operation cancelled. Meow! 🐱");
    process.exit(0);
  }
  return value;
}

function wrapText(text, maxWidth) {
  if (!text) return "";
  const width = maxWidth || Math.min(80, process.stdout.columns - 6); // Safe width
  return text.replace(
    new RegExp(`(?![^\\n]{1,${width}}$)([^\\n]{1,${width}})\\s`, "g"),
    "$1\n"
  );
}

function cleanTitle(rawTitle) {
  return rawTitle
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n");
}

function printTitle() {
  const titlePath = path.join(__dirname, "title.txt");
  if (fs.existsSync(titlePath)) {
    let title = fs.readFileSync(titlePath, "utf-8");
    title = cleanTitle(title);

    // Check width
    const titleWidth = Math.max(...title.split("\n").map((l) => l.length));
    // TODO: [AI] The logic for checking terminal width against title width (`process.stdout.columns < titleWidth + 4`) is a bit arbitrary. Consider if there's a more standard or configurable way to handle this, or if the magic number `4` could be a constant.
    if (process.stdout.columns < titleWidth + 4) {
      // Fallback on narrow screens
      console.log("\n" + gradient.pastel("  COMMIT-CAT  "));
      return;
    }

    // Vibrant Neon Rainbow 2 (Fixed Dark Spots)
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
    console.log("\n" + gradient.pastel("  COMMIT-CAT  "));
  }
}

// --- GIT STUFF ---
function getStagedFiles() {
  try {
    const output = execSync("git diff --staged --name-only", {
      encoding: "utf-8",
    });
    return output.trim().split("\n").filter(Boolean);
  } catch (e) {
    return [];
  }
}

function stageAll() {
  execSync("git add .", { stdio: "ignore" });
}

function getFileDiff(file) {
  try {
    const stats = fs.statSync(file);
    // 1. Basic Ignore
    if (IGNORE_PATTERNS.some((pattern) => file.includes(pattern)))
      return { skip: true, reason: "ignored" };

    // 2. Binary Check (Extension)
    const ext = path.extname(file).toLowerCase();
    if (BINARY_EXTENSIONS.includes(ext))
      return { skip: true, reason: "binary" };

    // 3. Size Check (Local)
    if (stats.size > LIMITS.MAX_FILE_SIZE)
      return { skip: true, reason: "too large" };

    // 4. Get Diff
    const diff = execSync(`git diff --staged "${file}"`, { encoding: "utf-8" });

    // 5. Size Check (Diff Text)
    if (diff.length > LIMITS.MAX_FILE_SIZE)
      return { skip: true, reason: "diff too large" };

    return { skip: false, content: diff };
  } catch (e) {
    return { skip: true, reason: "error reading" };
  }
}

function getCommentSyntax(filePath, message) {
  const ext = path.extname(filePath).toLowerCase();
  const content = `TODO: [AI] ${message}`;

  // Hash style
  if (
    [".yml", ".yaml", ".py", ".sh", ".rb", ".dockerfile", ".toml"].includes(ext)
  ) {
    return `# ${content}`;
  }
  // CSS style
  if ([".css", ".scss", ".less", ".saas"].includes(ext)) {
    return `/* ${content} */`;
  }
  // HTML style
  if ([".html", ".xml", ".md", ".jsx", ".tsx"].includes(ext)) {
    // jsx/tsx often use { /* */ } but inside pure code it's //, complex. fallback to // for tsx/jsx usually safe depending on context, but let's stick to // for js family
    if (ext === ".md") return `<!-- ${content} -->`; // MD specific
    // return `<!-- ${content} -->`; // HTML specific
  }
  // C-style (Default)
  return `// ${content}`;
}

// --- AI STUFF ---
async function callGemini(modelName, prompt, systemPrompt) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing in .env");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2, // Low temp for consistency
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(
      `Gemini API Error: ${data.error.message} (Code: ${data.error.code})`
    );
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from AI");

  return JSON.parse(text);
}

const PROMPTS = {
  en: `You are a Senior Developer. Analyze git diff. Return JSON.
  Output JSON format:
  {
    "commitMessage": "type: subject\\n\\n- body...",
    "review": {
      "critical": [{ "message": "...", "filePath": "...", "lineNumber": "..." }],
      "suggestions": [{ "message": "...", "filePath": "...", "contextLine": "unique code string", "lineNumber": "..." }]
    }
  }
  Rules:
  - English only.
  - Critical: Security (secrets), bugs.
  - Suggestion: Style, improvements.
  `,
  ko: `당신은 구글 수석 엔지니어 출신의 까칠한 멘토 '번7H-봇'입니다.
  변경된 코드를 분석하고 JSON 형식으로 응답하세요.

  **출력 형식 (JSON Only):**
  {
    "commitMessage": "type: subject\\n\\n- body...",
    "review": {
      "critical": [{ "message": "...", "filePath": "...", "lineNumber": "..." }],
      "suggestions": [{ "message": "...", "filePath": "...", "contextLine": "식별 가능한 유니크한 코드 라인", "lineNumber": "..." }]
    }
  }

  **절대 규칙:**
  1. **언어**: 커밋 메시지 본문과 리뷰 내용은 **반드시 한국어**로 작성하십시오. (영어 금지, 변수명 제외)
  2. **커밋 메시지**: 
     - 제목: 'feat: 기능 추가' 형식의 Conventional Commit.
     - 본문: 변경 내용을 글머리 기호(-)로 상세히 나열. "왜" 변경했는지 설명 포함.
  3. **코드 리뷰**:
     - **CRITICAL**: 보안 취약점(API Key 노출 등), 심각한 버그. 이건 농담 빼고 진지하게 지적.
     - **SUGGESTION**: 코드 스타일, 성능 개선, 변수명 제안. 까칠하지만 도움되게. "햄, 이건 좀 아니지 않습니까?" 같은 말투 허용하되, JSON 데이터엔 정중하게 담으세요 내용만. 말투는 내가 알아서 할테니 내용은 핵심만.
  `,
};

// --- MAIN CLI ---
async function main() {
  // 1. ARG PARSING
  const args = process.argv.slice(2);
  let useFlash = false;
  let useKorean = false;

  args.forEach((arg) => {
    if (arg === "-k" || arg === "--korean") useKorean = true;
    if (arg === "-f" || arg === "--flash") useFlash = true;
    if (arg === "-l" || arg === "--lite") useFlash = false;

    // Combined flags logic (e.g. -kf, -fk)
    if (arg.startsWith("-") && !arg.startsWith("--") && arg.length > 2) {
      if (arg.includes("k")) useKorean = true;
      if (arg.includes("f")) useFlash = true;
      if (arg.includes("l")) useFlash = false;
    }
  });

  const model = useFlash ? MODELS.flash : MODELS.lite;
  const lang = useKorean ? "ko" : "en";

  console.clear();
  printTitle();
  p.intro(chalk.bgCyan.black(` 🐱 COMMIT-CAT `) + chalk.dim(` v2.0`));

  if (!GEMINI_API_KEY) {
    p.note(chalk.red("GEMINI_API_KEY is missing!"), "Error");
    process.exit(1);
  }

  p.log.info(
    chalk.dim(
      `Model: ${model} | Language: ${lang === "ko" ? "한국어" : "English"}`
    )
  );

  // 2. STAGING
  let stagedFiles = getStagedFiles();
  if (stagedFiles.length === 0) {
    const shouldAdd = handleCancel(
      await p.confirm({
        message:
          lang === "ko"
            ? "스테이징된 파일이 없습니다. 현재 경로의 모든 파일을 스테이징 할까요?"
            : "No staged files. Stage all changes?",
        initialValue: true,
      })
    );

    if (shouldAdd) {
      stageAll();
      stagedFiles = getStagedFiles();
      if (stagedFiles.length === 0) {
        p.log.warn(
          chalk.yellow(
            lang === "ko" ? "변경사항이 없습니다." : "No changes found."
          )
        );
        process.exit(0);
      }
      p.log.success(chalk.green(`+ Staged ${stagedFiles.length} files.`));
    } else {
      p.log.warn(chalk.yellow("Aborted."));
      process.exit(0);
    }
  }

  // 3. DIFF GENERATION & FILTERING
  const s = p.spinner();
  s.start(lang === "ko" ? "변경사항 읽는 중..." : "Reading changes...");

  let fullDiff = "";
  let totalSize = 0;
  let skippedFiles = [];

  for (const file of stagedFiles) {
    if (totalSize >= LIMITS.MAX_TOTAL_SIZE) {
      skippedFiles.push(`${file} (Total Limit)`);
      continue;
    }

    const res = getFileDiff(file);
    if (res.skip) {
      skippedFiles.push(`${file} (${res.reason})`);
      continue;
    }

    // Safety check again before adding
    if (totalSize + res.content.length > LIMITS.MAX_TOTAL_SIZE) {
      skippedFiles.push(`${file} (Total Limit)`);
      continue;
    }

    fullDiff += `--- ${file}\n+++ ${file}\n${res.content}\n`;
    totalSize += res.content.length;
  }

  s.stop(chalk.green("Done"));

  if (!fullDiff.trim()) {
    p.log.warn("No valid text changes to review (Binary or skipped).");
    process.exit(0);
  }

  if (skippedFiles.length > 0) {
    p.log.warn(chalk.yellow(`Skipped ${skippedFiles.length} files:`));
    skippedFiles.forEach((f) => console.log(chalk.dim(` - ${f}`)));
  }

  // 4. AI GENERATION
  s.start(lang === "ko" ? "고양이 뇌 풀가동 중..." : "Thinking...");

  let result;
  try {
    result = await callGemini(model, fullDiff, PROMPTS[lang]);
  } catch (e) {
    s.stop(chalk.red("Error"));
    p.note(chalk.red(e.message), "AI Error");
    process.exit(1);
  }

  s.stop(chalk.green("Meow!"));

  // 5. REPORT
  const { commitMessage, review } = result;

  if (review?.critical?.length > 0) {
    p.log.error(
      chalk.bold.red(
        lang === "ko" ? "🚨 긴급 수정 필요 (Critical):" : "🚨 CRITICAL ISSUES:"
      )
    );
    review.critical.forEach((c) => {
      console.log(chalk.red(` [${c.filePath}] ${c.message}`));
    });
  }

  if (review?.suggestions?.length > 0) {
    p.log.warn(
      chalk.bgYellow.black(
        lang === "ko" ? " 💡 제안 (Suggestions) " : " 💡 SUGGESTIONS "
      )
    );
    console.log(""); // Gap
    review.suggestions.forEach((c) => {
      console.log(chalk.bgYellow.black(` ${c.filePath} `));
      console.log(chalk.yellow(wrapText(c.message)));
      console.log(""); // Spacing
    });
  }

  console.log("");
  p.note(
    wrapText(commitMessage),
    lang === "ko" ? "추천 커밋 메시지" : "Proposed Commit Message"
  );

  // 6. ACTION MENU
  const action = handleCancel(
    await p.select({
      message: lang === "ko" ? "어떻게 할까요 햄?" : "What's next?",
      options: [
        {
          value: "commit",
          label: lang === "ko" ? "✅ 커밋 진행시켜" : "Commit",
        },
        {
          value: "edit",
          label: lang === "ko" ? "✏️ 메시지 수정" : "Edit Message",
        },
        {
          value: "issues",
          label:
            lang === "ko"
              ? "🛠️ 제안사항 코멘트로 추가"
              : "Add Suggestions to Code",
          disabled: !review?.suggestions?.length,
        },
        { value: "cancel", label: lang === "ko" ? "❌ 취소" : "Cancel" },
      ],
    })
  );

  if (action === "cancel") {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  let finalMsg = commitMessage;

  if (action === "edit") {
    // Handling multiline edit is hard in prompts, fallback to spawning editor
    const tempFile = path.join(process.cwd(), ".COMMIT_EDITMSG_TEMP");
    fs.writeFileSync(tempFile, commitMessage);
    const editor = process.env.EDITOR || "vim";
    try {
      spawnSync(editor, [tempFile], { stdio: "inherit" });
      finalMsg = fs.readFileSync(tempFile, "utf-8").trim();
      fs.unlinkSync(tempFile);
    } catch {
      p.log.error("Failed to open editor.");
    }

    // Confirm after edit
    const confirm = handleCancel(
      await p.confirm({
        message: "Commit with this message?",
        initialValue: true,
      })
    );
    if (!confirm) process.exit(0);
  }

  if (action === "issues") {
    // Multiselect
    const selected = handleCancel(
      await p.multiselect({
        message:
          lang === "ko"
            ? "적용할 제안을 선택하세요"
            : "Select suggestions to apply",
        options: review.suggestions.map((s, idx) => ({
          value: idx,
          label: `[${s.filePath}] ${s.message}`,
          hint: s.contextLine,
        })),
      })
    );

    if (selected.length > 0) {
      let appliedCount = 0;
      selected.forEach((idx) => {
        const item = review.suggestions[idx];
        if (!fs.existsSync(item.filePath)) return;

        const content = fs.readFileSync(item.filePath, "utf-8");
        const lines = content.split("\n");
        const todo = getCommentSyntax(item.filePath, item.message);

        // Naive insertion
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
        }
      });
      p.log.success(chalk.green(`Applied ${appliedCount} suggestions.`));

      // Re-stage
      p.log.info("Re-staging files...");
      execSync("git add .");

      // Notify user to re-run or commit manually?
      // For now, let's just exit or ask if they want to commit now?
      // Complexity: logic says "re-staging with TODOs" in implementation plan.
      // Let's ask again.
      const commitNow = handleCancel(
        await p.confirm({
          message:
            lang === "ko"
              ? "수정사항 포함해서 지금 커밋할까요?"
              : "Commit now with changes?",
          initialValue: false,
        })
      );

      if (!commitNow) process.exit(0);
    }
  }

  // Final Commit
  try {
    execSync("git commit -F -", {
      input: finalMsg,
      stdio: ["pipe", "inherit", "inherit"],
    });
    p.outro(
      chalk.green(
        lang === "ko" ? "커밋 완료! 고생하셨습니다 햄." : "Commit success!"
      )
    );
  } catch (e) {
    p.log.error("Commit failed.");
    process.exit(1);
  }
}

main().catch(console.error);
