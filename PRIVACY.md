# Privacy Policy

**Extension:** New Tab Focus Clock (Focus Tab)
**Last updated:** October 24, 2026

## Summary

New Tab Focus Clock does **not** collect, sell, or share any personal or user
data. Everything the extension stores stays on your own device. There are no
analytics, no tracking, no developer servers, and no third‑party code. The only
network requests the extension makes are dictionary lookups you start yourself
in the optional dictionary gadget (below).

## What the extension stores

The extension saves your settings locally using the browser's
`chrome.storage.local` API so they persist between sessions. This includes:

- The list of websites you choose to block during a focus session
- Your focus / break state and the current break timer
- Recent break reasons you've entered
- Sticky note list content, if you enable that gadget
- Dictionary lookup history (up to 100 words or phrases with their
  translations and definitions), if you use that gadget
- New‑tab display preferences (clock format, custom accent color,
  gadget visibility, progress bars, and your display name)

This information never leaves your device. It is not sent to the developer or
to any third party.

## Dictionary lookups

The dictionary gadget only goes online when you submit a word or phrase, and
it sends only that text and the language you selected:

- **Wiktionary** (Wikimedia Foundation): words and short phrases are requested
  from `en.wiktionary.org` and the Wiktionary edition for the selected
  language, such as `de.wiktionary.org`.
  [Wikimedia privacy policy](https://foundation.wikimedia.org/wiki/Policy:Privacy_policy)
- **On-device translation** (Chrome only): when Chrome's built-in translation
  model is installed, sentences are translated inside the browser and are not
  sent anywhere.
- **MyMemory** (Translated srl): otherwise, sentences and words that
  Wiktionary cannot translate are sent to `api.mymemory.translated.net`.
  [Translated privacy policy](https://translated.com/privacy)

In Firefox, the extension declares this as optional "search terms" data
collection. Firefox asks for your permission the first time you look up a new
word, and nothing is sent unless you allow it. You can turn the permission off
again in `about:addons` under the extension's **Permissions and data**.

Requests are sent without cookies or a referrer. No browsing data, settings,
block lists, notes, or identifiers are included. Your lookup history stays in
local storage and is never uploaded.

## Browsing data

To enforce the site blocks you configure, the extension checks the URL of the
tab you are viewing or navigating to against your own block list, and redirects
tabs that match to its focus page. This happens entirely on your device in real
time. The extension does **not** record, store, or transmit your browsing
history, the contents of any page, or which sites you visit.

## Permissions

The permissions the extension requests are used solely to provide its features:

- **storage** — save your settings locally (above).
- **alarms** — re‑enable blocking automatically when a timed break ends.
- **tabs** — read tab URLs to compare against your block list and redirect or
  restore blocked tabs, and read the title, icon, and audio state of tabs that
  are currently playing sound to show them in the "Now playing" panel (which
  also lets you mute or switch to those tabs). This is read and displayed only
  on your device.
- **webNavigation** — detect navigation to a blocked site so it can be
  redirected before the page loads.

## Remote code

The extension contains no remote code. All scripts are packaged with the
extension and run under a `script-src 'self'` content security policy. There
is no `eval`, and no code is loaded from external servers. Dictionary lookups
receive only JSON data, which is displayed as plain text.

## Changes to this policy

If this policy changes, the updated version will be published at this same
location with a new "Last updated" date.

## Contact

Questions about this policy can be sent to **contact@ruverse.ai**.
