# Cursor IDE

<p align="center">
  <img src="public/demo.png" alt="Cursor IDE demo" style="max-width: 100%; border-radius: 8px;" />
</p>

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Version: 1.0.0](https://img.shields.io/badge/Version-1.0.0-emerald.svg?style=flat-square)](https://github.com/Suryanshu-Nabheet/cursor)

A lightweight Electron + CodeMirror IDE with AI completion, LSP, terminal, and OpenVSX extensions. Offline-first (Ollama by default). Bring Your Own Key (BYOK) — no company AI backend or `.env` API keys.

Copyright (c) 2026 Suryanshu Nabheet. MIT License.

Repository: [github.com/Suryanshu-Nabheet/cursor](https://github.com/Suryanshu-Nabheet/cursor)

---

## Run

```bash
git clone https://github.com/Suryanshu-Nabheet/cursor.git
cd cursor
npm run doctor         # check toolchain
npm run setup          # install deps
npm start
```

Packaged app (Dock shows **Cursor**, not Electron):

```bash
npm run package
# open the Cursor.app under out/
```

### Scripts

| Command | What it does |
| --- | --- |
| `npm run doctor` | Verify Node, npm, git, electron, icons, Ollama |
| `npm run setup` | Clean build artifacts + install dependencies |
| `npm run clean` | Remove `.webpack`, `out`, logs, caches (keeps `node_modules` / LSP) |
| `npm run reset` | Deep wipe: clean + `node_modules` + LSP downloads |
| `npm run reset -- --with-userdata` | Also wipe Cursor app settings / extensions / logs |
| `npm start` | Launch the IDE |
| `npm test` | Run unit tests |
| `npm run package` | Build a real **Cursor.app** / installer |

Windows: `npm run setup:win`, `clean:win`, `reset:win`, `doctor:win`.

---

## Shortcuts

| Action | Shortcut |
| --- | --- |
| Quick Open | `Cmd/Ctrl + P` |
| Command Palette | `Cmd/Ctrl + Shift + P` |
| Search | `Cmd/Ctrl + Shift + F` |
| Terminal | `` Ctrl + ` `` |
| AI Command Bar | `Cmd/Ctrl + K` |
| Inline completion | `Cmd/Ctrl + Shift + Space` or `Alt + \` |

---

## Stack

Electron · React 18 · Redux Toolkit · CodeMirror 6 · TypeScript · Tailwind

AI providers: Ollama (default), OpenAI, Claude, Gemini, OpenRouter — configure keys in Settings (BYOK).

---

## Root config map

| File | Purpose |
| --- | --- |
| `forge.config.js` | Electron Forge: app name, icons, packaging, webpack plugin, Dock branding on start |
| `webpack.main.config.js` | Bundles the Electron **main** process (`src/main`) |
| `webpack.renderer.config.js` | Bundles the **UI** (`src/index.ts` + React) |
| `webpack.rules.js` | Shared loaders (TypeScript, Babel/React, assets, native modules) |
| `postcss.config.js` | Tailwind + Autoprefixer for CSS |
| `tailwind.config.js` | Utility CSS theme tokens |
| `tsconfig.json` | TypeScript compiler options |
| `.babelrc` | Babel preset for JSX/legacy JS in webpack |
| `.prettierrc` / `.prettierignore` | Code formatting |
| `jest.config.js` / `jest.ts-transformer.js` | Unit tests under `tests/` |

---

## License

Copyright (c) 2026 Suryanshu Nabheet. See [LICENSE](LICENSE).

**Suryanshu Nabheet** — [GitHub](https://github.com/Suryanshu-Nabheet)
