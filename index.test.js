// The plugin's own tests (Plan §53, app#177): how it names and picks languages, and the flow of a
// translation against a fake core, with the real Ionic the app lends the frame.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AUTO, MAX_CHARS, defaultTarget, languageName, matchLanguage, sortLanguages, swapped, tooLong } from "./dist/index.js";
import { LANGUAGES, catalogueOf, t } from "./dist/i18n.js";

const HERE = import.meta.dirname;
const manifest = JSON.parse(readFileSync(join(HERE, "module.json"), "utf8"));

describe("a language", () => {
  it("is named in the app's language, with a capital letter as a list shows it", () => {
    expect(languageName("de", "en")).toBe("German");
    expect(languageName("de", "es")).toBe("Alemán");
    expect(languageName("es", "es")).toBe("Español");
    expect(languageName("zh-Hans", "en")).toBe("Simplified Chinese");
  });

  it("keeps its tag when the phone has no name for it", () => {
    expect(languageName("xx", "en")).toBe("xx");
    expect(languageName("not a tag!", "en")).toBe("not a tag!");
  });

  it("is named in English when the app's language is not one the phone knows how to write", () => {
    expect(languageName("de", "!!")).toBe("German");
  });

  it("lists in the order of its name in the app's language", () => {
    expect(sortLanguages(["es", "fr", "de"], "en")).toEqual([
      { tag: "fr", name: "French" },
      { tag: "de", name: "German" },
      { tag: "es", name: "Spanish" },
    ]);
    expect(sortLanguages(["es", "fr", "de"], "es").map((one) => one.tag)).toEqual(["de", "es", "fr"]);
    expect(sortLanguages([], "en")).toEqual([]);
  });
});

describe("matching a language to the ones this phone has", () => {
  const apple = ["en", "es", "pt", "zh-Hans", "zh-Hant"];

  it("takes the same tag first, whatever its case", () => {
    expect(matchLanguage(apple, "es")).toBe("es");
    expect(matchLanguage(apple, "ES")).toBe("es");
    expect(matchLanguage(["zh", "zh-TW"], "zh-TW")).toBe("zh-TW");
  });

  it("goes by the first subtag when the tag itself is not there", () => {
    expect(matchLanguage(apple, "pt-BR")).toBe("pt");
    expect(matchLanguage(apple, "es-419")).toBe("es");
  });

  it("gives Chinese in the script the app's region writes", () => {
    expect(matchLanguage(apple, "zh-TW")).toBe("zh-Hant");
    expect(matchLanguage(apple, "zh-CN")).toBe("zh-Hans");
    expect(matchLanguage(["zh-TW", "zh"], "zh-CN")).toBe("zh");
    expect(matchLanguage(["zh"], "zh-TW")).toBe("zh");
  });

  it("gives nothing when the phone does not have it", () => {
    expect(matchLanguage(apple, "bn")).toBeNull();
    expect(matchLanguage(apple, "")).toBeNull();
    expect(matchLanguage(apple, null)).toBeNull();
    expect(matchLanguage([], "es")).toBeNull();
  });
});

describe("where a translation goes by default", () => {
  const languages = ["de", "en", "es", "fr"];

  it("is the app's language for a message the user was handed", () => {
    expect(defaultTarget(languages, { lang: "es", kept: "de", source: "fr", fromMessage: true })).toBe("es");
    expect(defaultTarget(languages, { lang: "es-ES", kept: null, source: null, fromMessage: true })).toBe("es");
  });

  it("is the last one used for the user's own text", () => {
    expect(defaultTarget(languages, { lang: "es", kept: "de", source: null, fromMessage: false })).toBe("de");
    // One this phone no longer has is no default.
    expect(defaultTarget(languages, { lang: "es", kept: "ja", source: null, fromMessage: false })).toBe("es");
  });

  it("is never the language the text is already in, while there is another", () => {
    expect(defaultTarget(languages, { lang: "es", kept: "de", source: "es", fromMessage: true })).toBe("de");
    expect(defaultTarget(languages, { lang: "es", kept: null, source: "es", fromMessage: true })).toBe("en");
    expect(defaultTarget(["es", "en"], { lang: "en", kept: null, source: "en", fromMessage: true })).toBe("es");
  });

  it("is English, or the first there is, when the app's language is not on this phone", () => {
    expect(defaultTarget(languages, { lang: "bn", kept: null, source: null, fromMessage: true })).toBe("en");
    expect(defaultTarget(["fr", "de"], { lang: "bn", kept: null, source: null, fromMessage: false })).toBe("fr");
    expect(defaultTarget([], { lang: "es", kept: null, source: null, fromMessage: true })).toBeNull();
  });
});

describe("a text", () => {
  it("is too long beyond 5 000 characters, counted as the phone counts them, not in UTF-16 halves", () => {
    expect(MAX_CHARS).toBe(5000);
    expect(tooLong("a".repeat(5000))).toBe(false);
    expect(tooLong("a".repeat(5001))).toBe(true);
    expect(tooLong("😀".repeat(5000))).toBe(false);
    expect(tooLong("😀".repeat(5001))).toBe(true);
  });
});

