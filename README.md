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

There are two ways to change what the site says. They operate on the same
data, and a third command moves work from one to the other.

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

### 3. The dashboard, then `just dbsync`

The two surfaces are not alternatives. Edit in the dashboard — which is far
faster for reordering a roster or fixing a typo — and then pull the result
back into `content/`, where it can be reviewed and committed like any other
change:

```bash
just dbsync             # everything
just dbsync members     # just the roster
just dbsync blogs       # categories and every post
just dbsync members alumni
```

Nothing leaves the database until you run it, so the dashboard is usable as
a drafting tool: change things all afternoon, look at them on the site, and
decide afterwards what becomes permanent.

The sections are `settings`, `blogs`, `members`, `alumni`, `collaborations`,
`events` and `ieee-day`; `team`, `posts`, `sponsors` and similar names work
too. `just content-import` takes the same names, so one section can be pushed
as well as pulled.

Naming a section matters because a sync **regenerates whole files**. Pulling
the roster back should not also reformat every blog post, and a one-file diff
is one you will actually read. For the same reason, comments you add inside a
generated file do not survive a sync — the header of each file says so.

`just dbsync` prints which files changed, so a run that did nothing says so
rather than leaving you to check.

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
- A post's `excerpt:` is optional. Leave it out and the opening of the body is
  used, worked out each time the post is served - so it follows edits to the
  body, and an export never writes it back into the file as if you had.
- Publishing a post from the dashboard dates it that day if it has no date
  yet. A file's `date:` is taken as written, so a file without one stays
  undated (an import cannot invent a date without changing it on every run).

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
| `just content-import [section]` | Load `content/` into the database |
| `just dbsync [section]` | Pull the database back into `content/` |
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
| `MAX_REQUEST_BODY_MB` | Largest request body accepted (default 10). Keep it above the upload cap |
| `EMAIL_BACKEND` | `console`, `smtp` or `none` |
| `SMTP_*`, `EMAIL_FROM`, `EMAIL_TO` | Used when the backend is `smtp` |
| `CORS_ORIGINS` | Only needed when the frontend is served from another origin |
| `TRUSTED_PROXIES` | IPs/CIDRs of reverse proxies allowed to set `X-Forwarded-For`. See below |
| `VITE_API_BASE_URL` | Build-time. Leave empty for the default same-origin setup |

**The application refuses to start in production** with the development
signing key, with a key under 32 characters, with a plain `http://` or
localhost site URL, with the development Postgres password, with sessions
longer than 24 hours, or with `EMAIL_BACKEND=smtp` and no SMTP host. Outside
production these are warnings.

**Behind a reverse proxy, set `TRUSTED_PROXIES`.** Sign-in and contact-form
rate limits are keyed by client IP. `X-Forwarded-For` is attacker-controlled,
so it is only believed when the connection comes from a listed proxy; with the
variable empty the socket address is used. If you put nginx or Caddy in front
of the container and leave it empty, every visitor shares the proxy's address
and therefore one rate-limit bucket.

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

**Palette.** IEEE's own and nothing else: brand blue (`#00629B`) carrying
every accent, IEEE navy (`#002855`) as the dark ground, and otherwise paper
and ink. There is no decorative third colour, because the work of
distinguishing one band from the next is done by typography and texture
instead — ultra-condensed display type, hard offset shadows, a print grain,
halftone screens, and photography treated as printed ink that returns to
colour under the pointer. Tokens live in `frontend/src/styles/theme.css`.

Two layers of token, and the distinction matters. `--color-ieee-*` is the
fixed brand scale. `--surface-*`, `--text-*` and `--accent*` are semantic
roles that swap with the theme, and they are what components use. One value
cannot serve two roles: a light-only design can call its near-black "ink" and
use it for both body text and contrast bands, but the moment there is a dark
theme those two uses move in opposite directions. The accent splits for the
same reason — IEEE blue sets type perfectly well on white (6.6:1) and not at
all on navy (2.2:1), so `--accent` (type on the page), `--accent-fill`
(backgrounds, under white text) and `--accent-on-dark` (type on a navy or ink
band) are three tokens rather than one. In dark mode the first brightens and
the second deepens; a single token would fail one of them, and the arithmetic
is in the stylesheet's comments.

