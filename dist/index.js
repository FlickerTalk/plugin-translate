// Translator for FlickerTalk (app#177): a message the user hands over, or their own draft,
// translated on the phone. The plugin only talks to the core (`ft.translate`), which asks the
// phone's own translator: iOS on iPhone, Google's ML Kit built into the app on Android. The text
// never leaves the phone, and the plugin has no network and keeps nothing but the last language
// it translated into.

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

/** A language's name in the app's language (English if the phone cannot write that one), with a
 *  capital letter as a list shows it; the tag itself when the phone has no name for it. */
export function languageName(tag, lang = "en") {
  const locale = writtenIn(lang);
  let name;
  try {
    name = new Intl.DisplayNames([locale], { type: "language", fallback: "none" }).of(tag);
  } catch {
    name = undefined;
  }
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

/** The script a region writes Chinese in, for an app language such as `zh-TW`. */
const REGION_SCRIPT = { tw: "hant", hk: "hant", mo: "hant", cn: "hans", sg: "hans" };

/**
 * The tag of `languages` that stands for `wanted` (the app's language, or a detected one): the
 * same tag, else one in the same script (`zh-TW` → `zh-Hant`), else the language alone, else any
 * with the same first subtag. Null when this phone has none.
 */
export function matchLanguage(languages, wanted) {
  if (!wanted) return null;
  const parts = String(wanted).toLowerCase().split(/[-_]/);
  const [primary] = parts;
  const lower = (tag) => tag.toLowerCase();
  const same = languages.filter((tag) => lower(tag).split("-")[0] === primary);
  const script = parts.find((part) => part.length === 4) ?? REGION_SCRIPT[parts.find((part, index) => index > 0 && part.length === 2)];
  return (
    languages.find((tag) => lower(tag) === parts.join("-")) ??
    (script ? same.find((tag) => lower(tag).split("-").includes(script)) : undefined) ??
    same.find((tag) => lower(tag) === primary) ??
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
