# plugin-translate

**Translator** for [FlickerTalk](https://flickertalk.com). Translates a message or your draft on
the phone. Language packs are downloaded once from Apple or Google; the text never leaves the phone.

## In the chat

From 1.1.0 (FlickerTalk 1.7.0 or newer) the Translator works inside your conversations, through
their hooks (`hooks` in `module.json`). The chat itself looks as it always does:

- **Translate** inside each message you receive (unless the conversation is in your language): one
  tap, and the translation takes the place of the text, with *See original* to go back. Nothing
  opens. A message already in your language says so.
- **Translation** on the contact's page (or the circle's): the conversation's **Language**, told on
  its own from the last messages you received there ("French (detected)") or chosen by you, or
  *None*. Each message is told on its own, and a language that is not yours wins as soon as one of
  them is in it (the most frequent of them, if there are several). Then **Translate what I
  receive** (each message arrives translated, with *See original*) and **Send translated** (what
  you write goes in the conversation's language when you press send).
  If a language is not on the phone yet, it asks before downloading it.

When a language is not on the phone yet, on Android the app asks "Download German? About 30 MB,
once." and the Translator goes ahead only on yes; on iPhone, iOS asks in its own sheet, with nothing
asked before it. It never opens a window for any of this, and nothing is translated outside the
conversation you have open.

## Its own window

The Translator's window (from Apps, or *Open with a plugin*) is still there for any text:

- **A message you received**: hold it, choose *Open with a plugin* → Translator. The text comes
  filled in, the phone tells its language, and it is translated into the app's language when you
  press **Translate**.
- **Your own text**: open Translator from Apps, write it, pick the contact's language in **To** and
  press **Translate**. **Use in chat** puts the translation in the composer; you are the one who
  sends it. The plugin remembers the last language you translated into.
- **From** is *Detect language* by default; pick the language by hand when the phone cannot tell
  it or tells it wrong. **Swap** turns the translation into the text and the languages round.
- The first time a pair of languages needs a language pack, the plugin says so first, with its
  rough size (about 30 MB a language), and the phone downloads it only if you agree. On iPhone, iOS
  shows its own sheet as well.
- **Downloaded languages** (the button at the top) lists the packs on this phone and removes the
  ones you no longer need. On Android that is the only way to get their space back without clearing
  the app's data; on iPhone iOS manages them in its Settings.
- A text has up to 5,000 characters, about one message.
- Where it cannot translate, one sentence says so: on a phone with no translator (a desktop, an
  iPhone before iOS 18), and when the user did not allow the Translator to translate, which the
  plugin cannot tell apart.

## Privacy

The text never leaves the phone. On iPhone the translation is done by iOS. It needs iOS 18 or
newer. On Android the translator is Google's ML Kit, built into the app: the text stays on the
phone. Google receives which languages are used and diagnostic data about the app, not the text.
Language packs are downloaded once from Apple or Google, which therefore see which language was
asked for and from which IP address; never the text.

The plugin itself has no network and does not see the conversation or who it is with. It only gets
the text **you** hand it with a gesture, the messages of the conversation you have open when you
switched on its translation there, and the last texts received in a conversation that has no
language yet, to tell that language on the phone (`messages: given`). It keeps the last language
you translated into and, for each conversation, under a key that says nothing of who it is with,
its language and the two switches. Translations are kept by the app, on the phone, with the
message.

## What it uses from the core

| Capability     | What for                                                                          |
| -------------- | --------------------------------------------------------------------------------- |
| `ft.translate` | the languages of this phone, detecting a text's language, whether a pair is ready, downloading and removing packs, and the translation (`translate` permission) |
| `ft.say`       | *Use in chat*: the translation in the composer (`send: propose`)                  |
| `ft.onHook`    | the conversation's hooks: a received message, what is sent, the Translation group |
| `ft.notify`    | a short notice from a hook the user started ("already in your language")          |
| `ft.store`     | the last language translated into                                                 |
| `ft.records`   | each conversation's language and switches, by its opaque key                      |
| `onOpen`       | `text` from a message, `lang`                                                     |

The flow is the one the Plugin API describes: `detect` → `status` → `prepare` when the pair is
`downloadable` → `translate`. It needs core **1.7.0** (`minCoreVersion`). The contract is in
[plugin-sdk](https://github.com/FlickerTalk/plugin-sdk).

Everything is drawn with the Ionic the app lends to the frame, and nothing else: the element is an
`ion-page` with `ion-header > ion-toolbar`, `ion-content` and `ion-footer > ion-toolbar >
ion-buttons > ion-button`, every icon an `ion-icon` the app registers by name, and no style of its
own. The window has the languages as `ion-select`s, the text in an `ion-textarea` and the
translation in an `ion-card`. The Translation group on the contact's page is drawn by the app,
from the fields the manifest declares.
Downloads and removals are asked with `ion-alert` and notices go in `ion-toast` or the app's own
toast (`confirm()` does nothing in the frame). No title or close button of its own: the app's
window has both. The package carries no Ionic: `@ionic/core` is only a `devDependency`, so the
tests draw what the phone draws.

## Development

```sh
npm install
npm test
```

The tests run on Vitest with happy-dom and the real `@ionic/core`, against a fake core that also
plays the app's side of the chat's hooks.
`dist/index.js` registers the web component `ft-translate`; `dist/i18n.js` holds the texts in the
21 languages of the app (a test checks that every language has the same keys as English). There is
nothing to build. The `.ftplugin` package is signed by the FlickerTalk catalogue; it is not built
here.

To try a real translation you need a phone: an iPhone with iOS 18 or newer (the iOS Simulator does
not translate) or an Android phone with Google Play services, running FlickerTalk 1.7.0 or newer.

## Licence

MIT.
