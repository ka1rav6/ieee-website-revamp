# IEEE IIIT Delhi

The website of the IEEE Student Branch at IIIT Delhi.

React and TypeScript on the front, FastAPI and PostgreSQL behind it, shipped
as a single Docker image. Content lives both in the database (so it can be
edited from a dashboard) and as plain files in `content/` (so it can be
edited with a text editor and a one-line command).

---

## Contents

- [Quick start](#quick-start)
- [Architecture](#architecture)
- [Updating content](#updating-content)
- [Project layout](#project-layout)
- [Everyday commands](#everyday-commands)
- [Environment variables](#environment-variables)
- [Database and migrations](#database-and-migrations)
- [The admin account](#the-admin-account)
- [Contact form notifications](#contact-form-notifications)
- [Testing](#testing)
- [Docker](#docker)
- [Deployment](#deployment)
- [Design notes](#design-notes)
- [Known gaps](#known-gaps)

---

## Quick start

You need **Docker**, **Node 22+**, **Python 3.12**, [**uv**](https://docs.astral.sh/uv/)
and [**just**](https://github.com/casey/just).

```bash
just setup
```

That creates `.env` with a freshly generated signing key, installs both
dependency sets, starts PostgreSQL in Docker, applies the migrations and
loads everything under `content/` into the database.

Then set `ADMIN_PASSWORD` in `.env` (at least 12 characters), and:

```bash
just admin
just dev
```

- Site: <http://localhost:5173>
- Dashboard: <http://localhost:5173/admin>
- API docs: <http://localhost:8000/api/docs> (development only)

`just dev` runs the Vite dev server and the API together. Vite proxies `/api`
to the backend, so the browser sees a single origin and there is no CORS in
development.

To run the whole thing exactly as production does, in one container:

```bash
just run    # http://localhost:8000
```

---

## Architecture

```
                 browser
                    │
                    ▼
        ┌───────────────────────┐
        │   application image   │
        │                       │
        │  FastAPI              │
        │   ├── /api/v1/…       │  JSON API
        │   ├── /uploads/…      │  admin-uploaded images
        │   ├── /robots.txt     │  generated from live content
        │   ├── /sitemap.xml    │
        │   └── /*              │  the built React bundle
        └───────────┬───────────┘
                    ▼
               PostgreSQL
```

One container, one process. FastAPI serves the compiled React bundle itself,
which means the frontend and API share an origin: no CORS, no second
deployment, no reverse-proxy routing rules to keep in step. Any request that
is not an API, upload or static-asset path falls through to `index.html` so
client-side routing handles deep links.

PostgreSQL is the only external dependency. `docker-compose.yml` provides one
for local work; in production it is usually a managed instance — set
`DATABASE_URL` and the app will not care which.

**Why this shape.** A student branch hands this repository over every year.
The failure mode to design against is not scale, it is a maintainer who has
never seen the project before. So: one image, one database, no message
queues, no separate frontend host, no service mesh. Everything that changes
between terms is content, not code.

### Request flow

| Path | Handled by | Auth |
|---|---|---|
| `/api/v1/health`, `/landing`, `/blogs`, `/team`, … | public router | none |
| `/api/v1/contact` | contact router | none, rate-limited per IP |
| `/api/v1/auth/*` | auth router | login is rate-limited |
| `/api/v1/admin/*` | admin routers | bearer token, enforced on the parent router |
| `/uploads/*` | static files | none (published images) |
| everything else | the React bundle | none |

---

## Updating content

There are two ways to change what the site says, and they operate on the same
data.

### 1. The dashboard

Sign in at `/admin`. Blog posts, events, team members, alumni,
collaborations, IEEE Day editions and site copy are all editable there, with
image upload. Nothing in this list requires touching React.

### 2. The `content/` tree

```
content/
├── site.yaml             copy, links, contact details
├── team.yaml             the roster, in display order
├── alumni.yaml
├── collaborations.yaml
├── events.yaml
├── ieee-day.yaml         one entry per year
└── blogs/
    ├── categories.yaml
    └── <slug>.md         YAML frontmatter + Markdown body
```

Edit a file, then:

```bash
just content-import     # load content/ into the database
just content-check      # preview what an import would change
just content-validate   # check the files without touching the database
just content-export     # write the database back out to content/
```

The database is what the site serves; `content/` is the version-controlled
copy. Import is **idempotent and additive** — running it twice changes
nothing the second time, and it never deletes rows that are missing from the
files unless you ask:

```bash
uv --project backend run ieee-content import --prune
```

Pruning also refuses to empty a table when the corresponding file is missing
or empty, so a mistyped path cannot wipe the roster.

Round-tripping works in both directions: edit in the dashboard, run
`just content-export`, and review the diff like any other change.

**Conventions worth knowing**

- A blog post's **filename is its URL slug**. Renaming the file changes the
  URL and nothing else has to be updated.
- **List order is display order** in `team.yaml`, `alumni.yaml`,
  `collaborations.yaml` and `events.yaml`.
- Dates accept `2026-03-27` or `27 March 2026`.
- An unknown key in a YAML entry is an **error**, not a silent no-op, so a
  typo like `positon:` is caught immediately.
- `published: false` in a post's frontmatter keeps it a draft; drafts are
  invisible to the public API entirely, not merely unlinked.

---

## Project layout

```
.
├── Justfile                  every command you need
├── Dockerfile                the production image
├── docker-compose.yml        PostgreSQL for local development
├── docker-compose.prod.yml   overlay adding the app container
├── content/                  version-controlled site content
├── backend/
│   ├── app/
│   │   ├── main.py           application factory
│   │   ├── core/             settings, security, deps, errors, middleware
│   │   ├── db/               engine and session
│   │   ├── models/           SQLAlchemy models
│   │   ├── schemas/          Pydantic request/response schemas
│   │   ├── api/              routers (public, auth, contact, admin/)
│   │   ├── services/         text, blogs, uploads, email, notifications
│   │   ├── content/          the content import/export engine and CLI
│   │   └── cli/              administrator bootstrap
│   ├── alembic/              migrations
│   └── tests/
└── frontend/
    └── src/
        ├── api/              client and typed endpoints
        ├── components/       layout, cards, UI primitives
        ├── hooks/            data fetching, theme, auth, interaction
        ├── layouts/
        ├── pages/            public pages and pages/admin/
        ├── styles/           design tokens and base styles
        ├── types/            API types
        └── utils/
```

---

## Everyday commands

`just --list` shows everything. The ones you will actually use:

| Command | What it does |
|---|---|
| `just setup` | One-time setup: env, dependencies, database, content |
| `just dev` | Frontend and backend together, with reload |
| `just run` | The whole stack in Docker, as production runs it |
| `just test` | Both test suites |
| `just lint` / `just format` | Check / fix style, both languages |
| `just typecheck` | TypeScript |
| `just ci` | Everything CI runs, in CI's order |
| `just db` | A `psql` shell on the development database |
| `just db-migrate` | Apply pending migrations |
| `just db-migration "message"` | Generate a migration from model changes |
| `just db-reset` | Rebuild the database from scratch (destructive, prompts) |
| `just content-import` | Load `content/` into the database |
| `just content-export` | Write the database back out to `content/` |
| `just admin` | Create or update the administrator |
| `just secret` | Print a fresh random signing key |
| `just logs` | Tail container logs |
| `just clean` | Stop containers, remove build artefacts |

Run `just ci` before pushing; it is the same set of checks, in the same
order, so a green run locally means a green run on GitHub.

---

## Environment variables

`.env` is created from `.env.example` by `just setup` and is gitignored.
Every variable is documented in the template; the ones that matter:

| Variable | Notes |
|---|---|
| `ENVIRONMENT` | `development`, `test` or `production` |
| `SITE_URL` | Public origin. Used for canonical URLs, Open Graph and the sitemap |
| `SECRET_KEY` | Signs admin tokens. Generate with `just secret` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Admin session lifetime (default 720) |
| `DATABASE_URL` | Overrides the `POSTGRES_*` parts. Required for managed Postgres |
| `POSTGRES_*` | Host, port, user, password, database |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Read by `just admin`; the password is argon2-hashed and never returned by the API |
| `UPLOAD_DIR`, `MAX_UPLOAD_SIZE_MB` | Where admin images go, and the cap |
| `EMAIL_BACKEND` | `console`, `smtp` or `none` |
| `SMTP_*`, `EMAIL_FROM`, `EMAIL_TO` | Used when the backend is `smtp` |
| `CORS_ORIGINS` | Only needed when the frontend is served from another origin |
| `VITE_API_BASE_URL` | Build-time. Leave empty for the default same-origin setup |

**The application refuses to start in production** with the development
signing key, with a key under 32 characters, with a plain `http://` site URL,
or with `EMAIL_BACKEND=smtp` and no SMTP host. Outside production these are
warnings.

Secrets never go in git. In CI they come from GitHub's own token; in
production, from your host's secret store.

---

## Database and migrations

PostgreSQL, SQLAlchemy 2.0, Alembic. Alembic takes its URL from application
settings, so migrations and the app cannot end up pointing at different
databases.

```bash
just db-migrate                      # apply everything pending
just db-migration "add x to y"       # generate from model changes
just db-rollback                     # back out one revision
just db-current                      # what the database is at
```

After changing a model, generate a migration and **read it** before
committing — autogenerate is a good first draft, not a final answer. CI fails
the build if models and migrations have drifted apart.

The container applies migrations on start, so a rollout brings the schema up
to date by itself.

---

## The admin account

There is exactly one administrator. There is no sign-up, no second role and
no user table — `admin` holds a single row.

```bash
# Set ADMIN_EMAIL and ADMIN_PASSWORD in .env, then:
just admin
```

Re-running it updates the password and invalidates every existing session.

- Passwords are hashed with **argon2id** and rehashed on sign-in if the
  parameters have since been strengthened.
- Sessions are stateless JWTs carrying a version claim; changing the password
  bumps the stored version, which retires every token already issued.
- Sign-in is rate-limited per IP (5 attempts per 15 minutes by default). A
  correct password clears the counter.
- Wrong password and unknown address return the identical response, so the
  endpoint cannot be used to discover the administrator's address.
- The token is kept in `sessionStorage`, never in a cookie, so it cannot ride
  along with a cross-site request.

In a container you can bootstrap the account on start with
`ADMIN_BOOTSTRAP_ON_START=true` and `ADMIN_PASSWORD` set.

---

## Contact form notifications

A submission is **stored first and notified second**, so a mail outage delays
the alert but never loses the enquiry. Every submission is visible in the
dashboard inbox regardless of what email does.

`EMAIL_BACKEND` selects the provider:

- `console` — log the message. The default, and fine in production if the
  team watches the dashboard.
- `smtp` — send over SMTP using `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`,
  `SMTP_PASSWORD` and `SMTP_USE_TLS`.
- `none` — store only.

Adding a provider means adding one function in
`backend/app/services/email.py`; nothing else knows how mail is sent.

Submissions are rate-limited to 5 per hour per IP.

---

## Testing

```bash
just test            # everything
just test-backend    # pytest
just test-frontend   # vitest
just coverage        # backend coverage report
```

**Backend** (203 tests) runs against a real PostgreSQL database, because the
schema uses Postgres enums and `NULLS LAST` ordering that SQLite would not
exercise. The test database is created automatically; each test runs inside a
transaction joined with `create_savepoint`, so application code can commit or
roll back without escaping its isolation. Start the database first with
`just db-up`.

Coverage is weighted toward the things that would matter if they broke:
drafts staying invisible, admin endpoints rejecting unauthenticated and
forged tokens, password changes retiring sessions, uploads rejecting renamed
scripts and path traversal, stored XSS not surviving rendering, and the
content importer being idempotent and round-tripping through export.

**Frontend** (56 tests) covers date handling that must not shift a day in
timezones behind UTC, the API client's error and token behaviour, card
rendering against the optional fields imported content actually lacks, and
the contact form end to end.

---

## Docker

```bash
just docker-build    # build the image
just docker-run      # run it against the compose database
just logs
```

The image is built in three stages — Node builds the bundle, a Python stage
resolves dependencies, and the runtime stage carries only what is needed. It
runs as a non-root user, declares a health check, and applies migrations on
start.

Two optional start-up behaviours, both off by default:

| Variable | Effect |
|---|---|
| `CONTENT_IMPORT_ON_START=true` | Import `content/` on start. Off by default so a deploy never silently overwrites dashboard edits |
| `ADMIN_BOOTSTRAP_ON_START=true` | Ensure the admin account exists (needs `ADMIN_PASSWORD`) |

Mount a volume at `/data/uploads`, or admin-uploaded images disappear on the
next restart.

---

## Deployment

CI publishes an image to GHCR once checks pass on `main`. Rollout is a
separate step on purpose — a merge should not deploy on its own.

**1. Provision**

- A PostgreSQL database. If it is managed (RDS, Cloud SQL, Neon, …), set
  `DATABASE_URL` instead of the `POSTGRES_*` variables and skip the compose
  database entirely.
- A volume for `/data/uploads`.
- TLS termination in front of the container. The app sets HSTS in production,
  which only means anything over HTTPS.

**2. Configure**

Set the production environment from `.env.example`. At minimum:
`ENVIRONMENT=production`, a real `SITE_URL`, a `SECRET_KEY` from
`just secret`, and database credentials. The app refuses to start if any of
these are wrong.

**3. Run**

```bash
docker pull ghcr.io/<owner>/<repo>:latest
docker run -d --name ieee-website \
  --env-file /etc/ieee-website.env \
  -v ieee-uploads:/data/uploads \
  -p 8000:8000 \
  ghcr.io/<owner>/<repo>:latest
```

Migrations run on start. Check `/api/v1/health` before switching traffic.

To build and push from a workstation instead:

```bash
REGISTRY=ghcr.io/ieee-iiit-delhi just deploy
```

Credentials come from the environment; none are stored in the repository.

**Rollback** is `docker run` with the previous tag. Avoid destructive
migrations so that staying compatible one version back is always possible.

---

## Design notes

**Palette.** Built from IEEE's brand blue (`#00629B`) and then taken
somewhere specific: a printed circuit board. Blue stays the brand and carries
primary actions, but the colours doing the everyday work are the ones you
find on a board — a teal-cyan "trace" for interaction and focus, copper for
emphasis, solder green for status. An all-blue page has nowhere for the eye
to land. The dark ground is FR-4 substrate rather than neutral black, which
is what lets a cyan trace read as lit rather than merely coloured. Tokens
live in `frontend/src/styles/theme.css`.

**Themes.** Light and dark both ship. The palette is defined on bare `:root`
so a value always exists; dark redefines only what changes, under both a
media query and a `data-theme` attribute, so the toggle wins in either
direction and the system preference is the default.

**Motion.** Two kinds, kept apart. *Entrances* (`components/ui/Reveal.tsx`)
fire once when an element is first seen — a spring-driven lift with a blur
resolving alongside it, so a card reads as coming into focus rather than
sliding into place — and use `whileInView` with `once`, so nothing replays on
the way back up. *Scroll-linked* motion (`hooks/useScrollMotion.ts`,
`components/ui/Scroll.tsx`) is a continuous function of scroll position
rather than of elapsed time: backdrop layers at three depths in the hero, the
glow inside a panel, and the one statement on the landing page that lights a
word at a time as it is read. Raw scroll arrives unevenly, so progress goes
through a light spring before it reaches a transform — that is what makes it
read as smooth. The section dividers' pulses use `animation-timeline: view()`
where the browser has it, which runs off the main thread, and are a plain
hairline where it does not. The hero's traces and glows are SVG and CSS with
no JavaScript loop, and the pointer lighting the board under the cursor is a
mask driven by two custom properties. Everything respects
`prefers-reduced-motion`: the stylesheet collapses durations globally and
every component checks the same preference before animating — the
scroll-linked ones skip their measurement entirely rather than measuring and
discarding the result.

**Interaction.** Cards lean toward the pointer, the primary call to action
leans back, the nav's marker travels between items instead of each item
fading its own in, and a back-to-top control carries the page position as a
ring. All of it is inert on touch, where there is no hover to answer and a
transform under a finger only fights the scroll.

**Accessibility.** Semantic landmarks and one `h1` per page; every control
labelled; visible focus rings everywhere; status conveyed by icon or word as
well as colour; dialogs trap focus and restore it on close; the first tab
stop is a skip link.

**Performance.** Routes are lazily loaded and the vendor bundle is split, so
the landing page ships about 167 KB gzipped — React 68, Motion 45, the app
26, the router 14, CSS 16 — and the entire dashboard (18 KB gzipped) is never
downloaded by a visitor reading a blog post. The 143
imported images were re-encoded to WebP at display sizes, taking 94 MB of
originals down to 6.9 MB.

**Security.** Markdown is rendered and then sanitised against an allow-list
server-side, so post bodies are safe to inject. Uploads are validated by
decoding the image rather than trusting its name or type, and the stored
filename is generated, never taken from the client. SVG uploads are refused —
an SVG is an executable document. Strict security headers including a CSP
that needs no external host, since every asset is served from this origin.

---

## Known gaps

Things a future maintainer should know are deliberately unfinished:

- **Blog post dates.** Ten of the eleven posts imported from the previous
  site carry no publication date, because the old site did not record one.
  They are stored as null and sort after dated posts; the date simply does
  not render. Fill them in through the dashboard or in each post's
  frontmatter.
- **IEEE Day content.** The page is complete and fully content-driven, but
  the branch has to supply its own statistics, highlights and photos — the
  previous site had no IEEE Day page to import from. Sections with no content
  are omitted rather than shown empty.
- **Collaboration details.** Names, logos and links were imported; the *type*
  of each collaboration and the year it happened were never recorded, so
  those fields start commented out in `content/collaborations.yaml`.
- **Rate limiting is in-process.** Fine for a single container. Running more
  than one replica needs this moved to Redis, since each process currently
  keeps its own counters.
