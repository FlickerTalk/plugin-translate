// Translator for FlickerTalk (app#177): a message the user hands over, or their own draft,
// translated on the phone. The plugin only talks to the core (`ft.translate`), which asks the
// phone's own translator: iOS on iPhone, Google's ML Kit built into the app on Android. The text
// never leaves the phone, and the plugin has no network. It keeps the last language it translated
// into and, for each chat, the chat's language and whether to translate on its own.
//
// From 1.1.0 it binds to the chat's hooks (plan §8): Translate on a received message (its text,
// translated) and in the composer (the draft, translated), and the chat's language, told from what
// was received or chosen on its page. The app runs it hidden. A download is a question the app asks
// in its alert (`ask`), then runs the hook again with the answer; the window comes into view
// (`ft.show()`) only for the chat's page and to pick a language.

import { t } from "./i18n.js";

/** The "From" choice that lets the phone tell the language of the text. */
export const AUTO = "auto";

/** The longest text the core translates: about one message (characters, not UTF-16 halves). */
export const MAX_CHARS = 5000;

/** Whether a text is longer than the core takes. */
export function tooLong(text) {
  return [...String(text ?? "")].length > MAX_CHARS;
}

/** The language the phone writes names in: the app's, or English if it cannot write that one. */
function writtenIn(lang) {
  try {
    return Intl.DisplayNames.supportedLocalesOf([lang]).length > 0 ? lang : "en";
  } catch {
    return "en";
  }
}

/** The phone's namers of languages, one per language they write in, made once each. */
const NAMERS = new Map();

/** The phone's own name for a language, in a language it can write; undefined if it has none. */
function nameOf(tag, locale) {
  try {
    if (!NAMERS.has(locale)) NAMERS.set(locale, new Intl.DisplayNames([locale], { type: "language", fallback: "none" }));
    return NAMERS.get(locale).of(tag) || undefined;
  } catch {
    return undefined;
  }
}

/** A language's name as the phone writes it inside a sentence of the app's language (English if
 *  the phone cannot write that one): `alemán` in Spanish, `German` in English. The tag itself when
 *  the phone has no name for it. */
export function languageWord(tag, lang = "en") {
  return nameOf(tag, writtenIn(lang)) ?? String(tag);
}

/** A language's name as a list shows it: the phone's word, with a capital letter; the tag itself,
 *  as it is, when the phone has no name for it. */
export function languageName(tag, lang = "en") {
  const locale = writtenIn(lang);
  const name = nameOf(tag, locale);
  if (!name) return String(tag);
  const [first, ...rest] = name;
  return `${first.toLocaleUpperCase(locale)}${rest.join("")}`;
}

/** The languages as a list shows them: each with its name, in the order of the names. */
export function sortLanguages(tags, lang = "en") {
  return tags
    .map((tag) => ({ tag, name: languageName(tag, lang) }))
    .sort((a, b) => a.name.localeCompare(b.name, writtenIn(lang)));
}

/** The script a region writes Chinese in, for a tag such as `zh-TW`. */
const REGION_SCRIPT = { tw: "hant", hk: "hant", mo: "hant", cn: "hans", sg: "hans" };

/** A tag's script, written or implied: its script subtag (`zh-Hant`, `sr-Latn`), else for Chinese
 *  the one its region writes (`zh-TW` → Traditional) or Simplified for `zh` alone, as iOS and ML
 *  Kit mean it. Undefined when the tag says none. */
function scriptOf(subtags) {
  const [primary, ...rest] = subtags;
  const written = rest.find((part) => /^[a-z]{4}$/.test(part));
  if (written) return written;
  if (primary !== "zh") return undefined;
  const region = rest.find((part) => /^[a-z]{2}$/.test(part));
  return region ? REGION_SCRIPT[region] : "hans";
}

/**
 * The tag of `languages` that stands for `wanted` (the app's language, or a detected one), in this
 * order: the same tag (`zh-TW`); else an equivalent one, same language in the same script
 * (`zh-Hant` ≡ `zh-TW`, `zh-Hans` ≡ `zh` ≡ `zh-CN`); else the language alone; else any tag of the
 * same language (`en` → `en-GB`, `pt` → `pt-BR`). Null when this phone has none.
 */
export function matchLanguage(languages, wanted) {
  if (!wanted) return null;
  const subtags = (tag) => String(tag).toLowerCase().split(/[-_]/);
  const want = subtags(wanted);
  const same = languages.filter((tag) => subtags(tag)[0] === want[0]);
  const script = scriptOf(want);
  return (
    same.find((tag) => subtags(tag).join("-") === want.join("-")) ??
    (script ? same.find((tag) => scriptOf(subtags(tag)) === script) : undefined) ??
    same.find((tag) => subtags(tag).length === 1) ??
    same[0] ??
    null
  );
}

