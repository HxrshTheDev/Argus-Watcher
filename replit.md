# Argus — Personal AI Assistant

A modular personal AI assistant web app with 8 integrated modules including a NotebookLM-style research workspace.

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
| Chat | `/chat` | Claude-like SSE streaming conversations with AI |
| Tracker | `/tracker` | Tasks + Overview + Habits with keyboard shortcuts |
| Research | `/research` | NotebookLM-style notebooks with sources, grounded chat, notes, Studio |
| Email | `/email` | Draft + summarize emails with AI |
| Posts | `/posts` | Social media post generator |
| Workflows | `/workflows` | Automation workflow builder + runner |

## Database Schema

Tables: `conversations`, `messages`, `tasks`, `research_notes`, `email_drafts`, `social_posts`, `workflows`, `notebooks`, `notebook_sources`, `notebook_notes`, `notebook_chats`

Run migrations: `pnpm --filter @workspace/db run push`

## Notebooks (NotebookLM Feature Set)

The Research page is a full NotebookLM-style experience:
- **Notebooks** — create named notebooks with emoji + description
- **Sources** — add text or URL-pasted content as sources (stored in `notebook_sources`)
- **Grounded AI Chat** — chat where AI answers only from your sources, with `[Source N]` inline citations
- **Notes** — free-form note cards per notebook (create/edit/delete)
- **Studio** — one-click generation: Study Guide, FAQ, Timeline, Briefing Doc, Outline, Summary
- 3-panel desktop layout: Sources | Chat | Notes+Studio
- Mobile: tabbed Sources / Chat / Notes

## API Routes

All routes are prefixed with `/api`:
- `GET/POST /api/conversations` — manage conversations
- `POST /api/openai/conversations/:id/messages` — SSE chat streaming
- `GET/POST/PATCH/DELETE /api/tasks` — task CRUD
- `GET /api/tasks/stats` — task statistics
- `GET/POST/DELETE /api/research` — legacy research notes
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
- `GET/POST /api/notebooks` — list/create notebooks
- `GET/PUT/DELETE /api/notebooks/:id` — notebook CRUD (returns with sources/notes/chats)
- `POST /api/notebooks/:id/sources/upload` — upload file source (image/PDF/text) with AI extraction
- `POST/DELETE /api/notebooks/:id/sources` — add/remove sources
- `GET/POST/PUT/DELETE /api/notebooks/:id/notes` — note CRUD
- `POST /api/notebooks/:id/chat` — grounded AI chat (with citations)
- `DELETE /api/notebooks/:id/chat` — clear chat history
- `POST /api/notebooks/:id/studio` — generate output (study-guide|faq|timeline|briefing|outline|summary)

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
