// The plugin's own tests (Plan §53, app#177): how it names and picks languages, and the flow of a
// translation against a fake core, with the real Ionic the app lends the frame.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTO, MAX_CHARS, defaultTarget, languageName, languageWord, matchLanguage, sortLanguages, swapped, tooLong } from "./dist/index.js";
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

  it("keeps the phone's own case inside a sentence", () => {
    expect(languageWord("de", "es")).toBe("alemán");
    expect(languageWord("de", "en")).toBe("German");
    expect(languageWord("xx", "es")).toBe("xx");
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

  // iOS lists `Locale.Language.minimalIdentifier`s: `zh` (Simplified), `zh-TW` (Traditional),
  // `en-GB`, `en-US`, `pt-BR`; Android lists `zh` only.
  const iphone = ["en-GB", "en-US", "es", "pt-BR", "zh", "zh-TW"];

  it("takes an equivalent form of a Chinese tag when the tag itself is not there", () => {
    expect(matchLanguage(iphone, "zh-TW")).toBe("zh-TW");
    expect(matchLanguage(iphone, "zh-CN")).toBe("zh");
    expect(matchLanguage(iphone, "zh-Hant")).toBe("zh-TW");
    expect(matchLanguage(iphone, "zh-HK")).toBe("zh-TW");
    expect(matchLanguage(iphone, "zh-Hans")).toBe("zh");
    expect(matchLanguage(["zh-TW", "zh-CN"], "zh-Hans")).toBe("zh-CN");
    expect(matchLanguage(["zh-TW", "zh-CN"], "zh")).toBe("zh-CN");
    expect(matchLanguage(["zh-Hant", "zh-Hans"], "zh")).toBe("zh-Hans");
    expect(matchLanguage(["zh-Hant", "zh-Hans"], "zh-HK")).toBe("zh-Hant");
  });

  it("takes any tag of the same language when there is neither the tag nor the language alone", () => {
    expect(matchLanguage(iphone, "en")).toBe("en-GB");
    expect(matchLanguage(iphone, "pt")).toBe("pt-BR");
    expect(matchLanguage(iphone, "pt-BR")).toBe("pt-BR");
    expect(matchLanguage(["sr-Latn-RS", "sr-Cyrl"], "sr-Cyrl-RS")).toBe("sr-Cyrl");
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

  it("is found among the tags an iPhone lists", () => {
    const iphone = ["en-GB", "en-US", "es", "zh", "zh-TW"];
    expect(defaultTarget(iphone, { lang: "zh-TW", kept: null, source: "es", fromMessage: true })).toBe("zh-TW");
    expect(defaultTarget(iphone, { lang: "zh-CN", kept: null, source: "es", fromMessage: true })).toBe("zh");
    expect(defaultTarget(iphone, { lang: "en", kept: null, source: "es", fromMessage: true })).toBe("en-GB");
    expect(defaultTarget(iphone, { lang: "bn", kept: null, source: null, fromMessage: true })).toBe("en-GB");
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

  it("says in one sentence, in every language, that it cannot translate here", () => {
    for (const lang of LANGUAGES) {
      const sentence = catalogueOf(lang).cannot.trim();
      expect(sentence.slice(0, -1), lang).not.toMatch(/[.。।!?！？]/);
    }
  });

  it("tells the size of a download before it starts, in every language", () => {
    expect(t("en", "downloadText", { from: "German", to: "Spanish" })).toContain("about 30 MB");
    for (const lang of LANGUAGES) expect(catalogueOf(lang).downloadText, lang).toContain("30");
  });

  it("names the chat's language as the manifest's hook does, and tells the download's size, in every language", () => {
    for (const lang of LANGUAGES.filter((one) => one !== "en")) {
      expect(catalogueOf(lang).chatLanguage, lang).toBe(manifest.locales[lang].hooks.chat);
    }
    expect(catalogueOf("en").chatLanguage).toBe(manifest.hooks.chat.label);
    for (const lang of LANGUAGES) expect(catalogueOf(lang).chatNote, lang).toContain("30");
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

  // 1.1.0 (2026-10-20, chat hooks): the tool binds to the chat's hooks (plugin-sdk, `hooks` in
  // module.schema.json): Translate on a held message and in the composer, and the chat's language
  // in the chat's options. The app runs it there; this window stays for any text.
  it("is a tool that opens a message's text, translates on the phone and fills the composer", () => {
    const { locales, ...rest } = manifest;
    expect(rest).toEqual({
      id: "com.flickertalk.translate",
      name: "Translator",
      version: "1.1.0",
      icon: "language-outline",
      minCoreVersion: "1.7.0",
      components: ["ft-translate"],
      permissions: { messages: "given", translate: true, send: "propose", storage: "small" },
      opens: ["text/plain"],
      hooks: {
        message: { label: "Translate", icon: "language-outline" },
        composer: { label: "Translate", icon: "language-outline" },
        chat: { label: "Chat language", icon: "language-outline" },
      },
      summary: "Translates a message or your draft on the phone. Language packs are downloaded once from Apple or Google; the text never leaves the phone.",
    });
    expect(locales).toBeTypeOf("object");
    expect(JSON.parse(readFileSync(join(HERE, "package.json"), "utf8")).version).toBe(manifest.version);
  });

  it("names and sums up the plugin in the 20 other languages of the app, within the SDK's limits", () => {
    expect(Object.keys(manifest.locales ?? {})).toEqual(LOCALES);
    // The hooks' labels sit beside them (next test).
    expect((({ hooks, ...rest }) => rest)(manifest.locales.es)).toEqual({
      name: "Traductor",
      summary: "Traduce un mensaje o tu borrador en el teléfono. Los paquetes de idioma se descargan una vez de Apple o Google; el texto nunca sale del teléfono.",
    });
    for (const lang of LOCALES) {
      const { name, summary } = manifest.locales[lang];
      expect(Object.keys(manifest.locales[lang]).sort(), lang).toEqual(["hooks", "name", "summary"]);
      expect(codePoints(summary.trim()), lang).toBeGreaterThan(0);
      expect(codePoints(summary), lang).toBeLessThanOrEqual(200);
      expect(codePoints(name.trim()), lang).toBeGreaterThan(0);
      expect(codePoints(name), lang).toBeLessThanOrEqual(64);
    }
  });

  it("labels its hooks in the 20 other languages of the app, within the SDK's limits", () => {
    expect(manifest.locales.es.hooks).toEqual({ message: "Traducir", composer: "Traducir", chat: "Idioma del chat" });
    for (const lang of LOCALES) {
      const { hooks } = manifest.locales[lang];
      expect(Object.keys(hooks), lang).toEqual(["message", "composer", "chat"]);
      for (const label of Object.values(hooks)) {
        expect(codePoints(label.trim()), lang).toBeGreaterThan(0);
        expect(codePoints(label), lang).toBeLessThanOrEqual(64);
      }
      // The button says what the plugin's own button says.
      expect(hooks.message, lang).toBe(catalogueOf(lang).translate);
      expect(hooks.composer, lang).toBe(catalogueOf(lang).translate);
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

/** The opaque keys of two chats, as the app derives them (43 characters, per chat and plugin). */
const CHAT = "chatA".padEnd(43, "x");
const OTHER = "chatB".padEnd(43, "y");

/**
 * A fake core, as the frame's `ft` would answer: a phone with four languages, English and Spanish
 * already on it, that names a text's language by a word in it and "translates" by tagging it.
 */
function fakeCore({ languages = ["de", "en", "es", "fr"], installed = ["en", "es"] } = {}) {
  const settings = new Map();
  const records = new Map();
  const handlers = [];
  const hookHandlers = [];
  const kept = new Set(installed);
  const words = { guten: "de", danke: "de", bonjour: "fr", hola: "es", hello: "en" };
  return {
    settings,
    records,
    kept,
    open: (opening) => Promise.all(handlers.map((handler) => handler({ text: "", dark: false, lang: "en", file: null, ref: null, reminder: null, live: false, ...opening }))),
    /** How many handlers the plugin registered for the chat's hooks. */
    hooked: () => hookHandlers.length,
    /** One run of a hook, as the app hands it (`ft.hook`): what the handler resolves with. */
    hook: (hook) => hookHandlers.at(-1)({ name: "message", text: "", chat: CHAT, ref: null, lang: "en", manual: true, ...hook }),
    ft: {
      onOpen: (handler) => handlers.push(handler),
      onHook: (handler) => hookHandlers.push(handler),
      show: vi.fn(),
      notify: vi.fn(),
      say: vi.fn(),
      close: vi.fn(),
      records: {
        get: vi.fn(async (key) => records.get(key) ?? null),
        set: vi.fn(async (key, value) => (records.set(key, value), true)),
        forget: vi.fn(async (key) => records.delete(key)),
      },
      store: {
        get: vi.fn(async (key) => settings.get(key) ?? null),
        set: vi.fn(async (key, value) => (settings.set(key, value), true)),
        forget: vi.fn(async (key) => settings.delete(key)),
      },
      translate: {
        languages: vi.fn(async () => [...languages]),
        detect: vi.fn(async (text) => Object.entries(words).find(([word]) => text.toLowerCase().includes(word))?.[1] ?? null),
        status: vi.fn(async (from, to) => {
          if (!languages.includes(from) || !languages.includes(to)) return "unsupported";
          return kept.has(from) && kept.has(to) ? "installed" : "downloadable";
        }),
        prepare: vi.fn(async (from, to) => (kept.add(from), kept.add(to), true)),
        remove: vi.fn(async (from) => kept.delete(from)),
        translate: vi.fn(async (text, from, to) => `[${from}→${to}] ${text}`),
      },
    },
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = async (times = 6) => {
  for (let wait = 0; wait < times; wait += 1) await tick();
};

describe("the plugin", () => {
  let core;
  let element;
  // In the page, not in a shadow root: Ionic's global styles do not cross a shadow boundary.
  const inside = () => element;
  const field = (name) => inside().querySelector(`[data-field="${name}"]`);
  const act = (name) => inside().querySelector(`[data-act="${name}"]`);
  const press = async (name, key) => {
    inside().querySelector(`[data-act="${name}"]${key ? `[data-key="${key}"]` : ""}`).click();
    await settle();
  };
  // Ionic moves a button's label to the native button inside it once it has drawn.
  const label = (one) => one?.getAttribute("aria-label") ?? one?.shadowRoot?.querySelector("button")?.getAttribute("aria-label") ?? null;
  /** What Ionic's select says when the user picks in it. */
  const pick = async (name, value) => {
    const select = field(name);
    select.value = value;
    select.dispatchEvent(new CustomEvent("ionChange", { bubbles: true, detail: { value } }));
    await settle();
  };
  /** What Ionic's textarea says as the user types. */
  const type = async (value) => {
    const textarea = field("text");
    textarea.value = value;
    textarea.dispatchEvent(new CustomEvent("ionInput", { bubbles: true, detail: { value } }));
    await settle();
  };
  /** The app's Ionic alert, answered as a tap on one of its buttons would. */
  const answer = async (role) => {
    let alert = null;
    for (let wait = 0; wait < 50 && !(alert = document.querySelector("ion-alert")); wait += 1) await tick();
    if (!alert) throw new Error("no alert");
    await alert.dismiss(undefined, role);
    await settle();
    return alert;
  };
  const toast = async () => {
    let one = null;
    for (let wait = 0; wait < 50 && !(one = document.querySelector("ion-toast")); wait += 1) await tick();
    return one;
  };
  /** What Ionic's toggle says when the user flips it. */
  const flip = async (name, checked) => {
    const toggle = field(name);
    toggle.checked = checked;
    toggle.dispatchEvent(new CustomEvent("ionChange", { bubbles: true, detail: { checked, value: toggle.value } }));
    await settle();
  };
  /** What the plugin keeps for a chat, in its records. */
  const keptFor = (chat) => {
    const value = core.records.get(`chat:${chat}`);
    return value === undefined ? undefined : JSON.parse(value);
  };
  const keepFor = (chat, value) => core.records.set(`chat:${chat}`, JSON.stringify(value));
  const optionsOf = (name) => [...field(name).querySelectorAll("ion-select-option")].map((one) => [one.value, one.textContent]);
  const result = () => inside().querySelector("ion-card.result");
  const status = () => inside().querySelector(".status");

  const make = () => {
    element = document.createElement("ft-translate");
    document.body.append(element);
  };

  beforeEach(() => {
    core = fakeCore();
    globalThis.ft = core.ft;
    // The frame has no browser dialogs: confirm() and prompt() answer nothing there.
    globalThis.confirm = globalThis.prompt = () => {
      throw new Error("no browser dialogs in the frame");
    };
    document.body.innerHTML = "";
    make();
  });

  afterEach(async () => {
    for (const alert of document.querySelectorAll("ion-alert")) await alert.dismiss();
    for (const one of document.querySelectorAll("ion-toast")) await one.dismiss();
    delete globalThis.confirm;
    delete globalThis.prompt;
  });

  it("shows the message it was handed, tells its language and sets the app's as the one to translate into", async () => {
    await core.open({ text: "Guten Morgen", lang: "es" });
    expect(field("text").tagName).toBe("ION-TEXTAREA");
    expect(field("text").value).toBe("Guten Morgen");
    expect(core.ft.translate.detect).toHaveBeenCalledWith("Guten Morgen");
    expect(field("from").value).toBe(AUTO);
    expect(optionsOf("from")[0]).toEqual([AUTO, "Alemán (detectado)"]);
    expect(field("to").value).toBe("es");
    // Every language of this phone, by its name in the app's language.
    expect(optionsOf("to")).toEqual([["de", "Alemán"], ["es", "Español"], ["fr", "Francés"], ["en", "Inglés"]]);
    expect(optionsOf("from").slice(1)).toEqual(optionsOf("to"));
    // Nothing is translated until the user asks.
    expect(core.ft.translate.translate).not.toHaveBeenCalled();
    expect(result()).toBeNull();
  });

  it("matches the app's language and the detected one to the tags an iPhone lists", async () => {
    core = fakeCore({ languages: ["en-GB", "en-US", "es", "zh", "zh-TW"], installed: ["en-GB", "zh-TW"] });
    globalThis.ft = core.ft;
    document.body.innerHTML = "";
    make();
    await core.open({ text: "Hello there", lang: "zh-TW" });
    expect(field("to").value).toBe("zh-TW");
    await press("translate");
    expect(core.ft.translate.translate).toHaveBeenCalledWith("Hello there", "en-GB", "zh-TW");
  });

  it("translates on the phone when the user presses Translate, and shows the translation", async () => {
    core.kept.add("de");
    await core.open({ text: "Guten Morgen", lang: "en" });
    await press("translate");
    expect(core.ft.translate.status).toHaveBeenCalledWith("de", "en");
    expect(core.ft.translate.prepare).not.toHaveBeenCalled();
    expect(core.ft.translate.translate).toHaveBeenCalledWith("Guten Morgen", "de", "en");
    expect(result().textContent).toBe("[de→en] Guten Morgen");
    expect(result().querySelector("[lang]").getAttribute("lang")).toBe("en");
  });

  it("asks before downloading a language, with its rough size, and downloads only on yes", async () => {
    await core.open({ text: "Guten Morgen", lang: "es" });
    await press("translate");
    const asked = await answer("cancel");
    expect(asked.message).toBe(t("es", "downloadText", { from: "alemán", to: "español" }));
    expect(asked.message).toContain("30 MB");
    expect(core.ft.translate.prepare).not.toHaveBeenCalled();
    expect(core.ft.translate.translate).not.toHaveBeenCalled();

    let finish;
    core.ft.translate.prepare.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    await press("translate");
    await answer("confirm");
    expect(core.ft.translate.prepare).toHaveBeenCalledWith("de", "es");
    // While the phone downloads: a spinner, and no second Translate.
    expect(status().querySelector("ion-spinner")).not.toBeNull();
    expect(status().textContent).toContain(t("es", "downloading"));
    expect(act("translate").disabled).toBe(true);
    finish(true);
    await settle();
    expect(core.ft.translate.translate).toHaveBeenCalledWith("Guten Morgen", "de", "es");
    expect(status().querySelector("ion-spinner")).toBeNull();
    expect(result().textContent).toBe("[de→es] Guten Morgen");
    expect(act("translate").disabled).toBe(false);
  });

  it("says so when the language could not be downloaded, and translates nothing", async () => {
    core.ft.translate.prepare.mockResolvedValueOnce(false);
    await core.open({ text: "Guten Morgen" });
    await press("translate");
    await answer("confirm");
    expect(status().textContent).toBe(t("en", "noDownload"));
    expect(core.ft.translate.translate).not.toHaveBeenCalled();
  });

  // An empty list is also what the core answers when the user did not allow the plugin to
  // translate: the sentence covers both, as the plugin cannot tell them apart.
  it("says in one sentence that it cannot translate here, and offers nothing else", async () => {
    core.ft.translate.languages.mockResolvedValueOnce([]);
    await core.open({ text: "Guten Morgen" });
    expect(inside().querySelector(".cannot").textContent.trim()).toBe(
      "Translation is not available: this phone cannot translate, or the Translator was not allowed to.",
    );
    expect(inside().querySelector("ion-button")).toBeNull();
    expect(inside().querySelector("ion-select, ion-textarea, ion-footer")).toBeNull();
    expect(core.ft.translate.detect).not.toHaveBeenCalled();
  });

  it("says the same on an app with no translator at all", async () => {
    delete core.ft.translate;
    await core.open({ text: "Guten Morgen", lang: "es" });
    expect(inside().querySelector(".cannot").textContent.trim()).toBe(
      "La traducción no está disponible: este teléfono no puede traducir o el Traductor no tiene permiso.",
    );
  });

  it("hands the translation to the composer, and only once there is one", async () => {
    core.kept.add("de");
    await core.open({ text: "Guten Morgen" });
    expect(act("say").disabled).toBe(true);
    expect(act("swap").disabled).toBe(true);
    await press("translate");
    expect(act("say").disabled).toBe(false);
    await press("say");
    expect(core.ft.say).toHaveBeenCalledWith("[de→en] Guten Morgen");
  });

  it("swaps the languages and the texts", async () => {
    core.kept.add("de");
    await core.open({ text: "Guten Morgen" });
    await press("translate");
    await press("swap");
    expect(field("from").value).toBe("en");
    expect(field("to").value).toBe("de");
    expect(field("text").value).toBe("[de→en] Guten Morgen");
    expect(result().textContent).toBe("Guten Morgen");
    expect(core.ft.store.set).toHaveBeenLastCalledWith("to", "de");
  });

  it("keeps the last language translated into, for the user's own text next time", async () => {
    await core.open({ lang: "en" });
    expect(field("to").value).toBe("en");
    await pick("to", "fr");
    expect(core.ft.store.set).toHaveBeenCalledWith("to", "fr");

    document.body.innerHTML = "";
    make();
    await core.open({ lang: "en" });
    expect(field("to").value).toBe("fr");
    // A message the user was handed still goes into the app's language.
    await core.open({ text: "Hola", lang: "en" });
    expect(field("to").value).toBe("en");
  });

  it("translates the user's own text into the language they pick", async () => {
    await core.open({ lang: "es" });
    expect(field("text").value).toBe("");
    expect(act("translate").disabled).toBe(true);
    await type("Hello, see you tomorrow");
    expect(act("translate").disabled).toBe(false);
    await pick("to", "fr");
    await press("translate");
    await answer("confirm");
    expect(core.ft.translate.detect).toHaveBeenCalledWith("Hello, see you tomorrow");
    expect(core.ft.translate.translate).toHaveBeenCalledWith("Hello, see you tomorrow", "en", "fr");
    await press("say");
    expect(core.ft.say).toHaveBeenCalledWith("[en→fr] Hello, see you tomorrow");
  });

  it("takes the language the user picks over the one the phone detected", async () => {
    await core.open({ text: "Guten Morgen" });
    await pick("from", "fr");
    await press("translate");
    await answer("confirm");
    expect(core.ft.translate.translate).toHaveBeenCalledWith("Guten Morgen", "fr", "en");
    expect(core.ft.translate.detect).toHaveBeenCalledTimes(1);
  });

  it("forgets a translation as soon as the text changes", async () => {
    core.kept.add("de");
    await core.open({ text: "Guten Morgen" });
    await press("translate");
    await type("Danke schön");
    expect(result()).toBeNull();
    expect(act("say").disabled).toBe(true);
    expect(optionsOf("from")[0]).toEqual([AUTO, "Detect language"]);
  });

  it("asks the user to pick the language when the phone cannot tell it", async () => {
    await core.open({ text: "Ciao a tutti" });
    expect(optionsOf("from")[0]).toEqual([AUTO, "Detect language"]);
    await press("translate");
    expect(status().textContent).toBe(t("en", "unknown"));
    expect(core.ft.translate.status).not.toHaveBeenCalled();
  });

  it("says when the text is already in the language asked for", async () => {
    await core.open({ text: "Hola", lang: "en" });
    await pick("to", "es");
    await press("translate");
    expect(status().textContent).toBe(t("en", "same", { language: "Spanish" }));
    expect(core.ft.translate.status).not.toHaveBeenCalled();
  });

  it("says when this phone cannot translate between the two", async () => {
    core.ft.translate.status.mockResolvedValueOnce("unsupported");
    await core.open({ text: "Guten Morgen" });
    await press("translate");
    expect(status().textContent).toBe(t("en", "unsupported"));
    expect(core.ft.translate.translate).not.toHaveBeenCalled();
  });

  it("keeps a text longer than the core takes, and says so, without asking the core", async () => {
    await core.open({ text: "Guten Morgen ".repeat(400) });
    await press("translate");
    expect(status().textContent).toBe("Too long to translate: 5,000 characters at most.");
    expect(core.ft.translate.status).not.toHaveBeenCalled();
    expect(core.ft.translate.translate).not.toHaveBeenCalled();
  });

  it("says it could not translate in Ionic's toast when the phone gives nothing back", async () => {
    core.kept.add("de");
    core.ft.translate.translate.mockResolvedValueOnce(null);
    await core.open({ text: "Guten Morgen" });
    await press("translate");
    expect((await toast())?.message).toBe("Could not translate.");
    expect(result()).toBeNull();
  });

  it("stays alive when a call to the core fails", async () => {
    core.kept.add("de");
    core.ft.translate.translate.mockRejectedValueOnce(new Error("gone"));
    await core.open({ text: "Guten Morgen" });
    await press("translate");
    expect((await toast())?.message).toBe("Could not translate.");
    expect(act("translate").disabled).toBe(false);
  });

  it("translates once for a double tap", async () => {
    core.kept.add("de");
    await core.open({ text: "Guten Morgen" });
    act("translate").click();
    act("translate").click();
    await settle();
    expect(core.ft.translate.translate).toHaveBeenCalledTimes(1);
  });

  it("lists the languages downloaded on this phone and removes one once the user says so", async () => {
    core.kept.add("de");
    await core.open({ text: "Guten Morgen" });
    await press("packs");
    for (const tag of ["de", "es", "fr"]) expect(core.ft.translate.status).toHaveBeenCalledWith(tag, "en");
    const rows = () => [...inside().querySelectorAll('ion-item[data-tag]')];
    expect(rows().map((row) => row.dataset.tag)).toEqual(["de", "es"]);
    expect(rows()[0].textContent).toContain("German");

    await press("erase", "de");
    const asked = await answer("cancel");
    expect(asked.header).toBe("German");
    expect(asked.message).toBe(t("en", "removeAsk"));
    expect(core.ft.translate.remove).not.toHaveBeenCalled();

    await press("erase", "de");
    await answer("destructive");
    expect(core.ft.translate.remove).toHaveBeenCalledWith("de", "en");
    expect(rows().map((row) => row.dataset.tag)).toEqual(["es"]);
    expect((await toast())?.message).toBe("Removed: German");

    // Back where it was, with the text it had.
    await press("back");
    expect(field("text").value).toBe("Guten Morgen");
  });

  it("says where the languages are managed when the phone does not let the app remove them", async () => {
    core.ft.translate.remove.mockResolvedValueOnce(false);
    await core.open({});
    await press("packs");
    await press("erase", "es");
    await answer("destructive");
    expect((await toast())?.message).toBe(t("en", "notRemoved"));
    expect([...inside().querySelectorAll("ion-item[data-tag]")].map((row) => row.dataset.tag)).toEqual(["es"]);
  });

  it("says when no language has been downloaded yet", async () => {
    core.kept.delete("es");
    await core.open({});
    await press("packs");
    expect(inside().querySelector(".empty").textContent.trim()).toBe(t("en", "packsEmpty"));
  });

  it("draws in the page in Ionic's header, content and footer, with no title or close of its own and no form", async () => {
    await core.open({ text: "Guten Morgen" });
    expect(element.shadowRoot).toBe(null);
    expect(label(element.querySelector(':scope > ion-header > ion-toolbar ion-button[data-act="packs"]'))).toBe("Downloaded languages");
    expect(element.querySelector(":scope > ion-content ion-select[data-field='from']")).not.toBeNull();
    expect(element.querySelector(":scope > ion-content ion-select[data-field='to']")).not.toBeNull();
    expect(element.querySelector(":scope > ion-content ion-textarea[data-field='text']")).not.toBeNull();
    expect(element.querySelector(':scope > ion-content ion-button[data-act="translate"]').textContent).toContain("Translate");
    const footer = element.querySelector(":scope > ion-footer > ion-toolbar");
    expect(footer.querySelector('ion-button[data-act="say"]').textContent).toContain("Use in chat");
    expect(footer.querySelector('ion-button[data-act="swap"]').textContent).toContain("Swap");
    // The app's window already has the name and the way out.
    expect(element.querySelector("ion-title, [data-act='close'], form")).toBeNull();
    expect(field("from").getAttribute("label")).toBe("From");
    expect(field("to").getAttribute("label")).toBe("To");
  });

  // A browser refuses an element whose constructor gives it attributes (createElement throws).
  it("is born with no attributes, and leaves the page like any element", () => {
    expect(document.createElement("ft-translate").attributes).toHaveLength(0);
    element.remove();
    expect(element.isConnected).toBe(false);
  });

  // 2026-10-20 (Ioan): every control is a real Ionic component in Ionic's own structure, with the
  // look of the Ionic the app lends; nothing drawn or styled by hand.
  it("draws only Ionic: an ion-page with ion-icons by name and no style of its own", async () => {
    await core.open({ text: "Guten Morgen" });
    expect(element.classList.contains("ion-page")).toBe(true);
    expect(element.querySelector("style, i, .i")).toBeNull();
    const icons = [...element.querySelectorAll("ion-icon")];
    expect(icons.length).toBeGreaterThan(0);
    for (const one of icons) expect(one.getAttribute("name")).toMatch(/-outline$/);
    expect(element.querySelector('[data-act="packs"] ion-icon[slot="icon-only"]').getAttribute("name")).toBe("download-outline");
    const say = element.querySelector(':scope > ion-footer > ion-toolbar > ion-buttons > ion-button[data-act="say"]');
    expect(say.getAttribute("fill")).toBe("solid");
    expect(say.querySelector('ion-icon[slot="start"]').getAttribute("name")).toBe("chatbubble-outline");
    expect(element.querySelector(':scope > ion-content ion-button[data-act="translate"]').getAttribute("expand")).toBe("block");
  });

  it("shows the translation in an Ionic card only once there is one, line breaks kept", async () => {
    core.kept.add("de");
    await core.open({ text: "Guten Morgen\nDanke" });
    expect(result()).toBeNull();
    await press("translate");
    expect(result().tagName).toBe("ION-CARD");
    expect(result().querySelector("ion-card-content [lang]").innerHTML).toBe("[de→en] Guten Morgen<br>Danke");
  });

  // 2026-10-20 (app#177, chat hooks, plan §8): the app runs the Translator hidden in the chat and
  // hands it the hook; it gives back a line under a message, a translated draft, or what to do on
  // its own in this chat. It only comes into view (`ft.show()`) to ask the user something.
  describe("in the chat's hooks", () => {
    it("registers for the chat's hooks when it loads", () => {
      expect(core.hooked()).toBe(1);
    });

    it("translates a held message into the app's language, without coming into view", async () => {
      core.kept.add("de");
      const answer = await core.hook({ name: "message", text: "Guten Morgen", lang: "en", ref: "r1" });
      expect(answer).toEqual({ text: "[de→en] Guten Morgen" });
      expect(core.ft.translate.detect).toHaveBeenCalledWith("Guten Morgen");
      expect(core.ft.translate.status).toHaveBeenCalledWith("de", "en");
      expect(core.ft.translate.translate).toHaveBeenCalledWith("Guten Morgen", "de", "en");
      expect(core.ft.show).not.toHaveBeenCalled();
      expect(core.ft.notify).not.toHaveBeenCalled();
      // On its own, too.
      expect(await core.hook({ name: "message", text: "Guten Morgen", lang: "en", manual: false })).toEqual({ text: "[de→en] Guten Morgen" });
    });

    it("gives nothing for a message already in the app's language, and says so only when asked", async () => {
      expect(await core.hook({ name: "message", text: "Hola", lang: "es" })).toBeNull();
      expect(core.ft.notify).toHaveBeenCalledWith(t("es", "same", { language: "español" }));
      expect(await core.hook({ name: "message", text: "Hola", lang: "es", manual: false })).toBeNull();
      expect(core.ft.notify).toHaveBeenCalledTimes(1);
      expect(core.ft.translate.status).not.toHaveBeenCalled();
      expect(core.ft.translate.translate).not.toHaveBeenCalled();
      expect(core.ft.show).not.toHaveBeenCalled();
    });

    it("comes into view before asking to download a language, and translates once it is there", async () => {
      const alertsWhenShown = [];
      core.ft.show.mockImplementation(() => alertsWhenShown.push(document.querySelector("ion-alert")));
      const run = core.hook({ name: "message", text: "Guten Morgen", lang: "es" });
      const asked = await answer("confirm");
      expect(alertsWhenShown).toEqual([null]);
      expect(asked.message).toBe(t("es", "downloadText", { from: "alemán", to: "español" }));
      expect(await run).toEqual({ text: "[de→es] Guten Morgen" });
      expect(core.ft.translate.prepare).toHaveBeenCalledWith("de", "es");
    });

    it("gives nothing when the user does not want the download", async () => {
      const run = core.hook({ name: "message", text: "Guten Morgen", lang: "es" });
      await answer("cancel");
      expect(await run).toBeNull();
      expect(core.ft.translate.prepare).not.toHaveBeenCalled();
      expect(core.ft.translate.translate).not.toHaveBeenCalled();
    });

    it("says so when the download fails, and gives nothing", async () => {
      core.ft.translate.prepare.mockResolvedValueOnce(false);
      const run = core.hook({ name: "message", text: "Guten Morgen", lang: "es" });
      await answer("confirm");
      expect(await run).toBeNull();
      expect(core.ft.notify).toHaveBeenCalledWith(t("es", "noDownload"));
    });

    it("never comes into view on its own: a run that needs a download gives nothing, quietly", async () => {
      expect(await core.hook({ name: "message", text: "Guten Morgen", lang: "es", manual: false })).toBeNull();
      expect(core.ft.show).not.toHaveBeenCalled();
      expect(core.ft.notify).not.toHaveBeenCalled();
      expect(core.ft.translate.prepare).not.toHaveBeenCalled();
      expect(document.querySelector("ion-alert")).toBeNull();
    });

    it("says it could not tell the language only when asked", async () => {
      expect(await core.hook({ name: "message", text: "Ciao a tutti" })).toBeNull();
      expect(core.ft.notify).toHaveBeenCalledWith("Could not tell the language of this text.");
      expect(await core.hook({ name: "message", text: "Ciao a tutti", manual: false })).toBeNull();
      expect(core.ft.notify).toHaveBeenCalledTimes(1);
    });

    it("says it could not translate only when asked, and survives a core that fails", async () => {
      core.kept.add("de");
      core.ft.translate.translate.mockResolvedValueOnce(null);
      expect(await core.hook({ name: "message", text: "Guten Morgen" })).toBeNull();
      expect(core.ft.notify).toHaveBeenCalledWith("Could not translate.");
      core.ft.translate.translate.mockRejectedValueOnce(new Error("gone"));
      expect(await core.hook({ name: "message", text: "Guten Morgen", manual: false })).toBeNull();
      expect(core.ft.notify).toHaveBeenCalledTimes(1);
    });

    it("never hands the core a text over 5 000 characters", async () => {
      const long = "Guten Morgen ".repeat(400);
      expect(await core.hook({ name: "message", text: long })).toBeNull();
      expect(core.ft.notify).toHaveBeenCalledWith("Too long to translate: 5,000 characters at most.");
      expect(await core.hook({ name: "message", text: long, manual: false })).toBeNull();
      expect(await core.hook({ name: "composer", text: long, manual: false })).toBeNull();
      expect(core.ft.notify).toHaveBeenCalledTimes(1);
      expect(core.ft.translate.detect).not.toHaveBeenCalled();
      expect(core.ft.translate.translate).not.toHaveBeenCalled();
    });

    it("gives nothing for an empty text or a hook it does not know", async () => {
      expect(await core.hook({ name: "message", text: "  " })).toBeNull();
      expect(await core.hook({ name: "reply", text: "Hola" })).toBeNull();
      expect(core.ft.translate.detect).not.toHaveBeenCalled();
    });

    it("translates the draft into the chat's language, without coming into view", async () => {
      core.kept.add("fr");
      keepFor(CHAT, { lang: "fr", message: true, composer: true });
      expect(await core.hook({ name: "composer", text: "Hello, see you tomorrow", lang: "es", manual: false })).toEqual({ text: "[en→fr] Hello, see you tomorrow" });
      expect(await core.hook({ name: "composer", text: "Hello, see you tomorrow", lang: "es" })).toEqual({ text: "[en→fr] Hello, see you tomorrow" });
      expect(core.ft.show).not.toHaveBeenCalled();
    });

    it("sends a draft already in the chat's language as it is, and says so when asked", async () => {
      keepFor(CHAT, { lang: "en", message: true, composer: true });
      expect(await core.hook({ name: "composer", text: "Hello there", lang: "es", manual: false })).toEqual({ text: "Hello there" });
      expect(await core.hook({ name: "composer", text: "Hello there", lang: "es" })).toBeNull();
      expect(core.ft.notify).toHaveBeenCalledWith(t("es", "same", { language: "inglés" }));
      expect(core.ft.translate.translate).not.toHaveBeenCalled();
    });

    it("asks for the chat's language when there is none, keeps it, and translates into it", async () => {
      const run = core.hook({ name: "composer", text: "Hello, see you tomorrow", lang: "es" });
      await settle();
      expect(core.ft.show).toHaveBeenCalledTimes(1);
      expect(field("pickLang").getAttribute("label")).toBe(t("es", "chatLanguage"));
      expect(optionsOf("pickLang")).toEqual([["de", "Alemán"], ["es", "Español"], ["fr", "Francés"], ["en", "Inglés"]]);
      await pick("pickLang", "de");
      await press("pickTranslate");
      await answer("confirm");
      expect(await run).toEqual({ text: "[en→de] Hello, see you tomorrow" });
      expect(keptFor(CHAT)).toEqual({ lang: "de", message: false, composer: false });
    });

    it("gives nothing when the user backs out of choosing the chat's language", async () => {
      const run = core.hook({ name: "composer", text: "Hello", lang: "es" });
      await settle();
      await press("pickCancel");
      expect(await run).toBeNull();
      expect(keptFor(CHAT)).toBeUndefined();
    });

    it("gives nothing on its own for a chat with no language, and keeps each chat apart", async () => {
      keepFor(OTHER, { lang: "fr", message: true, composer: true });
      expect(await core.hook({ name: "composer", text: "Hello", chat: CHAT, manual: false })).toBeNull();
      expect(core.ft.show).not.toHaveBeenCalled();
      expect(core.ft.translate.translate).not.toHaveBeenCalled();
    });

    it("sets the chat's language in Ionic's list, with both switches on once a language is chosen", async () => {
      const run = core.hook({ name: "chat", lang: "en" });
      await settle();
      expect(core.ft.show).toHaveBeenCalled();
      const list = element.querySelector(":scope > ion-content > ion-list");
      expect(list.querySelector("ion-item > ion-select[data-field='chatLang']").getAttribute("label")).toBe("Chat language");
      expect(optionsOf("chatLang")[0]).toEqual(["", "None"]);
      expect(field("chatLang").value).toBe("");
      expect(list.querySelector("ion-item > ion-toggle[data-field='autoMessage']").textContent).toBe("Translate what I receive");
      expect(list.querySelector("ion-item > ion-toggle[data-field='autoComposer']").textContent).toBe("Translate what I send");
      expect(field("autoMessage").checked).toBe(false);
      expect(field("autoMessage").disabled).toBe(true);
      expect(element.querySelector(":scope > ion-content").textContent).toContain("30 MB");
      // Nothing to translate here: the standalone window's text is not drawn.
      expect(field("text")).toBeNull();

      await pick("chatLang", "fr");
      expect(field("autoMessage").checked).toBe(true);
      expect(field("autoComposer").checked).toBe(true);
      expect(field("autoMessage").disabled).toBe(false);
      const save = element.querySelector(':scope > ion-footer > ion-toolbar > ion-buttons > ion-button[data-act="chatSave"]');
      expect(save.getAttribute("fill")).toBe("solid");
      expect(save.querySelector("ion-icon[slot='start']")).not.toBeNull();
      await press("chatSave");
      await answer("confirm");
      expect(core.ft.translate.prepare).toHaveBeenCalledWith("fr", "en");
      expect(await run).toEqual({ auto: { message: true, composer: true } });
      expect(keptFor(CHAT)).toEqual({ lang: "fr", message: true, composer: true });
    });

    it("shows what the chat has, and saves a switch turned off", async () => {
      keepFor(CHAT, { lang: "es", message: true, composer: true });
      const run = core.hook({ name: "chat", lang: "en" });
      await settle();
      expect(field("chatLang").value).toBe("es");
      expect(field("autoComposer").checked).toBe(true);
      await flip("autoComposer", false);
      await press("chatSave");
      expect(await run).toEqual({ auto: { message: true, composer: false } });
      expect(keptFor(CHAT)).toEqual({ lang: "es", message: true, composer: false });
      // English and Spanish are on the phone already: nothing to download.
      expect(core.ft.translate.prepare).not.toHaveBeenCalled();
    });

    it("keeps nothing when the user does not want the chat's language downloaded", async () => {
      const run = core.hook({ name: "chat", lang: "en" });
      let done = false;
      run.then(() => (done = true));
      await settle();
      await pick("chatLang", "de");
      await press("chatSave");
      await answer("cancel");
      expect(done).toBe(false);
      expect(keptFor(CHAT)).toBeUndefined();
      expect(core.ft.translate.prepare).not.toHaveBeenCalled();
    });

    it("removes the chat's language and turns both off", async () => {
      keepFor(CHAT, { lang: "fr", message: true, composer: true });
      const run = core.hook({ name: "chat", lang: "en" });
      await settle();
      await press("chatRemove");
      expect(await run).toEqual({ auto: { message: false, composer: false } });
      expect(keptFor(CHAT)).toBeUndefined();
    });

    it("draws the chat's settings when the app opens the window for the chat hook", async () => {
      keepFor(CHAT, { lang: "fr", message: true, composer: false });
      await core.open({ hook: "chat", chat: CHAT, lang: "es" });
      expect(field("chatLang").value).toBe("fr");
      expect(field("autoComposer").checked).toBe(false);
      expect(field("text")).toBeNull();
    });

    it("keeps its hook screen when the app says which hook it is in view for", async () => {
      const run = core.hook({ name: "message", text: "Guten Morgen", lang: "es" });
      await settle();
      await core.open({ hook: "message", chat: CHAT, lang: "es" });
      expect(field("text")).toBeNull();
      await answer("cancel");
      expect(await run).toBeNull();
    });
  });
});

describe("the package", () => {
  const dist = join(HERE, "dist");
  const files = readdirSync(dist);

  // Ionic is the app's, lent to the frame: a copy in the package would be a second one, and heavy.
  it("carries no Ionic of its own", () => {
    for (const file of files) {
      const code = readFileSync(join(dist, file), "utf8");
      expect(code, file).not.toMatch(/@ionic\/core|ionicframework|stencil|defineCustomElement|__registerHost/i);
      expect(code, file).not.toMatch(/^\s*import\s.*from\s+["'](?!\.\/)/m);
    }
  });

  // Small: it is plain code, no library.
  it("stays under 128 KiB", () => {
    const bytes = files.reduce((sum, file) => sum + statSync(join(dist, file)).size, 0);
    expect(bytes).toBeLessThanOrEqual(128 * 1024);
  });

  // The frame has no forms on Android and no browser dialogs anywhere.
  it("uses no form and no browser dialog", () => {
    const code = readFileSync(join(dist, "index.js"), "utf8");
    expect(code).not.toMatch(/<form|\bconfirm\(|\bprompt\(|\balert\(/);
  });

  // The look is the lent Ionic's (2026-10-20, Ioan): no style sheet, inline style or hand-drawn icon.
  it("styles nothing by hand", () => {
    const code = readFileSync(join(dist, "index.js"), "utf8");
    expect(code).not.toMatch(/<style|style="|class="i"|mask:/);
  });

  // The Ionicons app 1.6.0 registers by name in the frame: the ones the core serves at ./icon/ and
  // the ones a plugin may name for its tile. Any other name would draw nothing.
  const LENT = [
    "add-outline", "alarm-outline", "albums-outline", "apps-outline", "arrow-back-outline", "arrow-redo-outline",
    "arrow-undo-outline", "arrow-up-outline", "basket-outline", "boat-outline", "book-outline", "brush-outline",
    "calculator-outline", "calendar-outline", "camera-outline", "chatbubble-outline", "checkbox-outline",
    "checkmark-outline", "close-outline", "cloud-done-outline", "cloud-outline", "cloud-upload-outline",
    "code-slash-outline", "color-palette-outline", "construct-outline", "contrast-outline", "crop-outline",
    "cube-outline", "cut-outline", "dice-outline", "document-outline", "document-text-outline", "download-outline",
    "easel-outline", "ellipse-outline", "ellipsis-horizontal-outline", "expand-outline", "extension-puzzle-outline",
    "eye-off-outline", "eye-outline", "folder-open-outline", "folder-outline", "game-controller-outline",
    "grid-outline", "hand-left-outline", "image-outline", "key-outline", "language-outline", "link-outline",
    "list-outline", "location-outline", "lock-closed-outline", "map-outline", "mic-outline", "move-outline",
    "musical-notes-outline", "options-outline", "pause-outline", "pencil-outline", "play-outline", "qr-code-outline",
    "radio-button-on-outline", "reader-outline", "refresh-outline", "remove-outline", "resize-outline", "save-outline",
    "scan-outline", "search-outline", "send-outline", "shield-outline", "sparkles-outline", "square-outline",
    "stats-chart-outline", "text-outline", "time-outline", "timer-outline", "trash-outline", "trophy-outline",
  ];

  it("names only icons the app lends", () => {
    const code = readFileSync(join(dist, "index.js"), "utf8");
    const named = [...new Set([...code.matchAll(/"([a-z0-9]+(?:-[a-z0-9]+)*-outline)"/g)].map(([, name]) => name))];
    expect(named.length).toBeGreaterThan(0);
    for (const name of named) expect(LENT, name).toContain(name);
    expect(LENT).toContain(manifest.icon);
  });
});
