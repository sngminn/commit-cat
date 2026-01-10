import { GoogleGenerativeAI } from "@google/generative-ai";
import process from "node:process";

export async function generateReviewAndCommit(diff, i18n) {
  if (!diff || diff.trim().length === 0) {
    return null;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(i18n.t("errors.no_api_key"));
  }

  // Model selection based on language
  // Use the model that worked in previous verification
  const modelName = "gemini-2.5-flash-lite";

  const genAI = new GoogleGenerativeAI(apiKey);
  const systemPrompt = i18n.t("prompts.system");

  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  const prompt = `
    **Git Diff:**
    ${diff.substring(0, 5000)}
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    if (!text) throw new Error(i18n.t("errors.empty_response"));

    // Sanitize: sometimes AI adds markdown code blocks
    const cleanText = text
      .replace(/```json\n|\n```/g, "")
      .replace(/```/g, "")
      .trim();

    try {
      return JSON.parse(cleanText);
    } catch (e) {
      // Show a snippet of the raw text for debugging if parsing fails
      const snippet =
        cleanText.length > 200
          ? cleanText.substring(0, 200) + "..."
          : cleanText;
      throw new Error(
        i18n.t("errors.json_parse", { message: e.message }) +
          `\nRaw: ${snippet}`
      );
    }
  } catch (error) {
    // throw error to be handled by caller
    throw error;
  }
}
