# web craft

A free template marketplace. Browse and search ready-made website templates,
preview them, and download the source archive — or sign up as a developer and
publish your own.

**Developed by Rohail Asad** — [rohailasad23@icloud.com](mailto:rohailasad23@icloud.com)

| | Stack |
|---|---|
| **Frontend** | React 19, Vite 8, Tailwind CSS 4, React Router 7 (`frontend/`) |
| **Backend** | Express 4, Mongoose 9, JWT auth, Multer uploads (`backend/`) |
| **Database** | MongoDB (local or Atlas) |
| **Storage** | Local disk behind `backend/services/storage.js` — swap in S3 by rewriting three functions |

Everything in V1 is **free**. There are no payments, subscriptions or premium tiers.

---

## Quick start

```bash
npm run setup                 # install backend + frontend dependencies

cp backend/.env.example backend/.env
# then edit backend/.env -- JWT_SECRET is required, everything else is optional

npm run seed                  # optional: 2 users + 12 example templates
npm run dev                   # API on :8080, web on :5173
```

Then open <http://localhost:5173>.

> **Database:** with the default `DB_MODE=auto` the API first tries your
> `MONGODB_URI`, and if Atlas is unreachable (e.g. your IP left its access list)
> it starts a local MongoDB under `backend/.data/mongo` instead — so `npm run dev`
> always comes up. Run `npm run warmup-db` once inside `backend/` to pre-download
> the binary.

```bash
npm run smoke                 # end-to-end regression check (spawns its own API + DB)
npm run lint                  # frontend lint
npm run build                 # production frontend build
```

### Seeded logins

`npm run seed` creates two accounts so you can try both roles immediately:

| Role | Email | Password |
|---|---|---|
| Developer | `ayesha@example.com` | `seed-dev-1234` |
| User | `demo@example.com` | `seed-user-1234` |

---

## The two account types

- **User** — browse, search, filter, preview and download templates. Their
  dashboard lists everything they have downloaded.
- **Developer** — everything above, plus upload, edit and delete their own
  templates and see download statistics.

Anyone can move between the two from **Profile → Account type** (or the
*Become a developer* card on the dashboard). The API only ever accepts `user`
or `developer` for that field — `admin` is rejected with a 400, and
administrator accounts cannot switch at all.

### How to become a developer

1. Register at `/register` and pick **Developer**, or
2. Register normally, open **Dashboard → Become a developer**.

Either way you land on `/developer`, where you can upload your first template.

---

## Uploading a template

`/developer/upload` accepts:

| Field | Rule |
|---|---|
| Archive | `.zip`, up to **25 MB**, required on create |
| Thumbnail | PNG / JPEG / GIF / WebP, up to **5 MB**, optional (a placeholder is generated) |
| Screenshots | same formats, up to **5 files** |
| SVG | **rejected on purpose** — served inline it is an XSS vector |
| Metadata | title, description, category, ≥1 technology, optional preview/GitHub URLs |

Files are stored on disk under `backend/uploads/{templates,thumbnails,screenshots}`.
MongoDB only keeps a `file.key` reference, so moving to S3 later means rewriting
`ensureStorage`, `resolveKey` and `remove` in `services/storage.js` — no model or
route changes.

---

## Configuration

All backend configuration lives in `backend/.env`. See `backend/.env.example`
for the annotated list.

**Required**

| Key | Notes |
|---|---|
| `JWT_SECRET` | The server **refuses to start** without it. There is no hardcoded fallback. |
| `DB_MODE` | `auto` (default) tries `MONGODB_URI`, then falls back to a local MongoDB. `atlas` = Atlas only, fail fast. `local` = local only. |
| `MONGODB_URI` | Connection string. Only reached in `auto`/`atlas` mode, and probed for 5s before falling back. |

**Optional**

| Key | Behaviour when missing |
|---|---|
| `CORS_ORIGINS` | Blank = allow any origin (fine locally). **Set this in production.** |
| `LOCAL_DB_PORT` / `LOCAL_DB_PATH` / `LOCAL_DB_NAME` | Where the fallback MongoDB runs and what it is called. |
| `MAX_ZIP_BYTES` / `MAX_IMAGE_BYTES` | Override the 25 MB archive and 5 MB image limits. |

Frontend configuration lives in `frontend/.env.local`:

```
VITE_API_URL=http://localhost:8080   # must match backend PORT
```

---

## Project layout

```
backend/
  server.js                 app wiring: security, CORS, routes, static /uploads
  constants/catalog.js      single source of truth: categories, filters, sorts
  middleware/
    auth.js                 verifyToken + requireRole (role re-read from the DB)
    upload.js               Multer fields, MIME/size/count limits, friendly errors
  models/                   User, Template, Download (Mongoose schemas)
  routes/                   auth, users, templates, developers, meta, admin
  services/
    storage.js              file storage behind a three-function interface
    placeholders.js         generated SVG thumbnail when none is uploaded
    database.js             DB_MODE: Atlas, or an on-disk local MongoDB fallback
  scripts/
    seed.js                 dev data: 2 users, 12 templates, sample downloads
    smoke.js                end-to-end smoke test (own port, own database)
frontend/
  src/lib/
    api.js                  shared axios: auth header + global 401 handling
    session.jsx             SessionContext / useSession
    catalog.js              cached GET /api/meta (filter chips)
    download.js             authenticated blob download
  src/components/           Auth, Common (Navbar, Toast, Footer, skeletons), Templates
  src/pages/                Home, Templates, TemplateDetails, Developers,
                            DeveloperProfile, Dashboard, MyDownloads, Profile,
                            developer/{Dashboard,MyTemplates,Upload}
```

---

## Key behaviours

- **Downloads are counted once per person.** `Download` has a unique
  `(userId, templateId)` index and the counter only increments on insert, so a
  template's `downloadCount` is the number of *distinct* users — and "My
  Downloads" is a list of distinct templates.
- **Filters never drift.** The chips come from `GET /api/meta`, which reads
  `constants/catalog.js`. Adding a category there updates Home, the browse page
  and the upload form with no frontend change.
- **Search matches partial words.** Queries run through an escaped,
  case-insensitive regex rather than `$text`, so `port` finds `Portfolio`.
- **Role checks read the database.** `requireRole()` re-reads the user's role on
  every request instead of trusting the JWT, so a revoked role takes effect on
  the next call.
- **Uploads are hard to abuse.** MIME type is validated against the extension,
  sizes are capped, `.zip` is the only archive accepted, SVG is refused, and
  uploaded files are served with `nosniff` plus a `default-src 'none'` CSP and
  `sandbox`.
- **Anonymous visitors are not punished.** `optionalAuth` degrades an invalid
  token to "not logged in" instead of turning every public page into a 401.

---

## Testing

```bash
npm run smoke
```

The smoke test spawns its own API on a scratch port against its own MongoDB
(`web-craft-smoke`, port 27018) so it never touches your working data. It runs
**108 checks** covering registration and login, role enforcement, template CRUD
and ownership, upload limits, download streaming and de-duplication, developer
profiles, search/filter/pagination, account settings and error handling.

It exits non-zero on any failure, so it can gate CI.
