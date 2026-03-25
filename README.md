# Sentinel

Sentinel is a web intelligence app that monitors important changes online, verifies them with exact source links, and escalates high-signal updates through voice briefings.

The product supports two modes:
- `Personal`
- `Team`

## What It Does

- creates watches for topics, companies, people, or URLs
- uses Firecrawl to gather web evidence
- uses Claude to score and summarize important changes
- uses ElevenLabs to deliver voice briefings
- stores app data in Supabase

## Repo Structure

### `frontend/`

Next.js app for:
- landing page
- dashboard
- personal watches
- team workspace
- transcripts and briefing previews

### `backend/`

FastAPI app for:
- watch creation and polling
- Firecrawl search and scrape
- scoring and briefing generation
- notifications and outbound calls
- Supabase persistence

## Main Flow

1. Create a personal or team watch.
2. The backend consolidates the watch form into a usable monitoring query.
3. Firecrawl retrieves evidence from search results and direct URLs.
4. Claude decides whether the change matters and prepares a summary.
5. Sentinel can stay silent, send fallback notifications, or trigger a voice call.
6. The frontend shows the update, briefing, and exact source links.

## Exact Source Links

Sentinel is intended to show the exact URLs used for an event, not just publisher names.

Older rows in your database may still contain older source formats, but new rows should use specific links.

## Environment Variables

### Backend

Use [backend/.env.example](/Users/AllenPVT/Downloads/sentinel/backend/.env.example) as a template.

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

### Frontend

Use [frontend/.env.local.example](/Users/AllenPVT/Downloads/sentinel/frontend/.env.local.example).

Main variable:

- `NEXT_PUBLIC_API_URL`

## Local Development

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Frontend default:

- `http://localhost:3000`

Backend default:

- `http://localhost:8000`

## Repo Files

For a basic open-source repo, the project now includes:

- [README.md](/Users/AllenPVT/Downloads/sentinel/README.md)
- [.gitignore](/Users/AllenPVT/Downloads/sentinel/.gitignore)
- [LICENSE](/Users/AllenPVT/Downloads/sentinel/LICENSE)
- [backend/.env.example](/Users/AllenPVT/Downloads/sentinel/backend/.env.example)
- [frontend/.env.local.example](/Users/AllenPVT/Downloads/sentinel/frontend/.env.local.example)

## Supabase Setup

Your Supabase project already contains the schema and SQL you need.

This repo no longer depends on local SQL migration files being present in `supabase/`.

## ElevenLabs Setup

For full transcript support:

1. configure the ElevenLabs webhook to hit `/elevenlabs/webhook`
2. subscribe the webhook to post-call transcription events
3. set `ELEVENLABS_WEBHOOK_SECRET` if you want signature validation

## Can You Upload Only The Landing Page?

Yes, but there are two different meanings:

### Option 1: Deploy only the frontend project, keep the backend elsewhere

Yes. This is the normal Vercel path.

You can deploy `frontend/` to Vercel and point:

- `NEXT_PUBLIC_API_URL`

to your deployed backend.

In that setup:

- the landing page works
- the waitlist form works
- the dashboard routes also work if the backend is live

### Option 2: Upload only the landing page with no backend

Also possible, but then the current waitlist form will not work unless you change it.

Right now the landing page submits to:

- `/waitlist` on the backend

So if you publish only the landing page and no backend exists:

- the page renders
- animations and layout work
- the waitlist form will fail

If you want a true frontend-only landing page deployment, you should either:

1. remove the waitlist submission
2. connect the form to another service
3. keep a minimal backend route just for waitlist capture

## Deployment Options

### Vercel

The landing page and frontend app are suitable for Vercel deployment.

Recommended deployment target:

- project root in Vercel: `frontend/`

### Railway

Railway is a reasonable choice if you want to upload the whole repo and run this as a monorepo project.

Why it fits this repo:

- Railway supports monorepo deployments
- Railway supports both Next.js and FastAPI
- Railway supports separate services with different root directories from one GitHub repo
- Railway supports config-as-code and service-level build/start settings

Suggested Railway setup for this repo:

1. create one Railway project
2. add a `frontend` service
   - root directory: `/frontend`
3. add a `backend` service
   - root directory: `/backend`
4. set frontend env vars
   - `NEXT_PUBLIC_API_URL=<your backend public URL>`
5. set backend env vars from [backend/.env.example](/Users/AllenPVT/Downloads/sentinel/backend/.env.example)
6. expose the backend service publicly
7. apply the Supabase SQL migrations before testing the full app

If you want the simplest split:

- `frontend` on Vercel
- `backend` on Railway

If you want one platform for everything:

- both services on Railway is workable

### Backend Hosting

The backend can be deployed separately on a Python-friendly host.

The frontend expects the backend to expose the current FastAPI routes.

## Railway Notes For This Repo

If you deploy the whole repository to Railway, treat it as a two-service monorepo:

- service 1: Next.js frontend from `/frontend`
- service 2: FastAPI backend from `/backend`

This is the important operational point:

- do not point one Railway service at the repo root and expect both apps to run automatically

Use separate services and separate root directories.

## License

This project is released under the MIT License.

See [LICENSE](/Users/AllenPVT/Downloads/sentinel/LICENSE).

## Current Repo State

This repo is now set up to be pushable to GitHub:

- root `.gitignore` exists
- local env files are ignored
- `venv`, `.next`, `node_modules`, and caches are ignored
- env examples are included
- backend requirements already exist in [backend/requirements.txt](/Users/AllenPVT/Downloads/sentinel/backend/requirements.txt)

## Verification

Recent checks run in this workspace:

- frontend lint passed
- frontend build passed
- backend imports passed
- backend compile checks passed
