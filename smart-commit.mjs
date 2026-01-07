import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Load .env from the script's directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

// Configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("\x1b[31m❌ Error: GEMINI_API_KEY not found.\x1b[0m");
  console.error(
    "👉 Please set it in ~/my-secret-tools/.env or your shell environment."
  );
  process.exit(1);
}

// Colors
const C = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

// Prompts
const PROMPTS = {
  en: `
    You are an expert Senior Developer and Code Reviewer.
    Analyze the provided git diff and generate a response in valid JSON format.

    **Task:**
    1.  **Commit Message:** Write a Conventional Commit message in **English**.
        - Format: 'type: subject'
        - **IMPORTANT:** If the changes are complex, **MUST include a bulleted body** explaining the details.
        - Separate subject and body with a blank line.
    2.  **Code Review:** Analyze the code for two categories:
        *   **CRITICAL (Critical):** 
            - 🚨 **SECURITY** (Hardcoded passwords, API keys, secrets) -> **MUST BE CRITICAL**
            - Bugs, infinite loops, logic errors.
        *   **SUGGESTION (Improvement):** 
            - Code style, performance, clean code suggestions.
            - **IMPORTANT:** Do NOT explain what the user *did* (e.g., "removed unused code"). Only suggest what the user *should do* (e.g., "variable name 'x' is unclear").
    
    **Output JSON Format (Strict):**
    {
      "commitMessage": "type(e.g., feat, fix, ...): ...\\n\\n- ...\\n- ...",
      "review": {
        "critical": [
          { "message": "Explain why this is dangerous", "filePath": "path/to/file", "lineNumber": "10" }
        ],
        "suggestions": [
          { 
            "message": "Actionable suggestion details", 
            "filePath": "path/to/file",
            "lineNumber": "25",
            "contextLine": "code snippet to locate (unique string)" 
          }
        ]
      }
    }

    **Rules:**
    - Language: ALL messages (commit msg, review comments) MUST be in **English**.
    - **🚨 CRITICAL RULE:** Any hardcoded secret (password, API key, token) in an ADDED line (\` +
    \`) **MUST** be categorized as 'critical'. NEVER 'suggestions'.
    - **EXCLUSIVE:** If an issue is Critical, DO NOT list it in Suggestions.
    - **ACTIONABLE ONLY:** Suggestions must be things to *fix* or *improve*. Do NOT summarize the diff.
    - **⛔️ DIFF ANALYSIS RULES:**
        - **DELETED LINES (\` -
    \`)**: This is code the user *removed*. Do NOT review it. Finding bugs here is useless.
        - **ADDED LINES (\` +
    \`)**: This is the NEW code. Focus your critical eye here.
        - **CONTEXT LINES**: Use them to understand the logic, but do not flag issues in unchanged code unless the *new changes* break it.
    - 'lineNumber': Estimate the line number from the git diff hunk header.
    - If no critical issues, return empty array [].
    - "contextLine" should be a unique string from the diff to identify where to place a TODO comment.
  `,
  ko: `
    You are an expert Senior Developer and Code Reviewer who communicates **ONLY in Korean**.
    Analyze the provided git diff and generate a response in valid JSON format.

    **Task:**
    1.  **Commit Message:** MUST Write a Conventional Commit message in **Korean**.
        - Format: 'type: subject'
        - **IMPORTANT:** content MUST be detailed. Do NOT be vague.
        - **REQUIREMENT:** You MUST include a bulleted list in the body explaining *what* changed and *why*.
        - **DETAIL LEVEL:** Avoid single-line messages. Break down the changes into specific points.
        - Separate subject and body with a blank line.
    2.  **Code Review:** Analyze the code for two categories:
        *   **CRITICAL (Critical):** 
            - 🚨 **SECURITY** (Hardcoded passwords, API keys, secrets) -> **MUST BE CRITICAL**
            - Bugs, infinite loops, logic errors.
        *   **SUGGESTION (Improvement):** 
            - Code style, performance, clean code suggestions.
            - **IMPORTANT:** Do NOT explain what the user *did* (e.g., "removed unused code"). Only suggest what the user *should do* (e.g., "variable name 'x' is unclear").
    
    **Output JSON Format (Strict):**
    {
      "commitMessage": "type(e.g., feat, fix, ...): ...\\n\\n- ...\\n- ...",
      "review": {
        "critical": [
          { "message": "Explain why this is dangerous", "filePath": "path/to/file", "lineNumber": "10" }
        ],
        "suggestions": [
          { 
            "message": "Actionable suggestion details", 
            "filePath": "path/to/file",
            "lineNumber": "25",
            "contextLine": "code snippet to locate (unique string)" 
          }
        ]
      }
    }

    **Rules:**
    - **LANGUAGE:** ALL content (commit subject, body, review comments) **MUST BE IN KOREAN (한국어)**.
    - **NO ENGLISH:** Do NOT write English in the JSON values (except for variable names or code terms).
    - **🚨 CRITICAL RULE:** Any hardcoded secret (password, API key, token) in an ADDED line (\` +
    \`) **MUST** be categorized as 'critical'. NEVER 'suggestions'.
    - **EXCLUSIVE:** If an issue is Critical, DO NOT list it in Suggestions.
    - **ACTIONABLE ONLY:** Suggestions must be things to *fix* or *improve*. Do NOT summarize the diff.
    - **⛔️ DIFF ANALYSIS RULES:**
        - **DELETED LINES (\` -
    \`)**: This is code the user *removed*. Do NOT review it. Finding bugs here is useless.
        - **ADDED LINES (\` +
    \`)**: This is the NEW code. Focus your critical eye here.
        - **CONTEXT LINES**: Use them to understand the logic, but do not flag issues in unchanged code unless the *new changes* break it.
    - 'lineNumber': Estimate the line number from the git diff hunk header.
    - If no critical issues, return empty array [].
    - "contextLine" should be a unique string from the diff to identify where to place a TODO comment.
  `,
};