/**
 * Where a translation goes when the user has not picked: the app's language for a message they
 * were handed (they want to read it), the last language they used for their own text (the
 * contact's, most likely), then English, then the first there is; never the language the text is
 * already in while there is another.
 */
export function defaultTarget(languages, { lang, kept, source, fromMessage }) {
  const app = matchLanguage(languages, lang);
  const last = kept && languages.includes(kept) ? kept : null;
  const order = fromMessage ? [app, last] : [last, app];
  const candidates = [...order, matchLanguage(languages, "en"), ...languages].filter(Boolean);
  return candidates.find((tag) => tag !== source) ?? candidates[0] ?? null;
}

/** "Swap": the translation becomes the text, and the languages go round, the one the phone
 *  detected included. */
export function swapped({ from, detected, to, text, result }) {
  return { from: to, to: from === AUTO ? detected : from, text: result, result: text };
}

/** Where the last language translated into is kept (`ft.store`). */
const KEPT = "to";

/** Where a chat's settings are kept: one record per chat (`ft.records`), by the chat's opaque key.
 *  Not `ft.store`, which holds 64 keys: one per chat would run out. */
const chatRecord = (chat) => `chat:${chat}`;

/** A call to the core that never throws: what the core said, or `fallback` if it said nothing or
 *  failed. The core already answers a refusal with the neutral value; this covers the rest. */
async function call(work, fallback) {
  try {
    return (await work()) ?? fallback;
  } catch {
    return fallback;
  }
}

/** A number as the app's language writes it (`5,000`, `5.000`). */
function count(value, lang) {
  return new Intl.NumberFormat(writtenIn(lang)).format(value);
}

/** A chat's settings, `{ lang, message, composer }`, or null when it has none (or they cannot be
 *  read). */
async function readChat(chat) {
  if (!chat) return null;
  const raw = await call(() => globalThis.ft.records.get(chatRecord(chat)), null);
  try {
    const kept = JSON.parse(raw);
    if (!kept || typeof kept.lang !== "string" || !kept.lang) return null;
    return { lang: kept.lang, message: kept.message === true, composer: kept.composer === true };
  } catch {
    return null;
  }
}

function writeChat(chat, settings) {
  return call(() => globalThis.ft.records.set(chatRecord(chat), JSON.stringify(settings)), false);
}

function forgetChat(chat) {
  return call(() => globalThis.ft.records.forget(chatRecord(chat)), false);
}

/** What the hooks turn on when the chat has no language, or it is removed. */
const OFF = { message: false, composer: false };