**Typography.** Archivo for display, Instrument Sans for text, DM Mono for
labels, all self-hosted. Archivo is there for its width axis: `.cond` at 62%
and `.wide` at 125% are the same font file, which is what gives both the
ultra-condensed headline and the wide wordmark without a second family.
Headings deliberately do not set a colour, so a heading inherits the band it
sits in rather than painting itself the page's own ink on a navy ground.

**Themes.** Light and dark both ship. The palette is defined on bare `:root`
so a value always exists; dark redefines only what changes, under both a
media query and a `data-theme` attribute, so the toggle wins in either
direction and the system preference is the default.

**Editorial sections.** The perks, testimonials and FAQ bands are site
settings rather than database tables — a list that changes once a year does
not need a migration and an admin screen. Each is parsed in
`frontend/src/utils/settings.ts`, each hides its whole section when its
setting is empty, and none of them ships placeholder copy. The hero and join
headlines take two characters of markup: a newline breaks the line, and
`*asterisks*` mark the accented word.

**Motion.** Three kinds, kept apart. *Entrances* (`components/ui/Reveal.tsx`)
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

The third kind is the hero's oscilloscope (`components/ui/Wave.tsx`), the one
canvas on the site. It draws a trace that is chaotic on the left and resolves
into a clean waveform on the right, and it cleans up further as the hero
scrolls past — noise in, signal out, which is the branch's own pitch drawn in
one line. It measures its own host rather than being handed a progress value,
so no parent re-renders sixty times a second to feed it; it is gated on an
IntersectionObserver, so it stops entirely when scrolled out of view; it
reads its stroke colour from a theme token and follows both the toggle and
the system preference; and under reduced motion it draws exactly one static
frame and never starts the loop.

**Interaction.** Cards lean toward the pointer, the primary call to action
leans back, a square pip marks the current page and previews on hover, and
the header's bottom rule is scaled to reading progress. On the landing page
the featured events stack as sticky cards so the one you are reading stays
put while the next slides over it, the perks list lights only the row
crossing the middle of the viewport, and the activity grid's icons draw
themselves in on hover — triggered by CSS rather than React, so hovering
costs no renders, and on `focus-within` too, so the keyboard sees what the
pointer does. Accordions animate on `grid-template-rows: 0fr → 1fr`, so each
panel sizes itself to its content and nothing is measured back out of the
DOM. All pointer-led motion is inert on touch, where there is no hover to
answer and a transform under a finger only fights the scroll.

**Accessibility.** Semantic landmarks and one `h1` per page; every control
labelled; visible focus rings everywhere; status conveyed by icon or word as
well as colour; dialogs trap focus and restore it on close; the first tab
stop is a skip link. Headlines that animate a word at a time render the plain
string for screen readers and hide the split-up copy, so a heading is
announced as a sentence rather than as a stream of words. Every text/background
pair on the public site was measured against WCAG AA in both themes; the
accent token split above is what that measurement forced.

**Performance.** Routes are lazily loaded and the vendor bundle is split, so
the landing page ships about 167 KB gzipped — React 68, Motion 45, the app
26, the router 14, CSS 16 — and the entire dashboard (18 KB gzipped) is never
downloaded by a visitor reading a blog post. The 143
imported images were re-encoded to WebP at display sizes, taking 94 MB of
originals down to 6.9 MB.

**Security.** Markdown is rendered and then sanitised against an allow-list
server-side (with [nh3](https://github.com/messense/nh3)), so post bodies are
safe to inject. Uploads are validated by decoding the image rather than
trusting its name or type, and the stored filename is generated, never taken
from the client. Still images are re-encoded without their EXIF metadata, so a
phone photo does not publish where it was taken. SVG uploads are refused —
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
  of each collaboration and the year it happened were never recorded. Add
  `collaboration_type` and `year` to an entry in `content/collaborations.yaml`
  (the file's header lists them) or set them in the dashboard.
- **Event to double-check.** "IEEE: Inauguration 2025" is dated 2024-11-05 and
  its poster is named `ieee-inaugration-2024.webp`, so it is filed under 2024.
  Either the title or the date is wrong; nothing here can tell which.
- **Benefits of IEEE cover.** The cover imported for that post is a small
  logo scaled up, and looks soft at article width. It needs a better source
  image.
- **Rate limiting is in-process.** Fine for a single container. Running more
  than one replica needs this moved to Redis, since each process currently
  keeps its own counters.
