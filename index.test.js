// The plugin's own tests (Plan §53, app#177): how it names and picks languages, and the flow of a
// translation against a fake core, with the real Ionic the app lends the frame.
import { describe, expect, it } from "vitest";
import { AUTO, MAX_CHARS, defaultTarget, languageName, matchLanguage, sortLanguages, swapped, tooLong } from "./dist/index.js";

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
