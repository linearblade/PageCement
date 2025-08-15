# PageCement
test
**Version 1.0 — Stable, actively developed**

PageCement is a lightweight, DOM-safe utility for stabilizing viewport sizing and reducing accidental zoom or scroll events — without interfering with intended user interactions.

Think of it like pouring concrete under your webpage so it stays solid, instead of letting it behave like a slip n' slide at a water park.

It maintains a reliable CSS `--vh` variable for full-height layouts, optionally locks scrolling, and blocks unwanted zoom gestures and keyboard shortcuts.

---

## ✨ Features

* 📏 **Consistent viewport height** via a dynamically updated `--vh` CSS variable.
* 🚱 **Zoom prevention** for:

  * `Ctrl`/`Cmd` + mouse wheel
  * `Ctrl`/`Cmd` + (+ / - / =) keys
  * iOS pinch gestures
* 📵 **Optional scroll lock** while active.
* 🎯 **Element whitelist** — allow zoom & scroll in specific areas.
* ⌨ **Configurable keyboard combo blocking**:

  * `false` → Ignore all key events.
  * `true` → Block any `Ctrl`/`Cmd` combo.
  * `[{ mods, key }]` → Block only specified combos.
* 🔄 **VisualViewport handling** for mobile browser chrome & orientation changes.
* 🧬 **Class-based API** — SSR-safe, side-effect free until enabled.

---

## 📦 Installation

Copy `vendor/pageCement/index.js` into your project and import it where needed.

```js
import PageCement from "./vendor/pageCement/src/index.js";
```

---

## 🚀 Usage

```js
// Basic usage
const cement = new PageCement();
cement.enable();

// With options
const cement = new PageCement({
  allow: "#console, .zoom-ok",  // CSS selectors or array of selectors/elements
  lockScroll: true,             // Prevents page scrolling
  keyboardCombos: false,        // Disable all key blocking
  cssVarName: "--vh"             // Custom CSS variable name
});
cement.enable();

// Disable and restore previous state
cement.disable();
```

---

## ⚙ Options

| Option              | Type                              | Default  | Description                                                                                                              |
| ------------------- | --------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `allow`             | `string \| string[] \| Element[]` | `[]`     | Elements where zoom/scroll is allowed.                                                                                   |
| `lockScroll`        | `boolean`                         | `false`  | If true, disables page scrolling.                                                                                        |
| `keyboardCombos`    | `boolean \| object[]`             | `false`  | `false`: ignore all keys, `true`: block all `Ctrl`/`Cmd` combos, `object[]`: block only specific combos `{ mods, key }`. |
| `cssVarName`        | `string`                          | `"--vh"` | Name of the CSS variable storing viewport height.                                                                        |
| `maxZoom`           | `number`                          | `1`      | Max zoom level (wheel gesture prevention).                                                                               |
| `useVisualViewport` | `boolean`                         | `true`   | Use `VisualViewport` API if available.                                                                                   |

---

## 🤭 Future Work

* Configurable “inside allowed” detection modes:

  * Target-based (current behavior).
  * Intent-based (e.g., via last mouse position).
* More granular zoom restoration handling on mobile after user input.
* Optional per-keyboard-modifier logging for debugging.

---

## 📜 License

See [`LICENSE.md`](LICENSE.md) for full terms.
Free for personal, non-commercial use.
Commercial licensing available under the M7 Moderate Team License (MTL-10).

---

## 🤖 AI Usage Disclosure

See [`docs/AI_DISCLOSURE.md`](docs/AI_DISCLOSURE.md) and [`docs/USE_POLICY.md`](docs/USE_POLICY.md) for permitted use of AI in derivative tools or automation layers.

---

## 💬 Feedback / Security

* General inquiries: [legal@m7.org](mailto:legal@m7.org)
* Security issues: [security@m7.org](mailto:security@m7.org)
