# web craft — frontend

React 19 + Vite + Tailwind CSS 4 single-page app for **web craft**, the free
template marketplace.

This folder is the `frontend/` half of a two-part project. **Setup, environment
variables and commands all live in the [root README](../README.md)** — that is
the only document to follow.

```bash
# from the repository root
npm run setup    # installs backend + frontend dependencies
npm run dev      # API on :8080, this app on :5173
```

Layout:

| Path | Purpose |
|---|---|
| `src/pages/**` | One component per route (`App.jsx` maps them) |
| `src/components/**` | Reusable UI — `Templates/`, `Common/`, `Auth/` |
| `src/lib/` | `api.js` (axios + error mapping), `seo.js`, `session.js`, `format.js` |
| `src/index.css` | Design tokens, `ui-*` component classes, animations |
| `public/` | Static assets served at the site root |

> This is not a standalone Vite starter — do not run `npm create vite` in here
> or replace `index.html`/`vite.config.js`.