async function generateReviewAndCommit(diff, language = "en") {
  if (!diff || diff.trim().length === 0) {
    return null;
  }

  // Model selection based on language
  // Korean: gemini-3-flash-preview (Better instruction following)
  // English: gemini-2.5-flash-lite (Faster, sufficient for English)
  const modelName =
    language === "ko" ? "gemini-3-flash-preview" : "gemini-2.5-flash-lite";

  const prompt =
    PROMPTS[language] +
    `
    **Git Diff:**
    ${diff.substring(0, 5000)}
  `;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      console.log(
        `${C.dim}Debug: Full Response: ${JSON.stringify(data, null, 2)}${
          C.reset
        }`
      );
      throw new Error("Empty response from AI");
    }

    // Remove markdown code blocks if present
    const cleanText = text.replace(/```json\n|\n```/g, "").trim();
    return JSON.parse(cleanText);
  } catch (error) {
    console.error(`${C.red}⚠️ AI Analysis Failed:${C.reset}`, error.message);
    return null; // Fallback to manual
  }
}

function editCommitMessage(initialMessage) {
  const tempFile = path.join(process.cwd(), ".COMMIT_EDITMSG_TEMP");
  fs.writeFileSync(tempFile, initialMessage);
  const editor = process.env.EDITOR || "vim";
  try {
    spawnSync(editor, [tempFile], { stdio: "inherit" });
    if (fs.existsSync(tempFile)) {
      const newMessage = fs.readFileSync(tempFile, "utf-8").trim();
      fs.unlinkSync(tempFile);
      return newMessage;
    }
    return initialMessage;
  } catch (e) {
    console.error("❌ Editor error:", e.message);
    return initialMessage;
  }
}

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

function getCommentSyntax(filePath, message) {
  const ext = path.extname(filePath).toLowerCase();
  const content = `TODO: [AI Suggestion] ${message}`;

  // Hash style: YAML, Python, Shell, Ruby, Dockerfile, TOML
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
  if ([".html", ".xml", ".md"].includes(ext)) {
    return `<!-- ${content} -->`;
  }

  // C-style (Default): JS, TS, Java, C, C++, Go, Rust, Swift...
  return `// ${content}`;
}

function injectTodoComments(suggestions) {
  let injectedCount = 0;
  console.log(`\n${C.cyan}💉 Injecting TODO comments...${C.reset}`);

  suggestions.forEach((item) => {
    if (!item.filePath || !fs.existsSync(item.filePath)) return;

    try {
      const content = fs.readFileSync(item.filePath, "utf-8");
      const lines = content.split("\n");

      let injected = false;
      // Get correct comment syntax based on file extension
      const todoComment = getCommentSyntax(item.filePath, item.message);

      if (item.contextLine) {
        const idx = lines.findIndex((line) =>
          line.includes(item.contextLine.trim())
        );
        if (idx !== -1) {
          // Detect indentation of the context line to match it
          const indentation = lines[idx].match(/^\s*/)[0];
          lines.splice(idx, 0, `${indentation}${todoComment}`);
          injected = true;
        }
      }

      if (!injected) {
        console.log(
          `${C.yellow}  ⚠️ Skipped injection for ${item.filePath} (Context not found)${C.reset}`
        );
        return;
      }

      fs.writeFileSync(item.filePath, lines.join("\n"));
      console.log(`${C.green}  ✓ Injected TODO in ${item.filePath}${C.reset}`);
      injectedCount++;
    } catch (e) {
      console.error(`${C.red}  ❌ Failed to modify ${item.filePath}${C.reset}`);
    }
  });

  return injectedCount;
}

