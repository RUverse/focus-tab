# Privacy Policy

**Extension:** New Tab Focus Clock (Focus Tab)
**Last updated:** June 27, 2026

## Summary

New Tab Focus Clock does **not** collect, transmit, sell, or share any
personal or user data. Everything the extension stores stays on your own
device. There are no analytics, no tracking, no remote servers, and no
third‑party code.

## What the extension stores

The extension saves your settings locally using the browser's
`chrome.storage.local` API so they persist between sessions. This includes:

- The list of websites you choose to block during a focus session
- Your focus / break state and the current break timer
- Recent break reasons you've entered
- New‑tab display preferences (clock format, theme, custom clock color,
  progress bars, and your display name)

This information never leaves your device. It is not sent to the developer or
to any third party.

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
  restore blocked tabs.
- **webNavigation** — detect navigation to a blocked site so it can be
  redirected before the page loads.

## Remote code

The extension contains no remote code. All scripts are packaged with the
extension and run under a `script-src 'self'` content security policy. There
is no `eval`, and nothing is loaded from external servers.

## Changes to this policy

If this policy changes, the updated version will be published at this same
location with a new "Last updated" date.

## Contact

Questions about this policy can be sent to **contact@ruverse.ai**.
