# MV Intelligence Platform — Engineering Build Plan (Cursor-Ready)
**Owner:** Motive Ventures (Harsh)  
**Version:** 2025-08-29  
**Goal:** Deliver a secure, extensible cockpit for capture → synthesis → action across deals, portfolio, and relationships.

---

## 0) Executive summary
- Build a modular platform on **Supabase (Postgres + Storage + Edge Functions + RLS)** and a **Next.js** UI.
- Use **agents** for ingestion, synthesis, enrichment, data quality, memo drafting, news, meeting prep, and relationship recommendations.
- Keep storage of third-party artifacts **temporary**; push canonical files to **Affinity** and delete from Supabase.
- Implement org-multi-tenancy and strong **RLS**; no service-role secrets in client code.
- Design a **sleek, dark UI** aligned with Motive Partners style; consistent components and responsive layouts.
- Ship iteratively: start with **Deck Capture → Synthesis → Affinity push**. Then add **Email ingestion**, **Week Ahead**, **News**, **Relationship Graph**, **Portfolio & Deal dashboards**, **Memo Builder**.

---

## 1) Architecture (high-level)
```
┌───────────────┐       webhooks / APIs       ┌───────────────┐
│  Integrations │  ─────────────────────────▶ │  Edge Funcs   │
│ (Zapier + API)│                             │ (Deno / Supa) │
│ • Gmail/Outlook│◀───────────────────────────│  cron/webhook │
│ • Slack        │   signed URLs / JSON       └───────────────┘
│ • Affinity     │            │                         │
│ • LinkedIn     │            ▼                         ▼
│ • WhatsApp/iMsg│      ┌───────────┐           ┌─────────────┐
└───────────────┘      │ Supabase  │           │  Workers    │
                       │ Postgres   │◀──queue──▶│ (Jobs/ETL) │
UI (Next.js) ◀──RLS──▶ │ Storage    │           └─────────────┘
  │                   │ pgvector    │
  ▼                   └───────────┬─┘
┌───────────────┐                │
│  Web Client   │  actions       │
│ + MV3 Chrome  │───────────────▶│ Edge APIs
│  Extension    │                │
└───────────────┘                ▼
                          ┌───────────────┐
                          │  Agents Hub   │
                          │  (router +    │
                          │   toolchains) │
                          └───────────────┘
```

**Key choices**
- **Supabase**: Postgres (RLS), Storage (private buckets), Edge Functions, pgvector for embeddings.
- **Next.js** app: dashboard, auth, multi-tenant orgs.
- **Workers/Jobs**: Supabase cron, or Cloudflare Workers/Queue for heavier ETL.
- **LLM**: OpenAI with retrieval (RAG) over Supabase (embeddings + artifacts index).
- **Integrations**: Direct API where reliable (Affinity, Slack, Google/Microsoft). Otherwise Zapier webhooks into Edge Functions.
- **Desktop bridge** (optional): small macOS agent to redact and push iMessage/WhatsApp snippets with user consent.

---

## 2) Domains & Modules
### 2.1 Capture & Synthesis
- **Deck Capture** (MV3 extension + Edge): capture slides from Figma/Docs/Notion; upload via proxy; compile PDF; extract text; embed.
- **Email/Attachment Ingestion**: unique forwarding address to Supabase; parse body + attachments; link to people/orgs.
- **Synthesis**: summarize decks/emails → bullets, risks, asks; extract KPIs; suggest next actions.
- **Push to Affinity**: create/update org/person, attach file, log activity; draft follow-up email.

### 2.2 Week Ahead
- Inputs: Google/Outlook Calendar, Affinity timelines, email, Slack.
- Output: one-page weekly brief: meetings, bios, prior threads, open tasks, pre-reads, AI-suggested questions.

### 2.3 Fintech News Recap
- Sources: curated Slack channels + RSS/feeds/APIs.
- Output: clustered summaries, portfolio relevance flags, links, optional email digest to team.

