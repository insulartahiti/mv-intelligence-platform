
## Scheduled refresh
Deploy `refresh-company-opportunities` and schedule a daily cron in Supabase (e.g., 09:00 UTC):
```
supabase functions deploy refresh-company-opportunities
# In Supabase Dashboard → Edge Functions → Add Schedule
# Cron: 0 9 * * * (daily at 09:00 UTC)
```
Company profiles read from `company_opportunities_cache`; you can still hit the Affinity API ad hoc if needed.

## Week Ahead
- Deploy `meeting-prep` Edge Function and set env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `MV_WEBHOOK_SECRET`.
- Optional Slack posting relies on `notify-slack` function + Slack envs.
- UI at `/week-ahead` calls `/api/week-ahead` which invokes the function.
- Events source: populate `events` (via Zapier/Outlook/Google) with attendees array objects like `{ "name":"Jane", "email":"jane@co.com" }` and optional `company_id`.

## Calendar ingestion
- Deploy `ingest-calendar-event` Edge Function. Send JSON from Zapier/Google/Outlook triggers. Fields: orgId,title,starts_at,ends_at,location,attendees[]

## Attendee unification
- Deploy `unify-event-attendees` Edge Function. Run daily/hourly to map events.company_id by attendee domains.

## Email prep
- `/api/week-ahead/email` sends briefs via Resend. Env: RESEND_KEY, RESEND_FROM.

## Action items
- `actions` table + `/api/actions` API. Use to capture tasks from briefs or manually. Extend with Slack/email notifications if needed.

## Calendar ingestion
- Deploy `ingest-calendar-webhook` and point your Zapier Google/Outlook Calendar triggers to it.
- Send header `x-mv-signature: ${MV_WEBHOOK_SECRET}`. Required fields: orgId, source, externalId, title, startsAt; optional: endsAt, location, attendees[].

## Attendee → Company mapping
- Deploy `unify-event-company` and run hourly or after new event ingestion to set `events.company_id` by matching attendee email domains to `companies.domain`.

## Email brief
- Set `RESEND_API_KEY` or `POSTMARK_API_KEY` and `MV_FROM_EMAIL` in web server env. `/api/week-ahead/email` sends the brief.

## Actions + daily digest
- Use `/api/actions` to create items from Week Ahead. 
- Deploy `daily-actions-digest` and schedule daily Slack summary for each org (pass `{ orgId }`).


## Network Insights
- `relationships` table stores contact-company interaction strength.
- Edge functions:
  - `refresh-relationships`: computes recency/frequency/strength from activities; schedule daily.
  - `network-query`: takes { orgId, query } and returns ranked contacts/entities relevant to NL query.
- UI at `/network`: search bar to test queries (e.g. "who has good RIA connectivity?").

## Network Insight module
- Migration: `20250829_008_network_insight.sql` (contacts, relationships, contact_id on embeddings) and `20250829_009_match_embeddings_contacts.sql` (RPC).
- Edge functions:
  - `refresh-relationships`: builds contact↔company edge strengths from recent events/activities.
  - `tag-contacts`: weekly tags for contacts (LLM-based).
  - `network-query`: semantic + strength ranked results for NL queries.
- Web:
  - `/network` page to issue queries.
  - `/api/network/query` server route to call the function.

### Suggested schedules
- `refresh-relationships`: daily (0 6 * * *)
- `tag-contacts`: weekly (0 7 * * 1)

## LinkedIn connections
- Deploy `ingest-linkedin-connections` and point Zapier/CSV webhook to it with `{ orgId, connections: [{ contact: {...}, other: {...}, degree, weight }] }`.
- The function ensures both contacts exist and upserts symmetric edges in `contact_connections`.

## Evidence & Warm Paths
- `/network` includes an Evidence drawer pulling top contact chunks and recent activities/events.
- `/companies/[id]/network` shows strongest contacts into a company from the `company_top_contacts` view.

## Warm paths & intro requests
- Deploy `warm-paths-for-company` and `draft-intro-message`.
- `/companies/[id]/network` now shows "Best Team Paths" with a one-click "Draft intro request" that generates message text (and can post to Slack if you pass a `channel` when calling the function).
- Scoring blends relationship strength and LinkedIn degree weighting (1st=1.0, 2nd=0.6, 3rd=0.3). Direct team→company ties are included.
- Mark your teammates by setting `contacts.is_internal=true`.

## Portfolio & Deals
- Migrations: `20250829_012_company_metrics_history.sql`
- Edge functions: `refresh-company-dashboard`, `draft-memo`
- Web pages: `/portfolio`, `/portfolio/[id]`, `/deals`, `/deals/[id]`
- Deal detail page can draft a memo based on the uploaded template and embeddings context.

## Signals → Actions, Company Affinity Write-back, and Admin Dashboard
- Migration: `20250829_014_actions_roles_security.sql`
  - `actions` table with RLS, `profiles.role` for RBAC, and `mv_security_audit()` RPC to check RLS.
- Edge Functions:
  - `sync-affinity-company` — pushes company `tags` and `watchlist` to Affinity custom fields.
- Web/API:
  - `POST /api/actions/create` — general action creation.
  - `POST /api/actions/from-signal` — converts a `company_signals` row into an `actions` item with evidence payload.
  - Admin users: `/admin/users` with `GET /api/admin/users/list` and `POST /api/admin/users/set-role`.
  - Security audit: `/admin/security` with `GET /api/admin/security/audit` calling `mv_security_audit()`.
- UI:
  - Signals cards now include **Add to Actions**. Actions are linked to the company and include evidence from the signal payload.
- Env:
  - Edge: `AFFINITY_API_KEY`, `AFFINITY_BASE_URL`, plus standard Supabase/OpenAI secrets.
