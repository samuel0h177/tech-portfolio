# ESTO Technology Portfolio — Modern Remake

A modern remake of the NASA [ESTO Technology Portfolio](https://esto.nasa.gov/TechPortfolio/) search. It rebuilds the legacy ColdFusion experience (keyword / PI / faceted search, sortable results, quad-chart PDFs, documents) with:

- **MySQL 9** — dedicated `esto_portfolio` database
- **NestJS + Prisma** — REST API (search, facets, auth, admin CRUD, Gemini help agent)
- **Vue 3 + Vuetify** — faceted, responsive SPA styled after NASA/ESTO
- **Scraper / ETL** — load real project data from the live TechPortfolio or a source MySQL dump

> Independent demonstration. Data is indexed from esto.nasa.gov; PDFs are hot-linked. Not an official NASA website.

---

## Architecture

```
apps/
  api/       NestJS REST API (search, facets, PI, auth, admin, assistant)
  web/       Vue 3 + Vuetify + Vite SPA
  scraper/   Crawls the live TechPortfolio
prisma/      Schema, migrations, seed, ETL importer
```

```mermaid
flowchart LR
  subgraph clients [Clients]
    spa[VueSPA]
    adminUi[AdminUI]
  end

  subgraph apps [Monorepo]
    api[NestJS_API]
    webDist[WebDist_static]
  end

  db[(MySQL_esto_portfolio)]
  nasa[esto.nasa.gov]
  gemini[Google_Gemini]

  spa -->|REST_/api| api
  adminUi -->|JWT_/api| api
  api --> db
  api -->|function_calling| gemini
  api -->|PDF_proxy| nasa
  api -.->|prod_serves| webDist
  nasa -.->|scrape_or_ETL| db
```

In **local development**, Vite serves the SPA and proxies `/api` (or calls `VITE_API_BASE_URL` directly).  
In **production (Railway)**, one Nest process serves both the built SPA and `/api` on the same origin.

---

## Prerequisites

- Node.js 20+ (developed on Node 25)
- Local MySQL 9 on `127.0.0.1:3306`, user `root`, no password (or adjust `.env`)

---

## Setup

```bash
# 1. Install workspace dependencies
npm install

# 2. Create the database
mysql -h 127.0.0.1 -P 3306 -u root -e "CREATE DATABASE IF NOT EXISTS esto_portfolio CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 3. Copy env and adjust if needed
copy .env.example .env   # Windows
# cp .env.example .env   # macOS / Linux

# 4. Schema + seed (categories + admin user)
npx prisma migrate deploy
npx prisma db seed

# 5. Load project data (pick one path below)
npm run scrape            # from live site (~5 min; add -- --skip-docs to skip docs)
# or: npm run db:import   # from local SOURCE_DATABASE_URL (techportfolio)
```

```mermaid
flowchart TD
  start[Clone_and_npm_install] --> dbCreate[Create_esto_portfolio_DB]
  dbCreate --> env[Copy_.env.example_to_.env]
  env --> migrate[prisma_migrate_deploy]
  migrate --> seed[prisma_db_seed]
  seed --> choose{Load_data_how}
  choose -->|Live_site| scrape[npm_run_scrape]
  choose -->|Local_source_MySQL| etl[npm_run_db_import]
  scrape --> ready[Ready_for_dev_servers]
  etl --> ready
```

---

## Running (development)

```bash
npm run dev:api           # http://localhost:3001/api
npm run dev:web           # http://localhost:5173
```

Open http://localhost:5173.

Admin: http://localhost:5173/admin — credentials from `.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`, default `admin@esto.local` / `changeme123`).

```mermaid
flowchart LR
  browser[Browser]
  vite[Vite_dev_server_:5173]
  nest[NestJS_API_:3001]
  mysql[(MySQL)]

  browser -->|SPA_assets| vite
  browser -->|"/api or VITE_API_BASE_URL"| nest
  vite -.->|optional_proxy_/api| nest
  nest --> mysql
```

### Help Agent (Gemini)

The floating **Portfolio Helper** answers portfolio questions and can apply search filters or open project pages. NestJS calls Gemini (`gemini-3.6-flash`) with tools over the existing search layer and streams the reply to the UI.

On a project detail page, the agent also receives the **current project** as context.

#### Setup

1. Create a key at [Google AI Studio](https://aistudio.google.com/apikey).
2. Set `GEMINI_API_KEY` in `.env`. Default provider is Gemini (`LLM_PROVIDER=gemini`).
3. Restart `npm run dev:api`.

Without a key, the chat UI still appears but returns a configuration message. Outbound HTTPS to `generativelanguage.googleapis.com` must be reachable from the API host.

Disable the helper UI with `VITE_ENABLE_HELP_AGENT=false` in `.env` (restart Vite).

Optional: set `LLM_PROVIDER=lmstudio` plus `LM_STUDIO_MODEL` to use a local LM Studio server instead.

```mermaid
sequenceDiagram
  participant User
  participant Web as HelpAgent_UI
  participant API as Nest_assistant
  participant Gemini
  participant DB as MySQL

  User->>Web: Ask_question
  Web->>API: POST_/api/assistant/chat/stream
  API-->>Web: SSE_status_thinking_tools
  API->>Gemini: chat_completions_plus_tools
  alt Needs_portfolio_data
    Gemini-->>API: tool_calls
    API->>DB: search_or_get_project
    DB-->>API: rows
    API->>Gemini: tool_results
  end
  alt Update_UI
    Gemini-->>API: apply_search_or_open_project
    API-->>Web: message_plus_actions
    Web->>User: Apply_filters_or_navigate
  else Answer_only
    Gemini-->>API: text
    API-->>Web: message
    Web->>User: Show_reply
  end
```

---

## Search flow

Public search combines free-text (MySQL `FULLTEXT` boolean mode + legacy operators), structured filters, and contextual facet counts.

```mermaid
flowchart TD
  ui[SearchView_filters] --> params[buildParams]
  params --> projects[GET_/api/projects]
  params --> facets[GET_/api/facets]
  projects --> parse[parseQuery_operators_TRL]
  parse --> sql[Raw_SQL_MATCH_AGAINST_plus_filters]
  sql --> ids[Ordered_project_ids]
  ids --> hydrate[Prisma_hydrate_relations]
  hydrate --> list[ProjectListItem_page]
  facets --> counts[Facet_counts_per_dimension]
  list --> render[Cards_or_table]
  counts --> sidebar[FacetSidebar]
```

Supported keyword operators (mirroring the original): `+include` / `-exclude`, `word*`, `a OR b`, `word~`, `"exact phrase"`, `"TRLcurrent=5"` (and TRL in/out variants).

---

## Deployment (Railway)

One Node process serves the built Vue SPA and `/api`. MySQL runs in the same Railway project over private networking.

```mermaid
flowchart LR
  browser[Browser]
  app[Railway_esto_app]
  dist[apps_web_dist]
  apiRoutes["/api_*"]
  mysql[(Railway_MySQL)]
  nasa[esto.nasa.gov]

  browser -->|same_origin| app
  app --> dist
  app --> apiRoutes
  apiRoutes -->|private_MYSQL_URL| mysql
  apiRoutes -->|PDF_proxy| nasa
```

### 1. Create the Railway project

1. New project → **Deploy from GitHub repo**. Railway reads [`railway.json`](railway.json): build `npm run build`, start `npm run start`. `prisma generate` runs via root `postinstall`.
2. In the same project, **+ New → Database → MySQL**.

### 2. App service variables

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{ MySQL.MYSQL_URL }}` (private network) |
| `JWT_SECRET` | Long random string |
| `JWT_EXPIRES_IN` | e.g. `12h` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin login |
| `GEMINI_API_KEY` | Enables Help Agent in prod |

`PORT` is injected by Railway. Leave `VITE_API_BASE_URL` **unset** so the SPA uses same-origin `/api`.

### 3. Load demo data (from your machine)

Fastest path: `mysqldump` into the MySQL plugin’s **public TCP proxy** (`MYSQL_PUBLIC_URL`).

```powershell
$env:DATABASE_URL="mysql://root:PASSWORD@HOST.proxy.rlwy.net:PORT/railway"
npx prisma migrate deploy

cmd /c "mysqldump -h 127.0.0.1 -P 3306 -u root --add-drop-table --single-transaction --no-tablespaces --set-gtid-purged=OFF --ignore-table=esto_portfolio._prisma_migrations esto_portfolio | mysql -h HOST.proxy.rlwy.net -P PORT -u root -pPASSWORD --get-server-public-key railway"
```

```mermaid
flowchart LR
  local[(Local_esto_portfolio)] -->|mysqldump_pipe| proxy[Railway_MySQL_public_proxy]
  proxy --> remote[(Railway_MySQL)]
  migrate[prisma_migrate_deploy] --> remote
```

The dump includes the seeded admin, so `admin@esto.local` / `changeme123` works immediately.

Slower alternative: point `DATABASE_URL` at the proxy, `SOURCE_DATABASE_URL` at local `techportfolio`, then `npm run db:import` and `npm run prisma:seed`.

---

## Key features

### Search (public)

- Advanced keyword operators over MySQL `FULLTEXT ... IN BOOLEAN MODE`
- Contextual facets with live counts (program, status, category tree, org type)
- PI autocomplete, sort, card / table views, pagination, CSV export of all matches
- Project detail: team, TRL ladder, categories, embedded quad-chart PDF, document links
- Help Agent: natural-language Q&A via Gemini + apply search / open project; aware of the current project detail page

### Admin (JWT-protected)

- Seeded admin (bcrypt); `POST /api/auth/login` issues a JWT
- CRUD for projects, categories, PIs, organizations, document URL references

```mermaid
flowchart TD
  login[POST_/api/auth/login] --> jwt[JWT_issued]
  jwt --> guard[JwtAuthGuard]
  guard --> admin[CRUD_/api/admin]
```

---

## API overview

| Method | Route | Description |
| --- | --- | --- |
| GET | `/api/projects` | Search with filters, sort, pagination |
| GET | `/api/projects/:id` | Full project detail |
| GET | `/api/projects/:id/quad-chart` | Same-origin PDF proxy for iframe embed |
| GET | `/api/facets` | Contextual facet counts |
| GET | `/api/pi` | PI autocomplete |
| POST | `/api/assistant/chat` | Help agent (JSON) |
| POST | `/api/assistant/chat/stream` | Help agent (SSE: status, thinking, tools, token stream, answer) |
| POST | `/api/auth/login` | Admin login (JWT) |
| GET | `/api/auth/me` | Current admin |
| * | `/api/admin/**` | Guarded CRUD |

---

## Notes

- Legacy scrape results often omit abstracts / TRL; those can be curated in admin (quad charts usually contain the detail).
- PDFs are hot-linked; files are not stored locally.
- Help Agent needs a valid `GEMINI_API_KEY` and outbound access to Google’s Generative Language API (see Help Agent section).