### 2.4 Relationship Management
- **Graph**: consolidate contacts (Affinity) + comms (email/Slack/IM) into a person/org graph with tags, strengths, topics.
- **QL**: natural language search (“who has good RIA connectivity?”) over embeddings + structured filters.
- **Cadence**: weekly re-engagement recommendations and per-deal intros.

### 2.5 Portfolio & Deal Dashboards
- **Portfolio**: templated profiles with KPIs, milestones, risks, news. Watchlist and on-demand render.
- **Deal**: live memo that auto-updates sections from artifacts + research; export Markdown for Notion.

---

## 3) Data model (Supabase)
> Keep sensitive files in **private** storage; delete after pushing to Affinity. Embeddings store text only.

```sql
-- Orgs & tenancy
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);
create table members (
  user_id uuid primary key,           -- auth.users.id
  org_id uuid not null references organizations(id),
  role text not null default 'member',
  created_at timestamptz default now()
);

-- Entities
create table companies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,
  affinity_org_id text,
  website text,
  created_at timestamptz default now()
);
create table contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text,
  email text,
  affinity_person_id text,
  company_id uuid references companies(id),
  created_at timestamptz default now()
);

-- Artifacts & activities
create table artifacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  kind text not null,  -- deck|email|note|pdf|web|memo
  source_url text,
  storage_path text,   -- private bucket path
  title text,
  company_id uuid references companies(id),
  contact_id uuid references contacts(id),
  created_by uuid,
  created_at timestamptz default now()
);
create table activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  company_id uuid references companies(id),
  contact_id uuid references contacts(id),
  verb text not null, -- emailed|met|captured|pushed_to_affinity|memo_generated|news_flag
  artifact_id uuid references artifacts(id),
  meta jsonb,
  at timestamptz default now()
);

-- Metrics & memo
create table metrics (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  company_id uuid not null references companies(id),
  name text not null,       -- ARR, MRR, churn, CAC, LTV, cohort_N
  period daterange,
  value numeric,
  source_artifact uuid references artifacts(id),
  created_at timestamptz default now()
);

-- Embeddings (pgvector)
create extension if not exists vector;
create table embeddings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  artifact_id uuid references artifacts(id),
  chunk text not null,
  vector vector(1536),      -- match your model
  meta jsonb,
  created_at timestamptz default now()
);

-- Jobs & agent runs
create table jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  kind text not null,       -- ingest|synth|kpi|memo|week_ahead|news|reco
  status text not null default 'queued', -- queued|running|done|error
  payload jsonb,
  result jsonb,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

**RLS sketch**
- Scope by `org_id` with a JWT claim `org_id` and membership check in `members`.
- Artifacts/embeddings/metrics/jobs inherit org scoping.

---

## 4) Buckets (private)
- `deck-assets/` → transient decks (auto-delete after Affinity push)
- `memos/` → generated memos (optional private)
- `cache/` → temporary scraped content

Lifecycle: background task deletes transient paths after successful external push.

---

## 5) Edge Functions (minimum surface)
All expect `Authorization: Bearer <access_token>` and set `org_id` from JWT.

- `capture/create-deck` → returns `artifact_id` and storage path base
- `capture/upload-proxy` → multipart upload → returns `{ storagePath }`
- `capture/commit-slide` → link slide, queue OCR+embed job
- `capture/compile-pdf` → assemble images → write PDF → update artifact
- `ingest/forwarded-email` (webhook) → parse, create artifact, link contacts/company via heuristics
- `affinity/push` → upsert org/person, attach files, log activity
- `synth/summarize` → summarize any artifact with citations
- `synth/extract-kpis` → extract ARR/MRR/churn/CAC/LTV with provenance
- `calendar/week-ahead` → assemble brief from calendar + comms + Affinity
- `news/recap` → cluster and summarize sources (Slack + external feeds)
- `reco/relationships` → gaps and re-engagement list

**Jobs**: a generic `/jobs/dispatch` with kind + payload; workers pull and execute toolchains.

---

## 6) Agents (toolchains)
- **Ingestion Agent**: classify artifact → route to OCR/HTML cleaner → embedding → link entities (companies/contacts).
- **NLP KPI Agent**: robust parsers with unit and period detection; writes `metrics` with `source_artifact`.
- **Research Agent**: enrich company with site text, hiring trend (RSS/LI via Zapier), app ratings.
- **Memo Agent**: fills memo template sections with citations and footnotes.
- **Week Ahead Agent**: fetch meetings, bios, last activity, creates prep bullets, questions, tasks.
- **News Agent**: fetch curated sources, cluster by company/topic, summarize, flag portfolio relevance.
- **Relationship Agent**: compute recency/frequency/strength, topic tags; propose intros and pings.

Each agent logs structured `job_events` and attaches errors with actionable hints.

---

## 7) UI (Next.js) — Design system
- **Theme**: dark base (#0B0B0C), grays, subtle accents (gold/brass), high-contrast text.
- **Typography**: Inter or SF Pro Text. Headlines 700, body 400/500.
- **Components**: AppShell (nav + breadcrumbs), DataTable, Card, MetricTile, Timeline, EntityChips, Editor (md), VectorSearch panel, Job status toasts.
- **Layouts**:
  - **Home**: Week Ahead + News Highlights + Open Actions
  - **Companies**: table + profile
  - **Deals**: pipeline + memo
  - **Inbox**: captured artifacts with filters
  - **People**: graph search and tags
- **Exports**: Markdown memo → Notion; CSV metrics; PDF briefs.

---

## 8) Security & compliance
- Org multi-tenancy with RLS. JWT contains `org_id` and `role`.
- Private buckets; signed GETs. Delete transient files after external push.
- No secrets in clients. All privileged work in Edge Functions.
- Consent and opt-in for personal comms (IM). Local bridge redacts PII before upload.
- Audit trail: `activities` and function logs with correlation IDs.

---

## 9) Observability & debugging
- **Sentry** in Next.js and Edge Functions.
- Structured logs: {{ trace_id, job_id, org_id, kind, step, duration_ms, status }}.
- Error taxonomy: VALIDATION, AUTHZ, INTEGRATION, TIMEOUT, RETRYABLE, RATE_LIMIT.
- Health dashboard: job queue depth, webhook errors, Affinity push success rate, OCR failure rate.

---

## 10) Phased delivery plan (lean and additive)
### Phase 0 — Foundations (3–5 days)
- Supabase project, schema, RLS, buckets.
- Auth and org model; member management.
- Next.js shell with protected routes; design tokens and theme.
- Jobs table + worker pattern; logging and Sentry.

**Exit**: can auth, see empty dashboard, run a no-op job.

### Phase 1 — Deck Capture → Synthesis → Affinity (5–7 days)
- MV3 extension (secure) + Edge capture endpoints (already scaffolded).
- OCR → text → embeddings; summary + KPIs; push to Affinity; delete storage.
- UI: Artifact card with summary, “Push to Affinity”, “Draft email”.

**Exit**: capture a deck, see summary/KPIs, push to Affinity, confirm deletion.

### Phase 2 — Email Forwarder & Attachments (4–6 days)
- Dedicated address; webhook to ingest/forwarded-email; parse attachments.
- Link contacts/companies; synth + KPIs; optional Affinity push.
- UI: Inbox view with filters.

**Exit**: forward an email → appears as artifact with summary, linked entities.

### Phase 3 — Week Ahead (3–5 days)
- Calendar connectors; attendee match to contacts/companies.
- Agent generates prep docs (bios, threads, actions).

**Exit**: Monday brief shows meetings and prep notes; downloadable PDF/MD.

### Phase 4 — Fintech News Recap (4–6 days)
- Slack channels + RSS/APIs via Zapier into webhook.
- Cluster + summarize; portfolio flags.

**Exit**: Daily/weekly recap page and email.

### Phase 5 — Relationship Graph & Recos (5–8 days)
- Build person/org embeddings and tags; strengths and recent activity.
- Natural language search and weekly re-engagement list.

**Exit**: NL query returns people (“RIA connectivity”); weekly list generated.

### Phase 6 — Portfolio & Deal Dashboards + Memo Builder (6–10 days)
- Company profiles with KPIs, milestones, risks, news.
- Live memo with sections; export Markdown to Notion.

**Exit**: Create a deal memo from artifacts and export MD.

### Phase 7 — Hardening & polish (ongoing)
- Backoff/retries, rate-limiters, UI polish, keyboard shortcuts, mobile layouts.

---

## 11) Acceptance criteria (per module)
- Capture: 95%+ of trial decks compile; artifacts deleted after Affinity push; provenance stored.
- KPI extraction: deterministic for known templates; uncertainty surfaced with confidence scores.
- Week Ahead: zero missing meetings; bios cached; action items deduped.
- News: portfolio relevance true-positive > 90% on curated set.
- Relationship recos: no stale contacts in list older than configured threshold.
- Memo builder: every claim cites artifacts; export preserves headings and tables.

---

## 12) Example interfaces (Cursor scaffolding)

### 12.1 Jobs dispatch
```ts
// POST /functions/v1/jobs/dispatch
// body: { kind: 'synth'|'kpi'|'memo'|..., payload: {...} }
type JobKind = 'ingest'|'synth'|'kpi'|'memo'|'week_ahead'|'news'|'reco';
interface DispatchRequest {{ kind: JobKind; payload: any; }}
interface DispatchResponse {{ id: string; status: 'queued'; }}
```

### 12.2 Affinity push (server)
```ts
// POST /functions/v1/affinity/push
// body: { artifactId, companyName?, people?: [{name,email}], createIfMissing: boolean }
```

### 12.3 Summarize (server)
```ts
// POST /functions/v1/synth/summarize
// body: { artifactId, mode: 'deck'|'email'|'web', instructions? }
```

### 12.4 KPI extract (server)
```ts
// POST /functions/v1/synth/extract-kpis
// body: { artifactId, hints?: { currency?: 'USD', period?: 'TTM' } }
```

---

## 13) Design tokens (JSON)
```json
{{
  "colors": {{
    "bg": "#0B0B0C",
    "panel": "#121214",
    "muted": "#1B1C1E",
    "text": "#EDEDED",
    "subtle": "#BDBDBD",
    "accent": "#D1B172",
    "danger": "#E25555",
    "success": "#4BB37A"
  }},
  "radii": {{"sm": 6, "md": 10, "lg": 14}},
  "shadow": {{"card": "0 8px 24px rgba(0,0,0,0.3)"}},
  "font": {{ "family": "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}
}}
```

---

## 14) Cursor TODO (copy/paste to tasks)
- [ ] Init Next.js app shell with auth (Supabase) and design tokens.
- [ ] Create DB schema and RLS; seed an org and member.
- [ ] Deploy capture functions (create-deck, upload-proxy, commit-slide, compile-pdf).
- [ ] Finish secure MV3 extension and e2e test capture → Affinity push → delete storage.
- [ ] Implement ingest/forwarded-email webhook; add Inbox view.
- [ ] Add OCR + embedding pipeline; vector search panel.
- [ ] Build Week Ahead agent and page; calendar connectors.
- [ ] Build News recap agent; Slack + feed inputs via Zapier.
- [ ] Ship Relationship graph, NL search, and reco cadence.
- [ ] Ship Portfolio profiles and Deal memo builder with MD export to Notion.
- [ ] Add observability dashboards and alerting.
