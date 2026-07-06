# ESTO Technology Portfolio — Modern Remake

A modern, interactive remake of the NASA [ESTO Technology Portfolio](https://esto.nasa.gov/TechPortfolio/) search. It reverse-engineers the legacy ColdFusion search (keyword / PI / faceted category search, sortable results, quad-chart PDFs, supporting documents) and rebuilds it with:

- **MySQL 9** datastore (isolated in a dedicated `esto_portfolio` database)
- **NestJS + Prisma** REST API (advanced search, faceting, JWT-guarded admin CRUD)
- **Vue 3 + Vuetify** SPA (faceted, debounced, responsive UI styled after NASA/ESTO)
- A **scraper** that loads real project data from the live TechPortfolio

> Independent demonstration project. Project data is indexed from esto.nasa.gov; PDFs are hot-linked to the live NASA site. Not an official NASA website.

## Architecture

```
apps/
  api/       NestJS REST API (search, facets, PI, auth, admin CRUD)
  web/       Vue 3 + Vuetify + Vite frontend
  scraper/   Crawls the live TechPortfolio into MySQL
prisma/      Schema, migrations, seed (categories + admin user)
```

Data flow: `live esto.nasa.gov` → `scraper` → `MySQL (esto_portfolio)` ← `NestJS API` ← `Vue SPA` / `Admin UI`. PDFs are hot-linked from NASA.

## Prerequisites

- Node.js 20+ (developed on Node 25)
- A local MySQL 9 server on `127.0.0.1:3306`, user `root`, no password

## Setup

```bash
# 1. Install all workspace dependencies
npm install

# 2. Create the dedicated database
mysql -h 127.0.0.1 -P 3306 -u root -e "CREATE DATABASE IF NOT EXISTS esto_portfolio CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 3. Copy env and adjust if needed
copy .env.example .env   # (Windows)  |  cp .env.example .env

# 4. Apply migrations + seed tech categories and the admin user
npx prisma migrate deploy
npx prisma db seed

# 5. Load real project data from the live site (~5 min incl. documents)
npm run scrape            # add -- --skip-docs to skip document fetching
```

## Running (development)

```bash
npm run dev:api           # NestJS API on http://localhost:3001/api
npm run dev:web           # Vite dev server on http://localhost:5173 (proxies /api)
```

Open http://localhost:5173.

Admin area: http://localhost:5173/admin — sign in with the seeded credentials
from `.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`, default `admin@esto.local` / `changeme123`).

## Key features

### Search (public)
- **Advanced keyword operators** mirroring the original: `+include` / `-exclude`, `word*` wildcards, `a OR b`, `word~` fuzzy, `"exact phrase"`, and TRL filters like `"TRLcurrent=5"`. Implemented over MySQL `FULLTEXT ... IN BOOLEAN MODE` with structured TRL extraction.
- **Contextual facets** with live counts: Program (ESTO / Other), Status (Active / Complete), Technology Category tree (Sensors, Information Systems, Platforms, Computational Technology, FireSense, Flight Validation + sub-categories), Organization type (Academia / Industry / NASA Centers / Federal Labs). Each facet count excludes its own dimension.
- **PI autocomplete**, sortable columns, card / table views, server-side pagination.
- **Project detail** page: PI, organization, TRL ladder (in/current/out), categories, embedded quad-chart PDF viewer, and supporting-document links.

### Admin (JWT-protected)
- Single seeded admin (bcrypt). `POST /api/auth/login` issues a JWT.
- Full CRUD for projects (with category assignment, TRL, quad-chart URL), plus management of tech categories, principal investigators, organizations, and document URL references.

## API overview

| Method | Route | Description |
| --- | --- | --- |
| GET | `/api/projects` | Search with filters, sort, pagination |
| GET | `/api/projects/:id` | Full project detail |
| GET | `/api/facets` | Contextual facet counts |
| GET | `/api/pi` | PI autocomplete |
| POST | `/api/auth/login` | Admin login (JWT) |
| GET | `/api/auth/me` | Current admin |
| * | `/api/admin/**` | Guarded CRUD (projects, documents, PIs, orgs, categories) |

## Notes / possible follow-ups
- The legacy results table does not expose abstracts or TRL values, so those fields are empty after scraping and can be curated via the admin UI (the quad-chart PDFs contain that detail).
- PDFs are hot-linked; no files are stored locally.
