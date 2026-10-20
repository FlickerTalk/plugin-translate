// Translator for FlickerTalk (app#177): a message the user hands over, or their own draft,
// translated on the phone. The plugin only talks to the core (`ft.translate`), which asks the
// phone's own translator: iOS on iPhone, Google's ML Kit built into the app on Android. The text
// never leaves the phone, and the plugin has no network and keeps nothing but the last language
// it translated into.

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
  }

  connectedCallback() {
    // In the page, not in a shadow root: the frame holds only this plugin, and Ionic's global
    // styles do not cross a shadow boundary. An Ionic page: header, content and footer.
    this.classList.add("ion-page");
    this.addEventListener("click", (event) => this.onClick(event));
    this.addEventListener("ionChange", (event) => this.onChange(event));
    this.addEventListener("ionInput", (event) => this.onChange(event));
    globalThis.ft?.onOpen?.((opening) => this.onOpen(opening));
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
    if (this.languages.length === 0) return this.show("cannot");
    const fromMessage = this.text.trim().length > 0;
    const kept = await call(() => globalThis.ft.store.get(KEPT), null);
    if (fromMessage) await this.detectFor(this.text);
    this.to = defaultTarget(this.languages, { lang: this.language, kept, source: this.detected, fromMessage });
    this.show("main");
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
  }

  /** What Ionic's selects and text area say: a language picked, or the text typed. A translation
   *  that no longer matches them goes. */
  async onChange(event) {
    const name = event.target?.dataset?.field;
    if (!name || this.screen !== "main") return;
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
    const options = sortLanguages(this.languages, this.language)
      .map(({ tag, name }) => `<ion-select-option value="${escape(tag)}">${escape(name)}</ion-select-option>`)
      .join("");
    const select = (name, auto) =>
      `<ion-select data-field="${name}" label="${escape(this.words(name))}" interface="alert" ok-text="${escape(this.words("ok"))}" cancel-text="${escape(this.words("cancel"))}">${auto}${options}</ion-select>`;
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
    const status = this.querySelector(".status");
    if (!status) return;
    status.innerHTML = this.working
      ? `<ion-item lines="none"><ion-spinner slot="start" aria-hidden="true"></ion-spinner><ion-label>${escape(this.words(this.working))}</ion-label></ion-item>`
      : this.warning
        ? `<ion-text color="danger"><p role="alert">${escape(this.warning)}</p></ion-text>`
        : "";
    const answer = this.querySelector(".answer");
    if (answer) {
      answer.innerHTML = this.result
        ? `<ion-card class="result" aria-label="${escape(this.words("translation"))}"><ion-card-content><p dir="auto" lang="${escape(this.result.to)}">${lines(this.result.text)}</p></ion-card-content></ion-card>`
        : "";
    }
    this.querySelector('[data-act="translate"]').disabled = Boolean(this.working) || !this.text.trim();
    this.querySelector('[data-act="say"]').disabled = Boolean(this.working) || !this.result;
    this.querySelector('[data-act="swap"]').disabled = Boolean(this.working) || !this.result;
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