const escape = (text) =>
  String(text).replace(/[&<>"']/g, (one) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[one]);

// Ionic draws everything (the app lends it to the frame from 1.6.0; this plugin needs 1.7.0): the
// element is an `ion-page` with Ionic's header, content and footer, every control is an Ionic
// component and every icon an `ion-icon` the app registers by name. No style of its own: the look
// is the lent Ionic's, with the app's colours.

/** An Ionicon the app lends, by name. Hidden from screen readers: the button carries the label. */
const icon = (name, slot = "icon-only") => `<ion-icon${slot ? ` slot="${slot}"` : ""} name="${name}" aria-hidden="true"></ion-icon>`;
/** An Ionic button with an icon only, in a toolbar. */
const button = (act, label, name) => `<ion-button data-act="${act}" aria-label="${escape(label)}">${icon(name)}</ion-button>`;
/** A text with its line breaks, safe to put in the page. */
const lines = (text) => escape(text).replace(/\n/g, "<br>");

/** The plugin's view: the text and its translation, or the languages downloaded on this phone. */
class Translator extends HTMLElement {
  constructor() {
    super();
    // No attributes here: a browser refuses an element whose constructor sets one (`lang`, `title`,
    // `translate` and `hidden` are attributes too, hence the names below).
    this.language = "en";
    this.screen = "loading";
    this.languages = [];
    this.text = "";
    this.from = AUTO;
    this.to = null;
    this.detected = null;
    this.detectedFor = null;
    this.result = null;
    this.working = null;
    this.warning = "";
    this.packs = null;
    this.acting = false;
    // The chat's hooks (1.1.0): the chat it is for, its settings on the chat's page, the hook run
    // the window is in view for, and the answers the user is asked for.
    this.chat = null;
    this.chatFor = null;
    this.chatSaved = null;
    this.chatLang = "";
    this.autoMessage = false;
    this.autoComposer = false;
    this.inView = false;
    this.pending = null;
    this.picking = null;
    this.pickLang = null;
  }

  connectedCallback() {
    // In the page, not in a shadow root: the frame holds only this plugin, and Ionic's global
    // styles do not cross a shadow boundary. An Ionic page: header, content and footer.
    this.classList.add("ion-page");
    this.addEventListener("click", (event) => this.onClick(event));
    this.addEventListener("ionChange", (event) => this.onChange(event));
    this.addEventListener("ionInput", (event) => this.onChange(event));
    globalThis.ft?.onOpen?.((opening) => this.onOpen(opening));
    globalThis.ft?.onHook?.((hook) => this.onHook(hook));
    this.paint();
  }

  /** A text in the language of the app, with its `{name}`s filled in. */
  words(key, values) {
    return t(this.language, key, values);
  }

  /** What the app hands over: its language, and the text of a message if it was opened with one.
   *  Then what this phone can translate, and where to by default. */
  async onOpen(opening) {
    this.language = opening.lang || "en";
    if (opening.chat) this.chat = opening.chat;
    if (opening.hook === "chat") return this.openChat(this.chat);
    // In view for a hook run (after `ft.show()`): its own screen stays.
    if (opening.hook || this.inView) return;
    this.text = String(opening.text ?? "");
    this.from = AUTO;
    this.detected = null;
    this.detectedFor = null;
    this.result = null;
    this.warning = "";
    this.working = null;
    const translator = globalThis.ft?.translate;
    const languages = translator ? await call(() => translator.languages(), []) : [];
    this.languages = Array.isArray(languages) ? languages.filter((tag) => typeof tag === "string" && tag) : [];
    if (this.inView) return;
    if (this.languages.length === 0) return this.show("cannot");
    const fromMessage = this.text.trim().length > 0;
    const kept = await call(() => globalThis.ft.store.get(KEPT), null);
    if (fromMessage) await this.detectFor(this.text);
    this.to = defaultTarget(this.languages, { lang: this.language, kept, source: this.detected, fromMessage });
    if (this.inView) return;
    this.show("main");
  }

  /** The languages this phone translates, asked once. */
  async loadLanguages() {
    if (this.languages.length > 0) return this.languages;
    const translator = globalThis.ft?.translate;
    const languages = translator ? await call(() => translator.languages(), []) : [];
    this.languages = Array.isArray(languages) ? languages.filter((tag) => typeof tag === "string" && tag) : [];
    return this.languages;
  }

  /**
   * One run of a chat's hook (`ft.onHook`): `message` gives the line under a held message,
   * `composer` the draft in the chat's language, `chat` what to translate on its own in this chat.
   * Null when there is nothing to show or keep. It never throws, and a run the app started on its
   * own (`manual: false`) never comes into view and never says anything.
   */
  async onHook(hook) {
    const run = { manual: hook?.manual === true, up: false };
    try {
      this.language = hook?.lang || this.language || "en";
      if (hook?.chat) this.chat = hook.chat;
      if (hook?.name === "message") return await this.hookMessage(hook, run);
      if (hook?.name === "composer") return await this.hookComposer(hook, run);
      if (hook?.name === "chat") return run.manual ? await this.hookChat(hook, run) : await this.chatLanguage(hook);
      return null;
    } catch {
      return null;
    } finally {
      if (run.up) this.inView = false;
    }
  }

  /** Comes into view for this run, once, before drawing anything the user must see. */
  comeUp(run) {
    if (run.up) return;
    run.up = true;
    this.inView = true;
    globalThis.ft?.show?.();
  }

  /** A short notice in the app's own toast (`ft.notify`), with no window: only when the user
   *  started the run. Always null, the answer of a run that says it. */
  tell(run, key, values) {
    if (run.manual) globalThis.ft?.notify?.(this.words(key, values));
    return null;
  }

  /** Whether a hook's text can go to the core: not empty, and not more than it takes. */
  checkText(run, text) {
    if (!text.trim()) return false;
    if (!tooLong(text)) return true;
    this.tell(run, "tooLong", { max: count(MAX_CHARS, this.language) });
    return false;
  }

  /** The language of a text, as the phone tells it, matched to one this phone has; null if not. */
  async detectIn(text, languages) {
    const said = await call(() => globalThis.ft.translate.detect(text), null);
    return typeof said === "string" ? matchLanguage(languages, said) : null;
  }

  /** The line under a held message: detect → status → (download, in view, once the user says so)
   *  → translate, into the app's language. */
  async hookMessage(hook, run) {
    const text = String(hook.text ?? "");
    if (!this.checkText(run, text)) return null;
    const languages = await this.loadLanguages();
    if (languages.length === 0) return this.tell(run, "cannot");
    const from = await this.detectIn(text, languages);
    if (!from) return this.tell(run, "notDetected");
    const to = matchLanguage(languages, this.language);
    if (!to) return this.tell(run, "unsupported");
    if (from === to) return this.tell(run, "same", { language: languageWord(from, this.language) });
    return this.translateFor(hook, run, text, { from, to, foreign: from, asks: run.manual });
  }

  /** The draft in the chat's language. A chat with none: the user picks it (in view), and it is
   *  kept for the chat; on its own, nothing. A draft already in it goes as it is. */
  async hookComposer(hook, run) {
    const text = String(hook.text ?? "");
    if (!this.checkText(run, text)) return null;
    const languages = await this.loadLanguages();
    if (languages.length === 0) return this.tell(run, "cannot");
    const kept = await readChat(hook.chat);
    let to = kept && languages.includes(kept.lang) ? kept.lang : null;
    if (!to) {
      if (!run.manual) return null;
      this.comeUp(run);
      to = await this.pickChatLanguage();
      if (!to) return null;
      await writeChat(hook.chat, { lang: to, ...OFF });
    }
    const from = (await this.detectIn(text, languages)) ?? matchLanguage(languages, this.language);
    if (!from) return this.tell(run, "notDetected");
    if (from === to) return run.manual ? this.tell(run, "same", { language: languageWord(to, this.language) }) : { text };
    // The user pressed send or the button: a download is asked either way.
    return this.translateFor(hook, run, text, { from, to, foreign: to, asks: true });
  }

  /** The chat's language, told on its own from the last texts received (`manual: false`): the one
   *  the user chose if there is one, else the one the phone tells, kept for the chat. No window
   *  and no download. */
  async chatLanguage(hook) {
    const languages = await this.loadLanguages();
    if (languages.length === 0) return null;
    const kept = await readChat(hook.chat);
    if (kept && languages.includes(kept.lang)) return { lang: kept.lang };
    const text = [...String(hook.text ?? "")].slice(0, MAX_CHARS).join("");
    if (!text.trim()) return null;
    const lang = await this.detectIn(text, languages);
    if (!lang) return null;
    await writeChat(hook.chat, { lang, ...OFF });
    return { lang };
  }

  /** The chat's page, in view: its language and the two switches; the answer is what to do on its
   *  own in this chat, once the user saves or removes it. */
  async hookChat(hook, run) {
    const languages = await this.loadLanguages();
    if (languages.length === 0) return this.tell(run, "cannot");
    this.comeUp(run);
    const answer = new Promise((resolve) => (this.pending = resolve));
    await this.openChat(hook.chat);
    return answer;
  }

  /** status → (a download the app asks about, then a second run with the answer) → translate.
   *  `{ text }`, `{ ask }` or null. The question names the `foreign` language: the message's, or
   *  the chat's for a draft. */
  async translateFor(hook, run, text, { from, to, foreign, asks }) {
    const translator = globalThis.ft.translate;
    const state = await call(() => translator.status(from, to), "unsupported");
    if (state !== "installed" && state !== "downloadable") return this.tell(run, "unsupported");
    if (state === "downloadable") {
      if (hook.answer !== true) {
        if (!asks) return null;
        return { ask: { text: this.words("downloadAsk", { language: languageWord(foreign, this.language) }) } };
      }
      const ready = await call(() => translator.prepare(from, to), false);
      if (ready !== true) return this.tell(run, "noDownload");
    }
    const translated = await call(() => translator.translate(text, from, to), null);
    if (typeof translated !== "string" || !translated) return this.tell(run, "failed");
    return { text: translated };
  }

  /** Asks for the chat's language, in view; the tag, or null when the user backs out. */
  async pickChatLanguage() {
    const kept = await call(() => globalThis.ft.store.get(KEPT), null);
    const app = matchLanguage(this.languages, this.language);
    this.pickLang = defaultTarget(this.languages, { lang: this.language, kept, source: app, fromMessage: false });
    const answer = new Promise((resolve) => (this.picking = resolve));
    this.show("pick");
    return answer;
  }

  /** The chat's page, with what the chat has. Drawn once per chat. */
  async openChat(chat) {
    if (this.chatFor === chat && (this.screen === "chat" || this.screen === "loading")) return;
    this.chatFor = chat;
    this.chat = chat;
    this.show("loading");
    const languages = await this.loadLanguages();
    if (languages.length === 0) return this.show("cannot");
    const kept = await readChat(chat);
    this.chatSaved = kept;
    this.chatLang = kept && languages.includes(kept.lang) ? kept.lang : "";
    this.autoMessage = Boolean(this.chatLang && kept.message);
    this.autoComposer = Boolean(this.chatLang && kept.composer);
    this.working = null;
    this.warning = "";
    this.show("chat");
  }

  /** Save: the chat's language and switches, after the languages the switches need are on the
   *  phone (asked once, like any download). */
  async saveChat() {
    const lang = this.chatLang;
    if (!lang) return this.removeChat();
    const app = matchLanguage(this.languages, this.language);
    const pairs = [];
    if (app && app !== lang) {
      if (this.autoMessage) pairs.push([lang, app]);
      if (this.autoComposer) pairs.push([app, lang]);
    }
    const translator = globalThis.ft.translate;
    const states = await Promise.all(pairs.map(([from, to]) => call(() => translator.status(from, to), "unsupported")));
    if (states.some((state) => state !== "installed" && state !== "downloadable")) return this.warn("unsupported");
    if (states.includes("downloadable")) {
      if (!(await this.agreeToDownload(lang, app))) return this.paintState();
      this.busy("downloading");
      for (const [from, to] of pairs) {
        const state = await call(() => translator.status(from, to), "unsupported");
        if (state === "downloadable" && (await call(() => translator.prepare(from, to), false)) !== true) {
          this.working = null;
          return this.warn("noDownload");
        }
      }
      this.busy(null);
    }
    const settings = { lang, message: this.autoMessage, composer: this.autoComposer };
    await writeChat(this.chat, settings);
    this.chatSaved = settings;
    this.finishChat({ lang, auto: { message: settings.message, composer: settings.composer } });
  }

  /** Remove: the chat has no language any more, and nothing is translated on its own. */
  async removeChat() {
    await forgetChat(this.chat);
    this.chatSaved = null;
    this.finishChat({ lang: null, auto: { ...OFF } });
  }

  /** Hands the chat hook its answer; with no run waiting (the window opened alone), closes. */
  finishChat(answer) {
    const resolve = this.pending;
    this.pending = null;
    this.chatFor = null;
    if (resolve) resolve(answer);
    else globalThis.ft?.close?.();
  }

  show(screen) {
    this.screen = screen;
    this.paint();
  }

  /** The language of the text, as the phone tells it, matched to one this phone translates; asked
   *  once for each text. Null when it cannot tell (or the text is more than the core takes). */
  async detectFor(text) {
    if (this.detectedFor === text) return this.detected;
    const said = tooLong(text) ? null : await call(() => globalThis.ft.translate.detect(text), null);
    this.detected = typeof said === "string" ? matchLanguage(this.languages, said) : null;
    this.detectedFor = text;
    this.paintDetected();
    return this.detected;
  }

  /** One tap at a time: a second tap while the first is still being done does nothing. */
  async onClick(event) {
    const target = event.target.closest?.("[data-act]");
    if (!target || !this.contains(target) || this.acting || target.disabled) return;
    this.acting = true;
    try {
      await this.act(target.dataset.act, target.dataset.key);
    } finally {
      this.acting = false;
    }
  }

  async act(act, key) {
    if (act === "translate") await this.run();
    else if (act === "say" && this.result) globalThis.ft.say(this.result.text);
    else if (act === "swap") await this.swap();
    else if (act === "packs") await this.listPacks();
    else if (act === "erase") await this.erase(key);
    else if (act === "back") this.show("main");
    else if (act === "chatSave") await this.saveChat();
    else if (act === "chatRemove") await this.removeChat();
    else if (act === "pickTranslate" || act === "pickCancel") {
      const resolve = this.picking;
      this.picking = null;
      resolve?.(act === "pickTranslate" ? this.pickLang || null : null);
    }
  }

  /** What Ionic's selects and text area say: a language picked, or the text typed. A translation
   *  that no longer matches them goes. */
  async onChange(event) {
    const name = event.target?.dataset?.field;
    if (!name) return;
    if (this.screen === "chat") return this.onChatChange(name, event);
    if (this.screen === "pick") {
      if (name === "pickLang") this.pickLang = event.detail?.value ?? event.target.value ?? null;
      return;
    }
    if (this.screen !== "main") return;
    const value = event.detail?.value ?? event.target.value ?? "";
    if (name === "text") {
      if (value === this.text) return;
      this.text = String(value);
      if (this.detectedFor !== null && this.detectedFor !== this.text) {
        this.detected = null;
        this.detectedFor = null;
        this.paintDetected();
      }
    } else if (name === "from" && value !== this.from) this.from = value;
    else if (name === "to" && value !== this.to) {
      this.to = value;
      await call(() => globalThis.ft.store.set(KEPT, value), false);
    } else return;
    this.result = null;
    this.warning = "";
    this.paintState();
  }

  /** The chat's page: choosing a language switches both on; none switches both off. */
  onChatChange(name, event) {
    if (name === "chatLang") {
      const value = String(event.detail?.value ?? event.target.value ?? "");
      if (value === this.chatLang) return;
      const had = this.chatLang;
      this.chatLang = value;
      if (!value) this.autoMessage = this.autoComposer = false;
      else if (!had) this.autoMessage = this.autoComposer = true;
    } else if (name === "autoMessage" || name === "autoComposer") {
      this[name] = Boolean(event.detail?.checked ?? event.target.checked);
    } else return;
    this.warning = "";
    this.paintState();
  }

  /** Translate: detect → status → (download, once the user says so) → translate (app#177). */
  async run() {
    const text = this.text;
    if (!text.trim()) return;
    this.result = null;
    this.warning = "";
    if (tooLong(text)) return this.warn("tooLong", { max: count(MAX_CHARS, this.language) });
    const from = this.from === AUTO ? await this.detectFor(text) : this.from;
    const to = this.to;
    if (!from) return this.warn("unknown");
    if (from === to) return this.warn("same", { language: languageWord(from, this.language) });
    const translator = globalThis.ft.translate;
    const state = await call(() => translator.status(from, to), "unsupported");
    if (state !== "installed" && state !== "downloadable") return this.warn("unsupported");
    if (state === "downloadable") {
      if (!(await this.agreeToDownload(from, to))) return this.paintState();
      this.busy("downloading");
      const ready = await call(() => translator.prepare(from, to), false);
      this.busy(null);
      if (ready !== true) return this.warn("noDownload");
    }
    this.busy("translating");
    const translated = await call(() => translator.translate(text, from, to), null);
    this.busy(null);
    if (typeof translated !== "string" || !translated) return this.notice(this.words("failed"));
    this.result = { text: translated, to };
    this.paintState();
  }

  /** Asks once, in the app's Ionic alert, before the phone downloads a language: how big, where
   *  from, and that the text stays. */
  async agreeToDownload(from, to) {
    const role = await this.ask({
      header: this.words("downloadTitle"),
      message: this.words("downloadText", { from: languageWord(from, this.language), to: languageWord(to, this.language) }),
      buttons: [
        { text: this.words("cancel"), role: "cancel" },
        { text: this.words("download"), role: "confirm" },
      ],
    });
    return role === "confirm";
  }

  /** Swap: the translation becomes the text, and the languages go round. */
  async swap() {
    if (!this.result) return;
    const next = swapped({ from: this.from, detected: this.detected, to: this.to, text: this.text, result: this.result.text });
    if (!next.to) return;
    Object.assign(this, { from: next.from, to: next.to, text: next.text, detected: null, detectedFor: null, warning: "" });
    this.result = { text: next.result, to: next.to };
    await call(() => globalThis.ft.store.set(KEPT, next.to), false);
    this.paintValues();
  }

  /** The languages downloaded on this phone, each with the way to remove it. The state is per pair
   *  (that is how iOS gives it), so each is asked with the pivot: English, as ML Kit has it. */
  async listPacks() {
    this.packs = null;
    this.show("packs");
    const pivot = this.pivot();
    const others = this.languages.filter((tag) => tag !== pivot);
    const states = await Promise.all(others.map((tag) => call(() => globalThis.ft.translate.status(tag, pivot), "unsupported")));
    this.packs = others.filter((tag, index) => states[index] === "installed");
    if (this.screen === "packs") this.paint();
  }

  pivot() {
    return matchLanguage(this.languages, "en") ?? this.languages[0];
  }

  /** Removes a downloaded language, after asking once. On iPhone iOS keeps them, in its Settings. */
  async erase(tag) {
    if (!tag || !this.packs?.includes(tag)) return;
    const role = await this.ask({
      header: languageName(tag, this.language),
      message: this.words("removeAsk"),
      buttons: [
        { text: this.words("cancel"), role: "cancel" },
        { text: this.words("remove"), role: "destructive" },
      ],
    });
    if (role !== "destructive") return;
    if (await call(() => globalThis.ft.translate.remove(tag, this.pivot()), false)) {
      this.packs = this.packs.filter((one) => one !== tag);
      this.paint();
      this.notice(this.words("removed", { language: languageWord(tag, this.language) }));
    } else this.notice(this.words("notRemoved"));
  }

  /** The app's Ionic alert (the frame has no browser dialogs); the role of the button tapped. */
  async ask(options) {
    const alerts = globalThis.ftIonic?.alertController;
    if (!alerts) return null;
    const alert = await alerts.create(options);
    await alert.present();
    return (await alert.onDidDismiss()).role ?? null;
  }

  /** A short notice in the app's Ionic toast, or on the screen if there is none. */
  notice(text) {
    const toasts = globalThis.ftIonic?.toastController;
    if (!toasts) return this.warn(null, text);
    toasts
      .create({ message: text, duration: 2500, position: "top" })
      .then((toast) => toast.present())
      .catch(() => {});
  }

  warn(key, values) {
    this.warning = key ? this.words(key, values) : String(values ?? "");
    this.paintState();
  }

  busy(working) {
    this.working = working;
    this.paintState();
  }

  paint() {
    if (this.screen === "main") this.paintMain();
    else if (this.screen === "packs") this.paintPacks();
    else if (this.screen === "cannot") this.paintCannot();
    else if (this.screen === "chat") this.paintChat();
    else if (this.screen === "pick") this.paintPick();
    else this.innerHTML = `<ion-content class="ion-padding ion-text-center"><ion-spinner aria-hidden="true"></ion-spinner></ion-content>`;
  }

  paintCannot() {
    this.innerHTML = `<ion-content class="ion-padding ion-text-center">
        ${icon("language-outline", "")}
        <ion-text color="medium"><p class="cannot">${escape(this.words("cannot"))}</p></ion-text>
      </ion-content>`;
  }

  /** The text, the two languages and the translation. Drawn once per screen; what changes after
   *  is set on the elements Ionic already drew, so nothing flashes and the keyboard stays. */
  paintMain() {
    const select = (name, auto) => this.languageSelect(name, this.words(name), auto);
    this.innerHTML = `<ion-header><ion-toolbar>
        <ion-buttons slot="end">${button("packs", this.words("packs"), "download-outline")}</ion-buttons>
      </ion-toolbar></ion-header>
      <ion-content class="ion-padding">
        <ion-list class="ion-margin-bottom">
          <ion-item>${select("from", `<ion-select-option value="${AUTO}"></ion-select-option>`)}</ion-item>
          <ion-item>${select("to", "")}</ion-item>
        </ion-list>
        <ion-textarea class="ion-margin-bottom" data-field="text" label="${escape(this.words("text"))}" label-placement="stacked" fill="outline" auto-grow="true" rows="4" maxlength="${MAX_CHARS}" counter="true" dir="auto"></ion-textarea>
        <ion-button expand="block" data-act="translate">${icon("language-outline", "start")}${escape(this.words("translate"))}</ion-button>
        <div class="status" role="status" aria-live="polite"></div>
        <div class="answer"></div>
      </ion-content>
      <ion-footer><ion-toolbar>
        <ion-buttons slot="start"><ion-button data-act="swap">${icon("refresh-outline", "start")}${escape(this.words("swap"))}</ion-button></ion-buttons>
        <ion-buttons slot="end"><ion-button fill="solid" color="primary" data-act="say">${icon("chatbubble-outline", "start")}${escape(this.words("useInChat"))}</ion-button></ion-buttons>
      </ion-toolbar></ion-footer>`;
    this.paintValues();
  }

  /** The languages and the text as they are now, on the selects and the text area Ionic drew. */
  paintValues() {
    this.querySelector('[data-field="from"]').value = this.from;
    this.querySelector('[data-field="to"]').value = this.to;
    this.querySelector('[data-field="text"]').value = this.text;
    this.paintDetected();
    this.paintState();
  }

  /** "Detect language" until the phone has told it, then the language it told. */
  paintDetected() {
    const auto = this.querySelector(`ion-select-option[value="${AUTO}"]`);
    if (!auto) return;
    auto.textContent = this.detected
      ? this.words("detected", { language: languageName(this.detected, this.language) })
      : this.words("detect");
  }

  /** What is going on (a spinner while the phone works, or what went wrong), the translation, and
   *  which buttons can be pressed. */
  paintState() {
    if (!this.paintStatus()) return;
    if (this.screen === "chat") return this.paintChatValues();
    if (this.screen !== "main") return;
    const answer = this.querySelector(".answer");
    answer.innerHTML = this.result
      ? `<ion-card class="result" aria-label="${escape(this.words("translation"))}"><ion-card-content><p dir="auto" lang="${escape(this.result.to)}">${lines(this.result.text)}</p></ion-card-content></ion-card>`
      : "";
    this.querySelector('[data-act="translate"]').disabled = Boolean(this.working) || !this.text.trim();
    this.querySelector('[data-act="say"]').disabled = Boolean(this.working) || !this.result;
    this.querySelector('[data-act="swap"]').disabled = Boolean(this.working) || !this.result;
  }

  /** What the phone is doing, or what went wrong. False on a screen with no place for it. */
  paintStatus() {
    const status = this.querySelector(".status");
    if (!status) return false;
    status.innerHTML = this.working
      ? `<ion-item lines="none"><ion-spinner slot="start" aria-hidden="true"></ion-spinner><ion-label>${escape(this.words(this.working))}</ion-label></ion-item>`
      : this.warning
        ? `<ion-text color="danger"><p role="alert">${escape(this.warning)}</p></ion-text>`
        : "";
    return true;
  }

  /** A language select of Ionic, with every language of this phone by its name. */
  languageSelect(field, label, first = "") {
    const options = sortLanguages(this.languages, this.language)
      .map(({ tag, name }) => `<ion-select-option value="${escape(tag)}">${escape(name)}</ion-select-option>`)
      .join("");
    return `<ion-select data-field="${field}" label="${escape(label)}" interface="alert" ok-text="${escape(this.words("ok"))}" cancel-text="${escape(this.words("cancel"))}">${first}${options}</ion-select>`;
  }

  /** The chat's page (the `chat` hook): its language, the two switches, and what downloading
   *  means; Remove and Save in the footer. */
  paintChat() {
    const none = `<ion-select-option value="">${escape(this.words("none"))}</ion-select-option>`;
    this.innerHTML = `<ion-content>
        <ion-list>
          <ion-item>${this.languageSelect("chatLang", this.words("chatLanguage"), none)}</ion-item>
          <ion-item><ion-toggle data-field="autoMessage" justify="space-between">${escape(this.words("autoReceive"))}</ion-toggle></ion-item>
          <ion-item><ion-toggle data-field="autoComposer" justify="space-between">${escape(this.words("autoSend"))}</ion-toggle></ion-item>
        </ion-list>
        <ion-text color="medium"><p class="ion-padding-horizontal">${escape(this.words("chatNote"))}</p></ion-text>
        <div class="status ion-padding-horizontal" role="status" aria-live="polite"></div>
      </ion-content>
      <ion-footer><ion-toolbar>
        <ion-buttons slot="start"><ion-button color="danger" data-act="chatRemove">${icon("trash-outline", "start")}${escape(this.words("remove"))}</ion-button></ion-buttons>
        <ion-buttons slot="end"><ion-button fill="solid" color="primary" data-act="chatSave">${icon("checkmark-outline", "start")}${escape(this.words("save"))}</ion-button></ion-buttons>
      </ion-toolbar></ion-footer>`;
    this.paintChatValues();
    this.paintStatus();
  }

  /** The chat's language and switches as they are now, on what Ionic drew. */
  paintChatValues() {
    const select = this.querySelector('[data-field="chatLang"]');
    if (!select) return;
    select.value = this.chatLang;
    for (const [field, on] of [["autoMessage", this.autoMessage], ["autoComposer", this.autoComposer]]) {
      const toggle = this.querySelector(`[data-field="${field}"]`);
      toggle.checked = on;
      toggle.disabled = !this.chatLang || Boolean(this.working);
    }
    this.querySelector('[data-act="chatSave"]').disabled = Boolean(this.working);
    this.querySelector('[data-act="chatRemove"]').disabled = Boolean(this.working) || !this.chatSaved;
  }

  /** The composer's question when the chat has no language yet: which one, then Translate. */
  paintPick() {
    this.innerHTML = `<ion-content>
        <ion-list><ion-item>${this.languageSelect("pickLang", this.words("chatLanguage"))}</ion-item></ion-list>
      </ion-content>
      <ion-footer><ion-toolbar>
        <ion-buttons slot="start"><ion-button data-act="pickCancel">${escape(this.words("cancel"))}</ion-button></ion-buttons>
        <ion-buttons slot="end"><ion-button fill="solid" color="primary" data-act="pickTranslate">${icon("language-outline", "start")}${escape(this.words("translate"))}</ion-button></ion-buttons>
      </ion-toolbar></ion-footer>`;
    this.querySelector('[data-field="pickLang"]').value = this.pickLang;
  }

  paintPacks() {
    const rows = (this.packs ?? [])
      .map((tag) => ({ tag, name: languageName(tag, this.language) }))
      .sort((a, b) => a.name.localeCompare(b.name, writtenIn(this.language)))
      .map(
        ({ tag, name }) => `<ion-item data-tag="${escape(tag)}"><ion-label>${escape(name)}</ion-label>
          <ion-button slot="end" fill="clear" color="danger" data-act="erase" data-key="${escape(tag)}" aria-label="${escape(this.words("remove"))}">${icon("trash-outline")}</ion-button></ion-item>`,
      )
      .join("");
    const body =
      this.packs === null
        ? `<div class="ion-padding ion-text-center"><ion-spinner aria-hidden="true"></ion-spinner></div>`
        : rows || `<ion-item lines="none"><ion-label class="ion-text-wrap" color="medium"><p class="empty">${escape(this.words("packsEmpty"))}</p></ion-label></ion-item>`;
    this.innerHTML = `<ion-header><ion-toolbar>
        <ion-buttons slot="start">${button("back", this.words("back"), "arrow-back-outline")}</ion-buttons>
      </ion-toolbar></ion-header>
      <ion-content><ion-list>
        <ion-list-header><ion-label>${escape(this.words("packs"))}</ion-label></ion-list-header>
        ${body}
      </ion-list></ion-content>`;
  }
}

if (!customElements.get("ft-translate")) customElements.define("ft-translate", Translator);
