import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class I18n {
  constructor(lang = "en") {
    this.lang = lang;
    this.translations = {};
    this.loadTranslations();
  }

  loadTranslations() {
    try {
      // Go up one level from src to root, then locales
      const localePath = path.join(
        __dirname,
        "..",
        "locales",
        `${this.lang}.json`
      );
      if (fs.existsSync(localePath)) {
        this.translations = JSON.parse(fs.readFileSync(localePath, "utf-8"));
      } else {
        console.warn(
          `Warning: Locale file not found for ${this.lang}, falling back to keys.`
        );
      }
    } catch (e) {
      console.error(`Failed to load translations: ${e.message}`);
    }
  }

  t(key, params = {}) {
    const keys = key.split(".");
    let value = this.translations;

    for (const k of keys) {
      value = value?.[k];
    }

    if (!value) return key; // Fallback to key

    // Simple replacement for {param}
    return value.replace(/{(\w+)}/g, (_, k) =>
      params[k] !== undefined ? params[k] : `{${k}}`
    );
  }
}
