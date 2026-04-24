# Kanban

A Trello-style kanban board for tracking client web-development projects.
Built to live entirely on Cloudflare's stack.

- **Frontend**: React 19 + Vite 7 + TypeScript + Tailwind v4 + shadcn-style UI + dnd-kit
- **Backend**: Hono on Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite) via Drizzle ORM
- **Files**: Cloudflare R2 for card attachments
- **Auth**: Better Auth — Google + GitHub OAuth, email/password, and magic link
- **Email**: Resend (for magic links, verification, password reset, board invites)

## Features

- Boards → Lists → Cards (Trello model)
- Drag and drop for both cards (within / across lists) and lists themselves
- Markdown card descriptions and comments
- Multiple checklists per card with progress bars
- Labels with custom colors
- Due dates (with Today/Overdue highlighting + a month calendar view)
- File attachments (images preview inline; everything else streams from R2)
- Card assignees (per-board members)
- Per-board roles: owner / admin / member / viewer
- Email-based board invites
- Per-board activity feed
- Global search across all boards & cards
- Light + dark theme
- Optimistic drag-and-drop updates with server-side persistence

## Project layout

```
kanban/
├── worker/                 # Hono API on Cloudflare Workers
│   ├── index.ts            # routes mounting + middleware
│   ├── auth.ts             # Better Auth config
│   ├── db/                 # Drizzle schema + client
│   ├── lib/                # ids, permissions, activity logger
│   └── routes/             # boards, lists, cards, ...
├── src/                    # React SPA (Vite)
│   ├── pages/              # /login, /signup, /, /b/:id, /calendar, /search
│   ├── components/         # kanban-board, card-detail-modal, etc.
│   ├── components/ui/      # shadcn-style primitives
│   └── lib/                # api client, auth client, utils
├── drizzle/                # Generated SQL migrations
├── wrangler.jsonc          # Cloudflare config (D1, R2, vars)
├── vite.config.ts          # Vite + Cloudflare plugin
└── tsconfig*.json          # split TS configs (app / worker / node)
```

## Local dev setup

### 1. Install dependencies

```bash
npm install --legacy-peer-deps
```

`--legacy-peer-deps` is currently required because better-auth declares an
optional peer dep (`@lynx-js/react`) that conflicts with our React 19 types.

### 2. Configure secrets

Copy the example file and fill in the values:

```bash
cp .dev.vars.example .dev.vars
```

You'll want to set:

- `BETTER_AUTH_SECRET` — generate with `openssl rand -base64 32`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — from
  [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
  Authorized redirect URI: `http://localhost:5173/api/auth/callback/google`
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — from
  [GitHub Developer Settings](https://github.com/settings/developers).
  Callback URL: `http://localhost:5173/api/auth/callback/github`
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` — sign up at
  [resend.com](https://resend.com)

If you skip Resend, magic-link / verification / invite emails will be logged
to the console instead of sent.

### 3. Create the local D1 database & apply migrations

```bash
# Create the local D1 (only runs once; updates wrangler.jsonc with the ID
# the first time, but you can also wire it up manually).
npx wrangler d1 create kanban-db

# Copy the printed `database_id` into wrangler.jsonc (replace REPLACE_WITH_YOUR_D1_ID)
# Then apply the generated migration locally:
npm run db:migrate:local
```

### 4. Create the local R2 bucket

```bash
npx wrangler r2 bucket create kanban-attachments
```

### 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The Vite dev server runs
both the React SPA and the Hono Worker through `@cloudflare/vite-plugin`, so a
single `npm run dev` gives you the full stack with hot reload.

## Database & migrations

Drizzle is the source of truth. The schema lives in
[`worker/db/schema.ts`](worker/db/schema.ts).

```bash
# After editing the schema, generate a new SQL migration:
npm run db:generate

# Apply locally (against the in-process D1 used by `npm run dev`):
npm run db:migrate:local

# Apply to the remote D1 you created on Cloudflare:
npm run db:migrate:remote
```

## Deploying to Cloudflare

### One-time: provision resources

```bash
# 1. Create the production D1 + R2 (if you haven't already)
npx wrangler d1 create kanban-db
npx wrangler r2 bucket create kanban-attachments

# 2. Set production secrets
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_FROM_EMAIL

# 3. Apply the schema to remote D1
npm run db:migrate:remote
```

Update the Worker's `vars.APP_URL` in `wrangler.jsonc` to your production URL
(e.g. `https://kanban.yourdomain.com` or `https://kanban.<workersdev>.workers.dev`),
and update the OAuth callback URLs in Google/GitHub to match.

### Deploy

```bash
npm run deploy
```

That's `vite build` + `wrangler deploy`. The SPA is served as static assets
out of `dist/client/` via the Worker's `ASSETS` binding, with SPA routing
fallback baked in.

## Permission model

Every board has members with one of four roles:

| Role     | Read | Write | Manage members | Delete board |
| -------- | :--: | :---: | :------------: | :----------: |
| viewer   | ✅   |       |                |              |
| member   | ✅   | ✅    |                |              |
| admin    | ✅   | ✅    | ✅             |              |
| owner    | ✅   | ✅    | ✅             | ✅           |

The board creator is automatically `owner`. Invitees default to `member` and
can be promoted/demoted from the Members panel.

## Roadmap (post-MVP ideas)

- Real-time collaboration via Cloudflare Durable Objects + WebSockets
- Card mentions (`@user`) with email notifications
- Saved filters / per-board card filters
- Card cover images
- Per-card cover color
- Board templates
- Public read-only board sharing via secret link
- Keyboard shortcuts
- Bulk card actions

## License

MIT — do whatever you want.
