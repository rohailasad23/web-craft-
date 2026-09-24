# Landing Page Builder

AI-assisted landing page builder. Describe a business, get a landing page, edit it
visually, then pay & publish it.

| | Stack |
|---|---|
| **Frontend** | React 19, Vite 8, Tailwind CSS 4, React Router 7 (`frontend/`) |
| **Backend** | Express 4, Mongoose 9, JWT auth (`backend/`) |
| **Database** | MongoDB (local or Atlas) |
| **Services** | Anthropic Claude / OpenAI / Ollama (copy), Unsplash (images), Razorpay (payments) |

---

## Quick start

```bash
npm run setup                 # install backend + frontend dependencies

cp backend/.env.example backend/.env
# then edit backend/.env -- JWT_SECRET is required, everything else is optional

npm run dev                   # API on :8080, web on :5173
```

Then open <http://localhost:5173>.

```bash
npm run smoke                 # end-to-end regression check (spawns the API)
npm run lint                  # frontend lint
npm run build                 # production frontend build
```

---

## Configuration

All backend configuration lives in `backend/.env`. See `backend/.env.example`
for the annotated list.

**Required**

| Key | Notes |
|---|---|
| `JWT_SECRET` | The server **refuses to start** without it. There is no hardcoded fallback. |
| `MONGODB_URI` | Connection string. The server exits on connection failure. |

**Optional — the app degrades gracefully without each of these**

| Key | Behaviour when missing |
|---|---|
| `CLAUDE_API_KEY` / `OPENAI_API_KEY` / `OLLAMA_URL` | Pages are generated with deterministic template copy. The Generate screen warns the user up front, and the API reports the source via `provider`. |
| `UNSPLASH_API_KEY` | Built-in SVG placeholder images are used (no network call, nothing broken). |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | `POST /api/payment/create-order` returns **503** with a clear message instead of crashing. |
| `CORS_ORIGINS` | Blank = allow any origin (fine locally). **Set this in production.** |
| `PUBLIC_BASE_URL` | Base for published links. Defaults to `http://localhost:<PORT>`. |

Frontend configuration lives in `frontend/.env.local`:

```
VITE_API_URL=http://localhost:8080   # must match backend PORT
```

---

## Project layout

```
backend/
  server.js              app wiring: security, CORS, rate limits, routes, /sites/:id
  middleware/            auth (JWT), asyncHandler (error propagation)
  models/                User, LandingPage, Payment (Mongoose schemas)
  routes/                auth, generator, editor, pages, payment, admin
  services/
    contentAI.js         provider chain + normalisation; never throws
    images.js            Unsplash with local SVG fallback
    render.js            currentState -> HTML (single source of truth)
  utils/                 html (escaping), secrets (config validation)
  scripts/smoke.js       end-to-end smoke test
frontend/
  src/lib/api.js         shared axios instance: auth header + global 401 handling
  src/lib/razorpay.js    lazy checkout script loader
  src/components/        Auth, Common, Editor, Generator
  src/pages/             Home, Generate, Editor, Dashboard
```

---

## Key behaviours

- **Generation cannot fail because a third party is down.** `services/contentAI.js`
  walks the configured providers (Claude → OpenAI → Ollama) and falls back to
  template copy. Credentials are never written to logs.
- **Edits actually publish.** `htmlOutput` is re-rendered from `currentState` on
  every editor save, and the renderer honours `colorScheme`.
- **Input is escaped on the way out.** Every interpolated value passes through
  `escapeHtml`, and published pages are served with
  `Content-Security-Policy: script-src 'none'` as defence in depth.
- **The price is server-side.** `create-order` reads `page.amount`; the client
  only sends `pageId`. Orders are bound to a user *and* a page before a payment
  is accepted, and signatures are compared in constant time.
- **Editor typing is optimistic** and saves are debounced (600ms), coalescing
  keystrokes instead of issuing one `PUT` per character.

---

## Testing

`npm run smoke` boots the API against a scratch port and asserts 31 checks
covering auth, generation, editing, publishing, security regressions (mass
assignment, XSS escaping, auth rejection) and error handling. It exits non-zero
on any failure, so it can gate CI.