async function main() {
  try {
    // Parse arguments
    const args = process.argv.slice(2);
    const isKorean = args.includes("-k") || args.includes("--korean");
    const language = isKorean ? "ko" : "en";

    if (isKorean) {
      console.log(`${C.cyan}🇰🇷 Running in Korean mode (-k detected)${C.reset}`);
    } else {
      console.log(`${C.dim}🇺🇸 Running in English mode (default)${C.reset}`);
    }

    console.log(`${C.cyan}📦 Staging changes...${C.reset}`);
    execSync("git add .", { stdio: "inherit" });

    const diff = execSync("git diff --staged | head -c 15000").toString();
    if (!diff.trim()) {
      console.log(`${C.yellow}🤔 No changes to commit.${C.reset}`);
      return;
    }

    console.log(
      `${C.cyan}🤖 AI Analysing Code & Generating Message...${C.reset}`
    );
    const aiResult = await generateReviewAndCommit(diff, language);

    let commitMsg = aiResult?.commitMessage || "chore: code update";
    const criticals = aiResult?.review?.critical || [];
    const suggestions = aiResult?.review?.suggestions || [];

    // --- DISPLAY REPORT ---
    console.log(
      `\n${C.bold}================ WITH REVIEWS ================${C.reset}`
    );

    if (criticals.length > 0) {
      console.log(
        `\n${C.red}${C.bold}🚨 CRITICAL ISSUES FOUND (Immediate Action Recommended):${C.reset}`
      );
      criticals.forEach((c) =>
        console.log(
          `${C.red}  - [${c.filePath}:${c.lineNumber || "?"}] ${c.message}${
            C.reset
          }`
        )
      );
    }

    if (suggestions.length > 0) {
      console.log(
        `\n${C.yellow}${C.bold}💡 SUGGESTIONS (Can add TODOs):${C.reset}`
      );
      suggestions.forEach((s) =>
        console.log(
          `${C.yellow}  - [${s.filePath}:${s.lineNumber || "?"}] ${s.message}${
            C.reset
          }`
        )
      );
    }

    if (criticals.length === 0 && suggestions.length === 0) {
      console.log(
        `\n${C.green}✅ Clean Code! No major issues found.${C.reset}`
      );
    }

    console.log(`\n${C.bold}📝 Proposed Commit Message:${C.reset}`);
    console.log(
      `${C.dim}--------------------------------------------------${C.reset}`
    );
    console.log(commitMsg);
    console.log(
      `${C.dim}--------------------------------------------------${C.reset}\n`
    );

    // --- INTERACTIVE LOOP ---
    while (true) {
      const options = [];
      options.push(`${C.green}[d]${C.reset}ismiss & commit`);
      if (suggestions.length > 0)
        options.push(`${C.cyan}[i]${C.reset}ssue (add TODOs)`);
      options.push(`${C.yellow}[e]${C.reset}dit msg`);
      options.push(`${C.red}[q]${C.reset}uit (fix code)`);

      const answer = await askQuestion(`Action? ${options.join(" / ")}: `);
      const choice = answer.trim().toLowerCase();

      if (choice === "d") {
        break;
      } else if (choice === "i" && suggestions.length > 0) {
        const count = injectTodoComments(suggestions);
        if (count > 0) {
          console.log(`${C.cyan}📦 Re-staging with TODOs...${C.reset}`);
          execSync("git add .");
        }
        break;
      } else if (choice === "e") {
        commitMsg = editCommitMessage(commitMsg);
        console.log(`${C.bold}New Message:${C.reset} ${commitMsg}`);
        const confirm = await askQuestion("Commit with this message? [y/n]: ");
        if (confirm.toLowerCase() === "y") break;
      } else if (choice === "q") {
        console.log("❌ Aborted.");
        process.exit(0);
      }
    }

    // FINAL COMMIT
    execSync("git commit -F -", {
      input: commitMsg,
      stdio: ["pipe", "inherit", "inherit"],
    });

    console.log(
      `\n${C.green}✅ Commit complete! (Don't forget to push: git push)${C.reset}`
    );
  } catch (error) {
    console.error(`${C.red}❌ Error:${C.reset}`, error.message);
    process.exit(1);
  }
}

main();
