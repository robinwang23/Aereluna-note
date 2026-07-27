<p align="center">
  <img src="build/icon.png" width="132" alt="Aereluna Note">
</p>

<h1 align="center">Aereluna Note</h1>

<p align="center">
  A fully offline markdown notebook with a Frutiger Aero face.<br>
  <sub>Three formatting buttons · golden-ratio split · dark by default · zero dependencies</sub>
</p>

Two ways to run it, both from the same `AerelunaNote.html`:

- **Browser** — download `AerelunaNote.html` and double-click it. No install, no dependencies, no build step.
- **Desktop** — wrap it with Electron for a real macOS `.app` with native menus, real file I/O and direct PDF export.

## Why

Most markdown editors grow until they have forty toolbar buttons and a plugin
marketplace. This one has three formatting buttons and a single HTML file. It
loads instantly, works on a plane, and the file you save is a plain `.md` that
any other editor can open.

## What it does

- **Genuinely offline.** `AerelunaNote.html` contains no `<script src>`, no `@import`, no `fetch`. The markdown parser is hand-written (~200 lines) and every font is a system font. Pull the network cable and nothing changes. The desktop build additionally blocks all in-window navigation and hands real links to the system browser.
- **Three formatting buttons.** Bold, italic, underline. Deliberately nothing else.
- **Undo and redo** that cover toolbar edits as well as typing, with keystrokes coalesced into sensible steps.
- **Golden-ratio split.** Editor and preview at 61.8 : 38.2, scroll-synced. Drag the divider to change it, double-click to snap back.
- **Dark mode by default.** A sun/moon toggle in the toolbar switches back, and your choice is remembered. Exported PDFs stay light regardless of the screen theme.
- **PDF export** of the full document — not the narrow preview column. Headings don't strand, code blocks and tables don't split across pages.

## Browser

Download `AerelunaNote.html`. Double-click. Done.

Chrome and Edge are the better fit: they support the File System Access API, so `⌘S` overwrites the file in place. Safari and Firefox fall back to downloading a copy.

`⌘P` exports a PDF — pick **PDF ▾ → Save as PDF** at the bottom left of the print sheet.

## Desktop app (macOS)

Requires [Node.js](https://nodejs.org) 18 or newer.

```bash
git clone <your-repo-url>
cd aereluna-note
npm install          # pulls Electron, ~200MB, once
npm start            # run it
npm run dist         # build dist/Aereluna Note-1.0.0-arm64.dmg
```

`npm run dist` builds for Apple Silicon and Intel separately. Use `npm run dist:universal` for a single universal binary.

The build is **unsigned**. The first time you open it, macOS will refuse — right-click the app icon, choose Open, then confirm. Anyone downloading it from your releases page needs to do the same, so mention it in the release notes. With an Apple Developer account you can add `identity` and notarization settings under `build.mac` in `package.json` and skip all that.

What the desktop build adds over the browser one:

- Native menu bar (File, Edit, Format, View, Window)
- Real Open / Save / Save As, with the filename and an edited dot in the title bar
- PDF written straight to disk, no print dialog
- A proper Save / Don't Save / Cancel sheet when closing with unsaved changes
- Registers as a handler for `.md`, so Finder can open files into it
- Open Recent

## Shortcuts

| Action | Shortcut |
| --- | --- |
| Bold | `⌘B` |
| Italic | `⌘I` |
| Underline | `⌘U` |
| Undo | `⌘Z` |
| Redo | `⌘⇧Z` |
| New | `⌘N` (desktop) |
| Open | `⌘O` |
| Save | `⌘S` |
| Save As | `⌘⇧S` (desktop) |
| Export PDF | `⌘P` |
| Toggle dark mode | `⌘⇧D` |
| Reset split to 61.8% | `⌘0` |

Formatting keys toggle: press once on selected text to apply, again to remove. With nothing selected the word under the caret is wrapped instead.

## About underline

Standard markdown has no underline, so Aereluna Note writes inline HTML:

```markdown
<u>underlined</u>
```

That is still valid markdown — Typora, Obsidian, VS Code and GitHub all render it correctly. Your files are never locked to this editor.

## Supported syntax

Headings, bold, italic, strikethrough, inline code, fenced code blocks, links, images, nested blockquotes, nested ordered and unordered lists, task lists (`- [ ]`), tables with column alignment, and horizontal rules.

Everything is HTML-escaped first, then a small allowlist is put back: `u`, `b`, `i`, `em`, `strong`, `mark`, `small`, `sub`, `sup`, `kbd`, `br`, and `span` with a `color` style. Anything else — `<script>` included — renders as literal text. In the desktop build the renderer runs with `contextIsolation` on and `nodeIntegration` off; the only API it can reach is the five methods in `preload.js`.

## Storage

The document is mirrored into `localStorage` as you type and restored on next launch. That is a draft cache, not an archive — use `⌘S` for anything you care about.

Safari may disable `localStorage` under the `file://` protocol, in which case the autosave quietly does nothing. Editing is unaffected.

## Files

```
AerelunaNote.html   the editor itself; works standalone
main.js             Electron main process: window, menus, file I/O, PDF
preload.js          the entire API surface the renderer can see
package.json        dependencies and electron-builder config
build/icon.png      app icon, 1024×1024, converted to .icns at build time
```

## License

MIT