describe("swapping", () => {
  it("turns the translation into the text and the languages round, the detected one included", () => {
    expect(swapped({ from: AUTO, detected: "de", to: "es", text: "Guten Morgen", result: "Buenos días" })).toEqual({
      from: "es",
      to: "de",
      text: "Buenos días",
      result: "Guten Morgen",
    });
    expect(swapped({ from: "fr", detected: null, to: "en", text: "Bonjour", result: "Hello" })).toEqual({
      from: "en",
      to: "fr",
      text: "Hello",
      result: "Bonjour",
    });
  });
});

describe("the catalogue", () => {
  const APP_LANGUAGES = ["en", "es", "fr", "de", "it", "pt", "ro", "ru", "uk", "pl", "tr", "ar", "hi", "bn", "id", "vi", "th", "ja", "ko", "zh-CN", "zh-TW"];
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort();

  it("speaks the 21 languages of the app, with the same keys in each and none left empty", () => {
    expect([...LANGUAGES].sort()).toEqual([...APP_LANGUAGES].sort());
    const keys = Object.keys(catalogueOf("en")).sort();
    for (const lang of LANGUAGES) {
      expect(Object.keys(catalogueOf(lang)).sort(), lang).toEqual(keys);
      for (const key of keys) {
        expect(catalogueOf(lang)[key].trim(), `${lang}.${key}`).not.toBe("");
        // A text keeps the blanks English has, or the plugin's words would go missing.
        expect(placeholders(catalogueOf(lang)[key]), `${lang}.${key}`).toEqual(placeholders(catalogueOf("en")[key]));
      }
    }
  });

  it("tells the size of a download before it starts, in every language", () => {
    expect(t("en", "downloadText", { from: "German", to: "Spanish" })).toContain("about 30 MB");
    for (const lang of LANGUAGES) expect(catalogueOf(lang).downloadText, lang).toContain("30");
  });

  it("falls back to the base language and then to English", () => {
    expect(t("pt-BR", "translate")).toBe("Traduzir");
    expect(t("xx", "translate")).toBe("Translate");
    expect(t("es", "no-such-key")).toBe("no-such-key");
  });

  it("puts the words into the sentence that says them", () => {
    expect(t("en", "same", { language: "Spanish" })).toBe("The text is already in this language: Spanish.");
    expect(t("en", "translate", { language: "Spanish" })).toBe("Translate");
  });
});

describe("the manifest", () => {
  // The 20 languages of the app besides English, in which the catalogue shows the plugin's name
  // and summary (plugin-sdk, `locales` in module.schema.json).
  const LOCALES = ["es", "pt", "fr", "de", "it", "ro", "ru", "uk", "pl", "tr", "ar", "hi", "bn", "id", "vi", "th", "ja", "ko", "zh-CN", "zh-TW"];
  const codePoints = (text) => [...text].length;

  it("is a tool that opens a message's text, translates on the phone and fills the composer", () => {
    const { locales, ...rest } = manifest;
    expect(rest).toEqual({
      id: "com.flickertalk.translate",
      name: "Translator",
      version: "1.0.0",
      icon: "language-outline",
      minCoreVersion: "1.7.0",
      components: ["ft-translate"],
      permissions: { messages: "given", translate: true, send: "propose", storage: "small" },
      opens: ["text/plain"],
      summary: "Translates a message or your draft on the phone. Language packs are downloaded once from Apple or Google; the text never leaves the phone.",
    });
    expect(locales).toBeTypeOf("object");
    expect(JSON.parse(readFileSync(join(HERE, "package.json"), "utf8")).version).toBe(manifest.version);
  });

  it("names and sums up the plugin in the 20 other languages of the app, within the SDK's limits", () => {
    expect(Object.keys(manifest.locales ?? {})).toEqual(LOCALES);
    expect(manifest.locales.es).toEqual({
      name: "Traductor",
      summary: "Traduce un mensaje o tu borrador en el teléfono. Los paquetes de idioma se descargan una vez de Apple o Google; el texto nunca sale del teléfono.",
    });
    for (const lang of LOCALES) {
      const { name, summary } = manifest.locales[lang];
      expect(Object.keys(manifest.locales[lang]).sort(), lang).toEqual(["name", "summary"]);
      expect(codePoints(summary.trim()), lang).toBeGreaterThan(0);
      expect(codePoints(summary), lang).toBeLessThanOrEqual(200);
      expect(codePoints(name.trim()), lang).toBeGreaterThan(0);
      expect(codePoints(name), lang).toBeLessThanOrEqual(64);
    }
  });

  it("calls the plugin in each language what the plugin calls itself", () => {
    expect(catalogueOf("en").title).toBe(manifest.name);
    for (const lang of LOCALES) {
      expect(LANGUAGES, lang).toContain(lang);
      expect(manifest.locales[lang].name, lang).toBe(catalogueOf(lang).title);
    }
  });
});

describe("the image of the Apps grid", () => {
  // icon.svg beside module.json and dist/, signed with the rest: the app draws it on the tile; the
  // Ionicon in module.json stays as the fallback (2026-10-08).
  const image = join(HERE, "icon.svg");

  it("is a square 64 × 64 SVG of at most 4 KB at the root of the package, and not inside dist/", () => {
    expect(existsSync(image), "icon.svg").toBe(true);
    expect(statSync(image).size).toBeLessThanOrEqual(4096);
    const svg = readFileSync(image, "utf8");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('viewBox="0 0 64 64"');
    expect(svg).toContain('fill="#2563EB"');
    expect(existsSync(join(HERE, "dist", "icon.svg"))).toBe(false);
  });
});
