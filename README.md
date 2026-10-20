# plugin-translate

**Translator** for [FlickerTalk](https://flickertalk.com). Translates a message or your draft on
the phone. Language packs are downloaded once from Apple or Google; the text never leaves the phone.

## In the chat

From 1.1.0 (FlickerTalk 1.7.0 or newer) the Translator works inside your chats, through the chat's
hooks (`hooks` in `module.json`):

- **Chat language** (in the chat's options): pick the language of this chat, or *None*. Two
  switches, on as soon as a language is chosen: **Translate what I receive** (each message you get
  while the chat is open shows its translation into your language under it) and **Translate what
  I send** (what you write goes in the chat's language when you press send). If the languages are
  not on the phone yet, it asks once before downloading them. **Remove** turns it all off.
- **Translate** on a message you hold: its translation into your language shows under it and is
  kept on the phone. A message already in your language says so.
- **Translate** in the composer: your draft in the chat's language replaces it, and you can go
  back to your text before sending. With no chat language yet, it asks for one first and keeps it.

The app runs the Translator out of sight for this. It only comes into view to ask you something:
whether to download a language, or which language the chat is in. Nothing is translated outside
the chat you have open.

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
the text **you** hand it with a gesture, or a message of the chat you have open when you switched
on its translation there (`messages: given`). It keeps the last language you translated into and,
for each chat, under a key that says nothing of who it is with, the chat's language and the two
switches. Translations are kept by the app, on the phone, with the message.

## What it uses from the core

| Capability     | What for                                                                          |
| -------------- | --------------------------------------------------------------------------------- |
| `ft.translate` | the languages of this phone, detecting a text's language, whether a pair is ready, downloading and removing packs, and the translation (`translate` permission) |
| `ft.say`       | *Use in chat*: the translation in the composer (`send: propose`)                  |
| `ft.onHook`    | the chat's hooks: a held message, the composer, and the chat's language          |
| `ft.show`      | coming into view during a hook, to ask about a download or the chat's language    |
| `ft.notify`    | a short notice from a hook the user started ("already in your language")          |
| `ft.store`     | the last language translated into                                                 |
| `ft.records`   | each chat's language and switches, by the chat's opaque key                       |
| `onOpen`       | `text` from a message, `lang`, and `hook: "chat"` with `chat` for the chat's page |

The flow is the one the Plugin API describes: `detect` → `status` → `prepare` when the pair is
`downloadable` → `translate`. It needs core **1.7.0** (`minCoreVersion`). The contract is in
[plugin-sdk](https://github.com/FlickerTalk/plugin-sdk).

Everything is drawn with the Ionic the app lends to the frame, and nothing else: the element is an
`ion-page` with `ion-header > ion-toolbar`, `ion-content` and `ion-footer > ion-toolbar >
ion-buttons > ion-button`, every icon an `ion-icon` the app registers by name, and no style of its
own. The chat's page is an `ion-list` with an `ion-select` and two `ion-toggle`s; the window has
the languages as `ion-select`s, the text in an `ion-textarea` and the translation in an `ion-card`.
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
