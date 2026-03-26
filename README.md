# Sentinel

Sentinel is a web intelligence app that watches for meaningful changes online, verifies them with source evidence, and escalates important updates through voice briefings.

It supports two modes:
- `Personal`
- `Team`

## What Sentinel Does

- creates watches for companies, people, topics, pages, and URLs
- uses Firecrawl to gather evidence from the web
- uses Claude to score and summarize changes
- uses ElevenLabs to place voice briefings
- stores watches, logs, alerts, and call sessions in Supabase

## Stack

- `frontend/`: Next.js
- `backend/`: FastAPI
- `database`: Supabase
- `search/crawl`: Firecrawl
- `reasoning`: Anthropic Claude
- `voice`: ElevenLabs
- `fallback notifications`: Twilio and Resend

## Repo Structure

### `frontend/`

Next.js app for:
- landing page
- dashboard
- personal watch flow
- team workspace
- transcript and briefing UI
- same-origin API proxy route

Important files:
- [frontend/src/app/page.tsx](frontend/src/app/page.tsx)
- [frontend/src/app/app/page.tsx](frontend/src/app/app/page.tsx)
- [frontend/src/app/app/team/page.tsx](frontend/src/app/app/team/page.tsx)
- [frontend/src/app/api/[...path]/route.ts](frontend/src/app/api/[...path]/route.ts)

### `backend/`

FastAPI app for:
- watch creation
- polling and scheduling
- Firecrawl search and scrape
- Claude-based scoring and briefing generation
- ElevenLabs outbound calls and transcript sync
- Supabase persistence

Important files:
- [backend/main.py](backend/main.py)
- [backend/db.py](backend/db.py)
- [backend/watcher.py](backend/watcher.py)
- [backend/watch_config.py](backend/watch_config.py)
- [backend/notifier.py](backend/notifier.py)

## Product Flow

1. A user creates a personal or team watch.
2. The backend consolidates the form into:
   - a display name
   - a Firecrawl monitoring query
3. Sentinel polls on the chosen interval.
4. Firecrawl gathers evidence from search results and direct URLs.
5. Claude scores the change and explains why it matters.
6. Sentinel stores the result and can:
   - stay silent
   - send fallback notifications
   - place a voice call
7. The frontend shows:
   - active watches
   - recent updates
   - latest briefing
   - source evidence
   - transcripts when available

## Exact Source Evidence

Sentinel is designed to show exact source URLs for an event, not just publisher names.

Older rows in an existing database may still use older source formats. Newer rows should use exact links.

## Requirements

You need:
- Node.js 20+
- Python 3.11+ or 3.12+
- a Supabase project
- Firecrawl API key
- Anthropic API key
- ElevenLabs API key and agent

Optional but used by the current app:
- Twilio account
- Resend account
- Google Calendar credentials

## Environment Variables

### Backend

Use [backend/.env.example](backend/.env.example) as the template.

Main variables:
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `ANTHROPIC_API_KEY`
- `FIRECRAWL_API_KEY`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_AGENT_ID`
- `ELEVENLABS_WEBHOOK_SECRET`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `RESEND_API_KEY`
- `FRONTEND_URL`
- `FRONTEND_URLS`

### Frontend

Use [frontend/.env.local.example](frontend/.env.local.example).

Main variable:
- `API_URL`

`API_URL` should point to the public backend base URL, for example:

```env
API_URL=https://your-backend.up.railway.app
```

The frontend does not need to call the backend directly from the browser. It uses the Next.js proxy route in [frontend/src/app/api/[...path]/route.ts](frontend/src/app/api/[...path]/route.ts), which forwards `/api/*` requests to the backend server-side.

## Supabase Expectations

This repository assumes you already have a Supabase project configured with the tables the app expects.

At a minimum, the app expects data storage for:
- watches
- logs
- alerts
- team members / teams
- call sessions

This repo currently does not include local SQL migration files.

## Local Development

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Backend default:
- `http://localhost:8000`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend default:
- `http://localhost:3000`

For local frontend development:

```env
API_URL=http://localhost:8000
```

## Railway Deployment

This repo is meant to be deployed as a two-service setup:
- one Railway service for `backend/`
- one Railway service for `frontend/`

### Backend Service

Root directory:
- `backend`

Build command:

```bash
pip install -r requirements.txt
```

Start command:

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

### Frontend Service

Root directory:
- `frontend`

The frontend repo contains:
- [frontend/Dockerfile](frontend/Dockerfile)
- [frontend/Procfile](frontend/Procfile)
- [frontend/nixpacks.toml](frontend/nixpacks.toml)

For Railway, the stable path is to deploy the frontend from the Dockerfile.

Frontend env:

```env
API_URL=https://your-backend.up.railway.app
```

### CORS

Backend CORS is configured to allow:
- localhost development
- `FRONTEND_URL`
- `FRONTEND_URLS`
- Railway public domains matching `https://*.up.railway.app`

## Vercel Deployment

If you only want to deploy the frontend to Vercel:
- deploy `frontend/`
- keep the backend elsewhere
- set `API_URL` in the frontend environment to the public backend URL

If you deploy only the landing page and no backend exists:
- the UI will render
- the waitlist form and app actions will not work unless replaced

## ElevenLabs Webhook

For transcript sync after calls:

1. point the ElevenLabs webhook to:
   - `/elevenlabs/webhook`
2. subscribe it to post-call transcript events
3. set `ELEVENLABS_WEBHOOK_SECRET` if you want signature validation

## Known Limitations

- `Call now` requires a watch with a usable briefing or summary. If a watch has no alert or log summary yet, the backend can return `No briefing is available for this watch yet`.
- Existing Supabase rows created before the exact-source-link path was added may still show older source formats.
- This repo assumes your Supabase schema is already present.

## Troubleshooting

### Frontend tries to call `localhost:8000` in production

That means the deployed frontend bundle is stale or the frontend is not using the proxy route build.

Current frontend requests should go to:
- `/api/...` on the frontend domain

Make sure:
- the latest frontend code is deployed
- `API_URL` is set on the frontend service

### Waitlist fails from browser but backend works in curl

That is usually CORS or frontend deployment drift.

Check:
- browser DevTools `Network`
- Railway frontend deploy logs
- Railway backend logs

### `Call now` returns `400`

Check the backend response body and Railway backend logs.

Common reasons:
- no briefing exists yet for that watch
- ElevenLabs config is missing or invalid
- phone number data is missing or invalid

## Repo Files

This repo includes:
- [README.md](README.md)
- [.gitignore](.gitignore)
- [LICENSE](LICENSE)
- [backend/.env.example](backend/.env.example)
- [frontend/.env.local.example](frontend/.env.local.example)

## License

MIT. See [LICENSE](LICENSE).
