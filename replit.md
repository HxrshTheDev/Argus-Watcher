# Argus — Personal AI Assistant

A modular personal AI assistant web app with 7 integrated modules.

## Architecture

- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui (dark theme by default), at `/`
- **Backend**: Express server at `/api`
- **Database**: PostgreSQL via Drizzle ORM
- **AI**: OpenAI via Replit integration (auto-configured)
- **Routing**: Wouter (client-side)

## Monorepo Structure

```
artifacts/
  argus/          — React+Vite frontend (port 25063, preview path /)
  api-server/     — Express API server (port 8080, prefix /api)
  mockup-sandbox/ — Component preview server (port 8081)
lib/
  db/             — Drizzle ORM schema + migrations
  api-spec/       — OpenAPI spec (openapi.yaml)
  api-zod/        — Generated Zod schemas for backend validation
  api-client-react/ — Generated React Query hooks for frontend
  integrations-openai-ai-server/ — OpenAI server integration
  integrations-openai-ai-react/  — OpenAI React integration
```

## Modules

| Module | Route | Description |
|--------|-------|-------------|
| Dashboard | `/` | Stats overview + recent activity feed |
| Chat | `/chat` | SSE streaming conversations with AI |
| Tasks | `/tasks` | Task manager with priorities, due dates, filtering |
| Research | `/research` | AI-powered research with saved notes |
| Email | `/email` | Draft + summarize emails with AI |
| Posts | `/posts` | Social media post generator |
| Workflows | `/workflows` | Automation workflow builder + runner |

## Database Schema

Tables: `conversations`, `messages`, `tasks`, `research_notes`, `email_drafts`, `social_posts`, `workflows`

Run migrations: `pnpm --filter @workspace/db run push`

## API Routes

All routes are prefixed with `/api`:
- `GET/POST /api/conversations` — manage conversations
- `POST /api/openai/conversations/:id/messages` — SSE chat streaming
- `GET/POST/PATCH/DELETE /api/tasks` — task CRUD
- `GET /api/tasks/stats` — task statistics
- `GET/POST/DELETE /api/research` — research notes
- `POST /api/research/query` — AI research query
- `GET/POST/DELETE /api/emails` — email drafts
- `POST /api/emails/draft` — AI email generation
- `POST /api/emails/summarize` — AI email summarization
- `GET/POST/DELETE /api/posts` — social posts
- `POST /api/posts/generate` — AI post generation
- `GET/POST/PATCH/DELETE /api/workflows` — workflow CRUD
- `POST /api/workflows/:id/run` — run a workflow
- `GET /api/dashboard/stats` — dashboard statistics
- `GET /api/activity` — recent activity feed

## Key Implementation Notes

- DB returns `Date` objects; use `serialize()` from `api-server/src/lib/serialize.ts` before Zod-parsing DB results
- Conversations table has both `createdAt` and `updatedAt` columns
- OpenAI model used: `gpt-4.1`
- Frontend uses React Query hooks from `@workspace/api-client-react`
- Chat uses `fetch` + `ReadableStream` for SSE (not mutation hook)

## Gmail Integration (Pending)

The Gmail inbox/send/reply feature is built and ready (`artifacts/api-server/src/routes/gmail.ts`).
The Gmail OAuth connector (`connector:ccfg_google-mail_B959E7249792448ABBA58D46AF`) was dismissed by the user.

To enable Gmail:
- **Option A (Replit):** Re-run `proposeIntegration("connector:ccfg_google-mail_B959E7249792448ABBA58D46AF")` and complete the OAuth flow. Then set `GMAIL_CONNECTION_ID` in environment secrets.
- **Option B (Manual):** Provide a Gmail OAuth refresh token + client credentials, and store them as secrets (`GMAIL_REFRESH_TOKEN`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`). The gmail.ts route will need updating to use these directly.

Until connected, the Inbox tab in the Email module shows a "Gmail Not Connected" message gracefully.

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (auto-set by Replit)
- `SESSION_SECRET` — session secret (set as Replit secret)
- `OPENAI_API_KEY` — auto-set by Replit OpenAI integration
- `GMAIL_CONNECTION_ID` — set after completing Gmail OAuth (optional, enables Inbox tab)
