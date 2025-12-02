# Motive Intelligence Platform - Engineering Handoff

**Last Updated:** Dec 02, 2025

This document serves as the primary onboarding and operational guide for the Motive Intelligence Platform. It covers system architecture, operational workflows, and the current development roadmap.

---

## Quick Reference

### Key File Locations

| Purpose | Path |
| :--- | :--- |
| **Frontend App** | `mv-intel-web/` |
| **API Routes** | `mv-intel-web/app/api/` |
| **Pipeline Scripts** | `mv-intel-web/scripts/` |
| **Financial Ingestion** | `mv-intel-web/lib/financials/` |
| **Taxonomy Schema** | `mv-intel-web/lib/taxonomy/schema.ts` |
| **Search Logic** | `mv-intel-web/lib/search/` |
| **Supabase Migrations** | `supabase/migrations/` |
| **Edge Functions** | `supabase/functions/` |
| **Portco Guides** | `mv-intel-web/lib/financials/portcos/{slug}/guide.yaml` |

### Database Tables

| Table | Purpose |
| :--- | :--- |
| `companies` | Organization entities (CRM + enriched) |
| `people` | Person entities |
| `interactions` | Notes, emails, meetings from Affinity |
| `entity_notes_rollup` | AI-generated interaction summaries |
| `graph.conversations` | Chat session state |
| `graph.messages` | Chat message history |
| `fact_financials` | Normalized financial line items |
| `fact_metrics` | Computed KPIs (ARR growth, margins, etc.) |
| `dim_line_item` | Standard chart of accounts |
| `dim_source_files` | Ingested file metadata |
| `company_insights` | Qualitative insights from documents |

### Storage Buckets

| Bucket | Purpose | Retention |
| :--- | :--- | :--- |
| `financial-docs` | Uploaded source files (PDF/Excel) | Temporary (deleted after ingestion) |
| `financial-snippets` | Audit trail snippets (page extracts) | Permanent |

### API Endpoints

| Endpoint | Method | Purpose |
| :--- | :--- | :--- |
| `/api/chat` | POST | Conversational agent |
| `/api/universal-search` | POST | Hybrid vector + taxonomy search |
| `/api/ingest` | POST | Financial file ingestion |
| `/api/detect-company` | GET | Detect company slug from filename |
| `/api/upload` | GET | Generate signed upload URL |
| `/api/upload` | POST | Direct storage upload (fallback) |
| `/api/auth/check-access` | POST | Email authorization check |
| `/api/taxonomy/entities` | GET | Entities by taxonomy code |

---

## Table of Contents

1. [System Overview & Architecture](#1-system-overview--architecture)
2. [Development Setup](#2-development-setup)
3. [Codebase Map](#3-codebase-map)
4. [Financial Data Ingestion System](#4-financial-data-ingestion-system)
5. [Operational Runbook](#5-operational-runbook-data-pipelines)
6. [Current Status & Known Issues](#6-current-status--known-issues)
7. [Roadmap & Priorities](#7-roadmap--priorities)
8. [Key Architectural Decisions](#8-key-architectural-decisions)
- [Appendix A: Changelog](#appendix-a-changelog-dec-02-2025)
- [Appendix B: Maintaining This Document](#appendix-b-maintaining-this-document)

---

## 1. System Overview & Architecture

The Motive Intelligence Platform is a **Conversational Knowledge Graph** that aggregates data from Affinity (CRM), external enrichment sources, and interaction logs into a unified graph database. It enables users to query their network using natural language.

### Core Stack
- **Frontend**: Next.js 14 (App Router), React, Tailwind CSS.
- **Primary Database**: Supabase (PostgreSQL) - Stores structured entity data, interaction logs, vector embeddings (`pgvector`), and **Financial Data**.
- **Graph Database**: Neo4j (AuraDB) - Stores relationship nodes and edges for visualization and traversal.
- **AI/LLM**: OpenAI GPT-5.1 (Reasoning, Synthesis, Taxonomy Classification), Perplexity `sonar-pro` (Enrichment), Supabase Edge Functions.
- **Hosting**: Vercel (Production URL: `https://motivepartners.ai`)

### Data Flow Architecture
1.  **Ingestion**: `run_affinity_sync.ts` fetches People, Organizations, Notes, and Files from Affinity CRM.
2.  **Enrichment Loop (Parallelized)**:
    *   **Enrichment**: Entities are processed by Perplexity (web search) and GPT-5.1 to extract descriptions, sectors, and metadata.
    *   **Vectorization**: `embed_interactions.ts` generates embeddings for unstructured text (notes, emails) using OpenAI `text-embedding-3-small`.
    *   **Summarization**: `summarize_interactions.ts` generates concise interaction histories for entities (concurrently).
    *   **Relationship Extraction**: `generate_relationships.js` infers connections (e.g., "Competitor", "Investor") from unstructured text.
3.  **Graph Sync**: `migrate-to-neo4j.ts` pushes the enriched schemas from Supabase to Neo4j.
4.  **Query Execution**:
    *   User asks a question via Chat Interface.
    *   **Hybrid Search**: The system performs a parallel search:
        *   **Vector Search** (Supabase) for semantic similarity.
        *   **Graph Traversal** (Neo4j) for network connections.
    *   **Synthesis**: LLM (GPT-5.1) synthesizes the retrieved contexts into a coherent answer.

---

## 2. Development Setup

### Prerequisites
- Node.js (v18+)
- Supabase Project & CLI
- Neo4j AuraDB Instance
- OpenAI & Perplexity API Keys
- Affinity API Key

### Environment Variables
Ensure your `.env` file in `mv-intel-web/` contains:
```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEO4J_URI=...
NEO4J_USER=...
NEO4J_PASSWORD=...
OPENAI_API_KEY=...
PERPLEXITY_API_KEY=...
AFFINITY_API_KEY=...
```

### Production Configuration
For the production deployment at `https://motivepartners.ai`:

- **Deployment Target**: Ensure you are deploying to the correct Vercel project (`motive_intelligence`).
- **Domain Configuration**: The domain `motivepartners.ai` is currently assigned to `motive_intelligence`.

**Critical Project Setting (Action Required)**:
Since the application lives in the `mv-intel-web` subdirectory, you **must** configure the Root Directory in Vercel:
1.  Go to Vercel Dashboard > **motive_intelligence** > **Settings** > **General**.
2.  Find **Root Directory**.
3.  Click **Edit** and set it to `mv-intel-web`.
4.  Click **Save**.

*Without this setting, Git deployments will fail (404 Error / "No framework detected") because Vercel tries to build the repository root instead of the app folder.*

**Additional Production Requirements:**
1.  **Supabase Auth Redirects**: In the Supabase Dashboard > Authentication > URL Configuration, add `https://motivepartners.ai` to **Redirect URLs**. This is required for Magic Links to work in production (the code uses `window.location.origin` which resolves to the production domain).
2.  **PWA Assets**: The `mv-intel-web/public/` folder contains critical PWA files (`sw.js`, `manifest.json`, `mv-icons-*.png`). Ensure these are tracked by Git (check `.gitignore` doesn't exclude them). The `vercel.json` configures proper headers for Service Worker registration.
3.  **Edge Function Secrets**: Set the following secrets for production edge functions (specifically `linkedin-api-direct`):
    ```bash
    supabase secrets set LINKEDIN_REDIRECT_URI="https://motivepartners.ai/api/knowledge-graph/linkedin-callback"
    ```

### Key Commands
Run these from the `mv-intel-web/` directory:

| Action | Command | Description |
| :--- | :--- | :--- |
| **Start App** | `npm run dev` | Starts Next.js on localhost:3000 |
| **Run Pipeline** | `node scripts/run_pipeline.js` | Triggers full data sync & enrichment |
| **Enrich Only** | `npm run pipeline:enrich` | Skips sync; runs AI/Embeddings/Graph only |
| **Test Pipeline** | `node scripts/run_pipeline.js --test` | Runs a dry run (limit 5) to verify logic |
| **Manual Sync** | `tsx scripts/run_affinity_sync.ts` | Syncs only Affinity data (skips enrichment) |
| **Sync Graph** | `tsx scripts/migrate-to-neo4j.ts` | Pushes current Postgres data to Neo4j |

### GitHub Actions Workflows

| Workflow | File | Schedule | Description |
| :--- | :--- | :--- | :--- |
| **Data Pipeline Sync** | `pipeline.yml` | Daily 6 AM UTC | Full sync: Affinity → Enrichment → Neo4j |
| **Enrichment Only** | `enrichment.yml` | Manual | Re-run AI enrichment (skips Affinity sync) |
| **Data Maintenance** | `cleanup.yml` | Sunday Midnight UTC | Garbage collection + LLM cleanup + Neo4j sync |

**Pipeline → Scripts Mapping:**
```
pipeline.yml ──► run_pipeline.js
                 ├── systematic_cleanup.js
                 ├── run_affinity_sync.ts
                 ├── [PARALLEL] embed_interactions.ts + summarize_interactions.ts + enhanced_embedding_generator.js
                 ├── migrate-to-neo4j.ts
                 ├── enhanced_person_embedding_generator.js
                 ├── generate_relationships.js
                 ├── fix_portfolio_flags.ts
                 ├── systematic_cleanup.js
                 └── migrate-to-neo4j.ts

cleanup.yml ──► systematic_cleanup.js (continue-on-error)
                ├── intelligent_cleanup.ts (continue-on-error)
                └── migrate-to-neo4j.ts (always runs)

enrichment.yml ──► run_enrichment_only.js (same as pipeline.yml minus Affinity sync)
```

**Expected Outcomes:**
- `pipeline.yml`: Fresh Affinity data + all AI enrichment + Neo4j in sync
- `enrichment.yml`: Re-enriches entities (incl. IFT.UNKNOWN taxonomy) + Neo4j in sync
- `cleanup.yml`: Garbage removed + duplicates merged + UNKNOWN taxonomy fixed + orphaned Affinity entities flagged + Neo4j in sync

---

## 3. Codebase Map

### `mv-intel-web/` (Frontend & API)
*   `app/api/chat/`: Core Chat Agent logic (Next.js Route Handler).
*   `app/api/auth/check-access/`: **Auth Check Endpoint**. Verifies email authorization before sending OTP.
*   `app/components/Neo4jGraphViewer.tsx`: Main graph visualization component (Vis.js).
*   `app/components/ChatInterface.tsx`: Split-screen chat UI.
*   `lib/search/postgres-vector.ts`: Hybrid search implementation.
*   `lib/search/taxonomy-classifier.ts`: **GPT-5.1 IFT Taxonomy Classifier**.
*   `lib/taxonomy/schema.ts`: **Centralized Taxonomy Schema** (single source of truth).
*   `lib/graph/`: Graph algorithms and helpers.

**Note:** Components relying on `graphology` (e.g., `EnhancedClientGraph.tsx`) have been disabled to fix build issues.

### Centralized Taxonomy Architecture
The IFT (Integrated Fintech Taxonomy) is defined in a **single source of truth**: `lib/taxonomy/schema.ts`.

**Exports:**
- `TAXONOMY_TREE`: Full hierarchical tree (used by `/taxonomy` page UI)
- `TAXONOMY_PROMPT_SCHEMA`: Compact string for LLM prompts (used by classifier)
- `VALID_TAXONOMY_CODES`: Set of all valid codes (used for validation)
- `isValidTaxonomyCode(code)`: Validation function
- `hasInvalidSegment(code)`: Checks for garbage codes (UNKNOWN, UNDEFINED, etc.)

**Consumers:**
1. **`/taxonomy` page**: Imports `TAXONOMY_TREE` for tree rendering
2. **`taxonomy-classifier.ts`**: Imports `TAXONOMY_PROMPT_SCHEMA` for LLM classification
3. **`intelligent_cleanup.ts`**: Uses validation for data quality checks

**Policy:** Strict predefined codes only. "Discovered" categories are filtered out during display and flagged during cleanup.

### Proposed Feature: Admin Data Tools
Ideally, the `/admin` page should be expanded to include data management tools:
1.  **Taxonomy Reclassification**: Allow admins to search for a company and manually assign a valid IFT code from the schema.
2.  **Entity Merging**: Tool to manually merge duplicate entities (e.g., "Stripe" + "Stripe, Inc.").
3.  **Schema Viewer**: Read-only view of the current code-defined taxonomy for reference.

*Recommendation: Implement these as a new "Data Tools" tab in the Admin dashboard.*

### Search Architecture (Hybrid Approach)
The search agent uses **parallel signals** to rank results:

1.  **Embedding Search**: Query → OpenAI `text-embedding-3-large` → Vector similarity against entity embeddings.
2.  **Taxonomy Classification**: Query → GPT-5.1 → IFT taxonomy codes (e.g., `IFT.PAY.COM.GATEWAY`).
3.  **Filter Extraction**: LLM extracts implicit filters (countries, entity types, portfolio status).

**Flow:**
```
Query → [Embedding Generation] + [GPT-5.1 Taxonomy Classification] (parallel)
                     ↓                              ↓
              Vector Search                   Taxonomy Filter
                     ↓                              ↓
                     └───────── Combined Ranking ──────────┘
```

**Taxonomy Policy:** Strict predefined codes only (no "discovered" categories). If confidence < 0.7, taxonomy filter is skipped and vector search alone is used. The 0.7 threshold is defined as `TAXONOMY_CONFIDENCE_THRESHOLD` in `taxonomy-classifier.ts` and used by both the classifier and `universal-search/route.ts` for consistency.

### `mv-intel-web/scripts/` (Data Pipeline)
*   `run_pipeline.js`: Master orchestrator script.
*   `run_affinity_sync.ts`: Affinity API ingestion logic.
*   `enhanced_embedding_generator.js`: Entity enrichment (Perplexity + GPT).
*   `generate_relationships.js`: Relationship inference.
*   `intelligent_cleanup.ts`: LLM-based data hygiene (deduplication).

### `supabase/` (Database)
*   `functions/`: Edge Functions for scheduled tasks and webhooks.
*   `migrations/`: SQL schemas for `graph.conversations`, `graph.interactions`, etc.

### Status & Admin Pages
*   `/status`: **System Status Dashboard** — Real-time pipeline monitoring and data health metrics.
    *   Pipeline status (running/idle), last sync timestamp, entities synced
    *   Core metrics: Total Entities, Graph Edges, Interactions, Affinity Files
    *   Coverage progress bars: AI Enhancement, Vector Embeddings, Interaction Summarization
    *   Recent activity feed from `history_log` table
*   `/admin`: **Admin Console** — User access control (add/remove authorized users, resend magic links).
*   `/dashboard`: Alternative dashboard view with similar metrics.
*   `/taxonomy`: **Taxonomy Browser** — Hierarchical taxonomy browser with:
    *   Tree navigation sidebar (left)
    *   Category dashboard with subcategory cards and entity grids (right)
    *   **Spotlight-style search bar** for searching taxonomy codes/labels AND company names
    *   Strict canonical taxonomy policy (non-schema paths show error state)
*   `/import`: **Data Ingestion** — Drag-and-drop interface for uploading portfolio financials.

---

## 4. Financial Data Ingestion System (Knowledge Graph Extension)

**Status: Staging**

This module extends the Knowledge Graph by attaching structured financial performance data (`fact_financials`, `fact_metrics`) and unstructured narrative insights (`company_insights`) to existing portfolio company nodes.

### Architectural Philosophy
1.  **Extension, Not Silo**: Financial data is not a separate "app". It is an attribute of the Company Entity in the Knowledge Graph.
2.  **Unified Identity**: Ingestion relies on the **`graph.entities`** table as the source of truth. This table is enriched and deduplicated (unlike the raw `companies` table).
    *   **Migration**: `fact_financials` and related tables now reference `graph.entities(id)`.
3.  **RAG-Ready**: Narrative content (board deck summaries, risks, strategy) is stored in `company_insights` and will be vector-embedded for semantic search.
4.  **Agent-Accessible**: Structured metrics (ARR, Growth, Burn) will be exposed to the Chat Agent via a dedicated tool (`get_financial_metrics`), allowing queries like *"Compare the burn multiple of SaaS portcos"*.

### Dry Run Mode (Testing)
The ingestion API supports a `dryRun: true` parameter that allows testing the extraction and mapping pipeline **without writing to the database**.

**Usage:**
- Frontend: Click "Test Run (Nelly)" button on `/import` page - no company selection required
- API: POST `/api/ingest` with `{ filePaths: [...], dryRun: true }` - defaults to `nelly` guide if no `companySlug` provided

**Behavior:**
- Defaults to Nelly guide if no company specified (our primary test case)
- Skips strict company resolution (uses mock ID if entity not found)
- Skips all database inserts (`dim_line_item`, `fact_financials`, `fact_metrics`)
- **Still generates audit snippets** (uploaded to `_dry_run/` prefix in `financial-snippets` bucket)
- Returns full extracted data in response:
  - `extracted_data`: Array of fact rows with `line_item_id`, `amount`, `source_location`, `snippet_url`
  - `computed_metrics`: Array of metric rows with `metric_id`, `value`, `unit`, `period`

**Why:** Allows validating parsing logic and Portco Guide mappings when the database schema or entity resolution is blocked.

### Parked Issues
| Issue | Status | Workaround |
| :--- | :--- | :--- |
| **Entity Resolution Mismatch** | Parked | Migration `20251203000000_migrate_financials_to_graph.sql` created but not applied. `graph.entities` may not have all portfolio companies. Use Dry Run mode to test extraction. |
| **`fact_financials` FK constraint** | Parked | Foreign key still points to old table until migration is run. Dry Run bypasses this. |

### Data Flow
```
[Source Files] -> [Ingestion Pipeline] -> [Normalized DB Schema] <---(Linked via graph.entities.id)---> [Knowledge Graph]
                                                  |
                                                  v
                                          [Vector Embeddings]
                                          (for company_insights)
```

### Ingestion Pipeline
1.  **Upload**: User drags files to `/import`. Frontend detects company name via filename heuristics.
2.  **Entity Resolution**: Backend resolves the target company against the **`graph.entities`** table.
    *   **Strategy**: Exact Match → Fuzzy Match (Prefix/Substring) → Manual Resolution.
    *   **Manual Fallback**: If no match found or ambiguous, returns `company_not_found` status. Frontend shows a modal for user to select from candidates (searching `graph.entities`).
    *   **Constraint**: Target company MUST exist in the Knowledge Graph.
3.  **Processing**:
    *   **PDF Extraction**: Uses **GPT-4 Vision** to extract text and tables (replaced `pdf-parse` which failed in Vercel serverless).
    *   **Excel Extraction**: Uses `xlsx` library with LLM cross-check.
    *   **Financials**: Parsed from Excel/PDF tables -> `fact_financials`.
    *   **Metrics**: Computed from Common Metrics definitions -> `fact_metrics`.
    *   **Insights**: Extracted via GPT-4 -> `company_insights`.
4.  **Audit**: Source snippets (PDF page crops via `pdf-lib`) saved to `financial-snippets` bucket.

### PDF Extraction Architecture
**Current Implementation: GPT-4 Vision (Option A)**

| Component | Library | Purpose |
| :--- | :--- | :--- |
| Page count/metadata | `pdf-lib` | Lightweight, works in serverless |
| Text/Table extraction | `gpt-4o` (Vision) | Sends PDF as base64, extracts structured content |
| Audit snippets | `pdf-lib` | Extracts single pages for source linking |

**Why Vision over Text Extraction:**
- `pdf-parse` (pdfjs-dist) fails in Vercel serverless ("r is not a function" error)
- GPT-4V handles complex layouts, scanned docs, and tables better
- Single API call does OCR + semantic understanding
- Trade-off: Higher cost per page, but reliable

### RAG & Search Strategy (Roadmap)
To enable "Financial Intelligence" in the chat agent:

1.  **Unstructured Search (Qualitative)**:
    *   **Action**: Add `embedding` column to `company_insights`.
    *   **Pipeline**: Trigger `generate_embedding` on new insight rows.
    *   **Retrieval**: Update `postgres-vector.ts` to include `company_insights` in the vector search scope when the query implies financial/strategic context.

2.  **Structured Query (Quantitative)**:
    *   **Action**: Create an Agent Tool `get_financial_metrics(company_ids, metric_keys, period_range)`.
    *   **Logic**: The Agent detects a quantitative question ("What is Nelly's ARR?"), calls the tool, and receives structured JSON from `fact_metrics`.
    *   **Synthesis**: Agent formats the JSON into a natural language answer or table.

### Database Schema (Financial Extension)

```sql
-- Fact: Normalized Financial Data (Linked to Companies)
fact_financials (id, company_id, date, line_item_id, amount, ...)

-- Fact: Computed KPIs (The "Answer Key" for Agents)
fact_metrics (id, company_id, metric_id, value, period, ...)

-- Insights: Narrative Knowledge (Vectorized for RAG)
company_insights (id, company_id, category, content, embedding, ...)
```

### Portco Guide (`guide.yaml`)
Configuration file per company. **Crucial**: The `company.name` in the guide must resolve to an existing Knowledge Graph entity.

```yaml
company:
  name: "Nelly Solutions GmbH" # Must match 'companies' table (fuzzy match supported)
  ...
```

### Error Handling
- **Success (200)**: All files ingested with data extracted
- **Partial Success (207)**: Mixed results - some success, some failed or needs review
- **Needs Review (207)**: Files parsed but zero line items extracted (guide mapping issue)
- **Full Failure (500)**: All files failed to parse
- **Data Integrity**: Duplicate line items are summed (with audit log)
- **File Retention**: Failed files AND zero-extraction files kept in storage for debugging

---

## 5. Operational Runbook (Data Pipelines)

### The "Self-Healing" Pipeline
The master script `mv-intel-web/scripts/run_pipeline.js` orchestrates the data refresh. It runs **daily at 6 AM UTC** via GitHub Actions.

**Pipeline Stages:**
1.  **Cleanup**: Removes garbage entities (email artifacts, generic titles).
2.  **Affinity Sync** (Fast, ~15-30 min): Fetches all entities and raw interactions from Affinity. **No AI calls** — stores raw data only.
3.  **Parallel Enrichment Block** (runs concurrently):
    *   **Embed**: `embed_interactions.ts` vectorizes interactions where `embedding IS NULL`.
    *   **Summarize**: `summarize_interactions.ts` generates entity summaries (p-limit: 10). **Incremental**: Checks `last_updated` timestamp and only re-summarizes if new interactions exist.
    *   **Enrich (Orgs)**: `enhanced_embedding_generator.js` fills missing fields via Perplexity/GPT (batch: 50).
4.  **Neo4j Sync**: Updates graph with enriched Org data.
5.  **Person Enrichment**: Enriches People using Company context.
6.  **Relationship Extraction**: Infers 2nd-degree connections.
7.  **Final Cleanup & Neo4j Sync**: Deduplicates and pushes all edges to graph.

**Architecture Note**: The Affinity sync is intentionally "dumb" — it only fetches and stores raw data. All AI processing (embeddings, summaries, enrichment) happens in the parallel block, which processes incrementally (only unenriched records). This separation ensures:
- Fast sync (~15-30 min vs. 6+ hours)
- Resilience (sync failures don't lose AI work; AI failures don't block sync)
- Cost efficiency (AI only runs on new/changed data)

### Weekly Data Maintenance (Sundays @ Midnight UTC)
A separate workflow (`cleanup.yml`) runs intelligent data assurance:

1.  **Garbage Collection** (`systematic_cleanup.js`): Removes email artifacts (`;`, `<`, `>`) and generic job titles. *(continue-on-error)*
2.  **Intelligent Cleanup** (`intelligent_cleanup.ts`): LLM-based maintenance *(continue-on-error)*:
    *   **Duplicate Merge**: Evaluates "Company (Stealth)" → "Company" merges with 95% confidence threshold.
    *   **Type Verification**: Corrects misclassified entities (person vs. organization).
    *   **Taxonomy Validation**: Re-classifies organizations with invalid/missing taxonomy.
    *   **Fake Founder Cleanup**: Downgrades "Founder" edges to "Works At" if the person's title explicitly indicates a non-founder role (e.g., "Associate", "VP").
    *   **Location Enrichment**: Infers missing city/country using GPT-5.1 (internal data) or **Perplexity** (web search) if internal data is insufficient.
    *   **Stale Re-Enrichment**: Entities not updated in 6+ months are queued for re-enrichment (clears `enriched`, `enrichment_source`, `relationships_extracted_at` flags).
3.  **Neo4j Sync** *(always runs)*: Pushes all cleanup changes to the graph database. Runs even if previous steps fail to ensure partial changes are persisted.

**Manual Trigger**: Run with `--full` flag for a complete database scan (ignores date filter).

### Affinity Sync Resilience
- 404 errors (entity deleted from Affinity) are logged as warnings, not failures
- Null content fields are handled gracefully (prevents `substring` errors)
- Orphaned entities (stale Affinity IDs) are flagged for re-sync in weekly cleanup

### Taxonomy Skip Mechanism
Entities that fail classification 3 times are marked with `taxonomy_skip_until` (30 days). This prevents wasting API calls on unclassifiable entities.
- `taxonomy_attempts`: Count of failed attempts
- `taxonomy_skip_until`: Skip date (null = not skipped)
- Use `--force` flag to override and retry skipped entities

### Common Issues & Debugging
*   **"Supabase 0-row bug"**: If scripts fail to fetch data, ensure the `supabase-js` client is initialized with the *Service Role Key*, not the Anon Key.
*   **Timeout Errors**: `postgres-vector.ts` can timeout on generic queries. Fix: Ensure `ILIKE` filters are used before vector similarity.
*   **GitHub Actions Failure**: Check the "Actions" tab in GitHub. Common cause: Missing secrets or Neo4j connection limits.
*   **Vercel Build Errors**: If API routes fail to build due to "Supabase URL required", ensure the client initialization is *inside* the handler function, not global.

---

## 6. Current Status & Known Issues

### Status Summary
*   **Conversational Agent**: **Live**. Uses GPT-5.1 with query expansion and tool calling (`search_notes`, `traverse_graph`).
*   **Graph UI**: **Stable**. Features "Highlighting" for cited nodes and "Densification" to show hidden connections.
*   **Data Pipeline**: **Stable**. Migrated to `supabase-js` to resolve server-side DNS issues.
*   **Financial Ingestion**: **Staging**. New module for processing Portco financials (PDF/Excel) with drag-and-drop UI and "Portco Guide" mapping logic.
*   **Deployment**: **Production**. Live at https://motivepartners.ai.

### Known Risks & Limitations
*   **Taxonomy Limits**: The `/api/taxonomy/entities` endpoint hits Supabase's 1000-row limit. *Mitigation: Pagination implemented, but monitor performance.*
*   **Latency**: Initial graph load can be heavy (~2s). *Work In Progress: Subgraph retrieval optimization.*
*   **Affinity API v1 Limitations**: No server-side delta sync (no `modified_since` filter). We fetch all entries and rely on client-side incremental processing.

### ⚠️ CRITICAL: Vercel Staging Authentication
**Issue**: The staging deployment (`motiveintelligence-git-staging-*.vercel.app`) has **Vercel Authentication** enabled, which blocks all API requests with 401/405 errors.

**Symptoms**:
- API calls return `405 Method Not Allowed` or `401 Unauthorized`
- Response body contains "Authentication Required" HTML
- curl test shows redirect to `vercel.com/sso-api`

**Resolution**:
1. Go to Vercel Dashboard → Project Settings → General
2. Scroll to "Vercel Authentication" section
3. **Disable** Vercel Authentication for the staging deployment
4. OR configure a Protection Bypass token for API routes
5. Redeploy after changing settings

**Note**: This is a Vercel project setting, NOT a code issue. The code is correct.

---

## 7. Roadmap & Priorities

### Immediate Priorities (This Week)
1.  **Monitor Edge Creation**: Verify `owner` and `sourced_by` fields are correctly creating edges in Neo4j.
2.  **Verify Cleanup**: Check logs of `intelligent_cleanup.ts` (Weekly Run) to ensure no valid entities are being merged/deleted.
3.  **Monitor Pipeline Performance**: Verify the optimized pipeline completes in <1 hour.

### Strategic Backlog
*   **Admin Data Tools**: Build UI for manual entity reclassification and merging (proposed).
*   **Subgraph Retrieval**: Instead of loading the full graph, query Neo4j for *only* the nodes relevant to the current user context/search.
*   **"Explain" Feature**: Add UI to visualize *why* a node was recommended (e.g., highlight the path "You -> Invested In X -> Partnered With Y").
*   **Email Drafting**: Expand `draft_message` tool to support template selection.

---

## 8. Key Architectural Decisions

### Why Separate Affinity Sync from AI Processing?
**Decision**: The pipeline fetches raw data first, then runs AI enrichment in a separate parallel block.

**Rationale**:
- **Speed**: Raw sync completes in 15-30 min vs. 6+ hours when AI was inline
- **Resilience**: Sync failures don't lose AI work; AI failures don't block sync
- **Cost**: AI only processes new/changed data (incremental)
- **Debuggability**: Clear separation makes failures easier to diagnose

### Why Client-to-Storage Upload Pattern?
**Decision**: Frontend uploads files directly to Supabase Storage via `/api/upload`, then passes storage paths to `/api/ingest`.

**Rationale**:
- **Vercel Limits**: Serverless functions have a 4.5MB payload limit
- **Performance**: Large files don't transit through the API twice
- **RLS Bypass**: `/api/upload` uses service role key to avoid auth complexity

### Why Centralized Taxonomy Schema?
**Decision**: All taxonomy codes defined in a single TypeScript file (`lib/taxonomy/schema.ts`).

**Rationale**:
- **Single Source of Truth**: Eliminates drift between UI, classifier, and validation
- **Type Safety**: TypeScript exports enable compile-time checks
- **LLM Consistency**: Same schema string used for all classification prompts
- **No Hallucination**: Invalid codes immediately rejected via `isValidTaxonomyCode()`

### Why YAML Portco Guides?
**Decision**: Each portfolio company has a `guide.yaml` defining file mappings.

**Rationale**:
- **Flexibility**: Each company's reporting format is different
- **Non-Technical Editing**: YAML is readable by non-engineers
- **Version Control**: Changes tracked in Git
- **Extensibility**: Easy to add new companies without code changes

### Why Sum Duplicate Line Items?
**Decision**: When multiple values map to the same `line_item_id`, they are summed.

**Rationale**:
- **Data Integrity**: Prevents silent data loss
- **Audit Trail**: Aggregations are logged for visibility
- **Real-World Fit**: Financial data often has multiple rows that should aggregate (e.g., revenue by product line)

### Why GPT-4 Vision for PDF Extraction?
**Decision**: Use GPT-4 Vision (`gpt-4o`) instead of `pdf-parse` for extracting text/tables from PDFs.

**Rationale**:
- **Serverless Compatibility**: `pdf-parse` (pdfjs-dist) fails in Vercel with "r is not a function" error due to missing browser APIs
- **Complex Layouts**: Vision handles tables, multi-column layouts, and scanned docs better than text extraction
- **Single API**: OCR + semantic understanding in one call (no separate OCR step)
- **Reliability**: Works consistently across different PDF types

**Trade-offs**:
- **Cost**: ~$0.01-0.03 per page (vs. free for text extraction)
- **Latency**: ~2-5s per page (vs. <1s for text extraction)
- **Rate Limits**: Subject to OpenAI API limits

**Implementation**: `lib/financials/ingestion/parse_pdf_vision.ts` uses `pdf-lib` for metadata and `gpt-4o` for content extraction.

---

## Appendix A: Changelog (Dec 02, 2025)

### Features Added

*   **Financial Data Ingestion System**: New subsystem (`lib/financials`) for ingesting portfolio financials.
    *   Common Metrics dictionary with SaaS/Fintech KPIs
    *   YAML-based Portco Guides for company-specific mapping
    *   Import UI (`/import`) with drag-and-drop support
    *   Audit snippets stored in `financial-snippets` bucket
    *   Client-to-Storage upload pattern for large files

*   **Taxonomy Browser**: `/taxonomy` page with hierarchical navigation, spotlight search, and strict schema enforcement.

*   **Centralized Taxonomy Schema**: `lib/taxonomy/schema.ts` as single source of truth for IFT taxonomy.

*   **Agent Strategy Enhancement**: Chat Agent now supports "Strategy-First" list building for queries like "Who should I invite..."

*   **Enrichment-Only Pipeline**: `scripts/run_enrichment_only.js` and GitHub Action for re-running AI enrichment without Affinity sync.

*   **Location Enrichment**: Two-step process (Internal GPT-5.1 → External Perplexity) for missing geographic data.

*   **Affinity Orphan Detection**: `cleanOrphanedAffinityEntities()` identifies stale Affinity IDs for re-sync verification.

*   **Taxonomy Skip Mechanism**: Entities failing classification 3x are skipped for 30 days (`taxonomy_skip_until`).

*   **"Spotlight Login"**: Magic Link auth with OTP code support (bypasses corporate email scanners).

*   **Database Tables**: `graph.conversations`, `graph.messages` for chat state persistence.

### Bug Fixes

*   **Enrichment Pipeline**:
    *   Fixed **Schema Mismatch** in `enhanced_embedding_generator.js` by adding a robust fallback mechanism that retries updates without new columns if the database migration hasn't been applied.
    *   Added missing migration `20251202000005_add_taxonomy_tracking.sql` to add `taxonomy_attempts` and `taxonomy_skip_until` columns.

*   **Financial Ingestion**:
    *   Fixed silent data loss when duplicate line items share same ID (now sums with audit log)
    *   Fixed API returning 200 for failures (now proper 500/207 status codes)
    *   Fixed company slug matching (word boundaries, longest match preference)
    *   Fixed empty file submission handling
    *   Fixed `onConflict` parameter (now uses explicit constraint name `fact_metrics_company_period_metric_key`)
    *   Fixed guide parsing for varying YAML structures (`company:` vs `company_metadata:`)
    *   Fixed null Company ID prevention and optional currency fallback
    *   Fixed case-sensitive file extension matching (now handles `.PDF`, `.XLSX`)
    *   Fixed snippet path collisions when processing multiple PDFs in same batch (now uses full `filePath`)
    *   Fixed 405 Method Not Allowed on `/api/ingest` and `/api/upload` (moved Supabase client init inside handlers)
    *   Fixed zero-extraction files being deleted (now retained with `needs_review` status for debugging)
    *   Added `export const dynamic = 'force-dynamic'` to prevent Vercel edge caching issues
    *   Implemented **LLM Cross-Check** for Excel ingestion: Now runs GPT-4 extraction alongside deterministic mapping to verify values and catch missing items.
    *   **Fixed Nelly guide format incompatibility**: Portco loader now normalizes different YAML structures. Nelly uses `company:` and `metrics_mapping` instead of `company_metadata:` and `mapping_rules`. The loader now extracts line items from `document_structure.*.kpi_tables.*.metric_rows`.
    *   **Fixed EUR number parsing corruption**: Added `parseLocalizedNumber()` that detects EUR format (1.234,56) vs US format (1,234.56) based on separator positions and guide currency. Previously, EUR numbers were silently corrupted (1.234,56 → 1.234 instead of 1234.56).
    *   **Fixed onConflict parameter for fact_metrics upsert**: Changed from column names to constraint name `fact_metrics_company_period_metric_key` as required by Supabase v2 for composite unique constraints.
    *   **Fixed hyphen escaping order in company detection**: Hyphens were being escaped before the flexible pattern replacement, so slugs like `acme-corp` couldn't match `acme_corp` or `acme corp`. Now replaces hyphens first, then escapes other meta-characters.
    *   **Fixed partial status message missing needs_review files**: Frontend import UI now shows both `error` and `needs_review` files with appropriate status labels when displaying partial results.
    *   **Fixed false negative detection in parseLocalizedNumber**: `rawNum.includes('-')` matched any hyphen (e.g., in company names like "acme-corp-123"), causing false positive negative number detection. Now only checks for leading minus signs or parentheses notation.
    *   **Added env var validation in ingest API**: Missing `OPENAI_API_KEY` or Supabase env vars now throw descriptive errors instead of cryptic 500s.
    *   **Improved frontend error handling**: `import/page.tsx` now handles non-JSON responses (like Vercel error pages) gracefully and alerts the user with the actual error text.
    *   **Replaced `pdf-parse` with GPT-4 Vision**: The `pdf-parse` library (pdfjs-dist) fails in Vercel serverless with "r is not a function" error. Now using `parsePDFWithVision()` which sends PDFs to GPT-4V for extraction. More reliable and better at complex layouts.
    *   **Embedded Nelly guide for serverless**: YAML files aren't bundled by Vercel. Added embedded Nelly guide as JavaScript object fallback in `loader.ts`.
    *   **Added Dry Run mode**: `dryRun: true` parameter skips all DB writes, defaults to Nelly guide, and returns full extracted data for testing.

*   **Pipeline & Enrichment**:
    *   Fixed Affinity sync 404 handling (warnings, not failures)
    *   Fixed null content field handling (prevents `substring` errors)
    *   Fixed taxonomy hallucination (invalid codes → `IFT.UNKNOWN`)
    *   Fixed interaction summary column mapping (`interaction_type`, `ai_summary`)
    *   Fixed OpenAI parameter (`max_tokens` → `max_completion_tokens` for GPT-5.1)
    *   Aligned taxonomy confidence thresholds (0.7) between classifier and search

*   **Deployment & Build**:
    *   Fixed PWA 404 errors (`.gitignore` was excluding `mv-intel-web/public/`)
    *   Fixed Service Worker installation (individual asset caching with `Promise.allSettled`)
    *   Fixed Vercel build errors (lazy Supabase client initialization)
    *   Disabled unused `graphology` components causing build failures
    *   Removed hardcoded `SUPABASE_SERVICE_ROLE_KEY` from API routes

*   **Status Dashboard**: Fixed interaction summarization metric (checks `entity_notes_rollup.latest_summary`)

### Infrastructure & Performance

*   **Major Pipeline Refactor**: Separated data fetching from AI processing (10-20x speedup)
    *   Affinity sync stores raw interactions (no OpenAI calls)
    *   Embeddings/Summaries generated in parallel block
    *   Schedule changed: Daily 6 AM UTC (was hourly)

*   **Interaction Summarization Optimization**: Refactored `summarize_interactions.ts` to be fully incremental.
    *   Checks `last_updated` timestamp against the entity's most recent interaction date.
    *   Skips AI summarization if the summary is already up-to-date.
    *   Reduces runtime from ~1 hour to minutes for incremental runs.

*   **Concurrency Controls**: Added `p-limit` to summarization, increased enrichment batch sizes (5 → 50)

*   **Cleanup Resilience**: `continue-on-error: true` and `if: always()` ensure Neo4j sync runs regardless of failures

*   **Search Architecture Upgrade**: Parallel embedding generation + taxonomy classification

*   **Storage Buckets**: Created `financial-docs` (temporary) and `financial-snippets` (permanent) with RLS policies

### Security

*   **Auth Check Endpoint**: Strict server-side authorization (`/api/auth/check-access`) before OTP

*   **Signed URL Uploads**: `/api/upload` GET endpoint generates signed URLs using service role, enabling direct client-to-storage uploads that bypass both RLS and Vercel's 4.5MB limit

### Documentation

*   Updated Handoff doc with Production Auth Configuration and Deployment Target
*   Added PWA assets documentation
*   Added Financial Ingestion system documentation

---

## Appendix B: Maintaining This Document

This section provides guidelines for keeping CURSOR_HANDOFF.md consistent and useful over time.

### When to Update

| Trigger | Action |
| :--- | :--- |
| New API route created | Add to Quick Reference → API Endpoints table |
| New database table created | Add to Quick Reference → Database Tables |
| New storage bucket created | Add to Quick Reference → Storage Buckets |
| New major feature shipped | Add to Appendix A → Features Added |
| Bug fixed | Add to Appendix A → Bug Fixes (under appropriate subsystem) |
| Performance improvement | Add to Appendix A → Infrastructure & Performance |
| Security change | Add to Appendix A → Security |
| New pipeline script added | Update Section 2 → Pipeline Scripts Mapping |
| New portco guide created | No doc update needed (self-documenting via YAML) |
| Architectural decision made | Add to Section 8 → Key Architectural Decisions |
| Status of feature changes | Update Section 6 → Status Summary |

### Changelog Categorization Rules

**Features Added** — New user-facing capabilities or major backend systems:
- New pages, UI components, or workflows
- New API endpoints with distinct functionality
- New data pipelines or processing systems
- New integrations (external APIs, services)

**Bug Fixes** — Corrections to existing functionality:
- Error handling improvements
- Data integrity fixes
- Build/deployment fixes
- UI/UX corrections

**Infrastructure & Performance** — Non-functional improvements:
- Speed optimizations
- Concurrency/scaling changes
- Monitoring/logging additions
- CI/CD workflow changes

**Security** — Auth, authorization, and data protection:
- New auth mechanisms
- RLS policy changes
- Secret management updates
- Access control modifications

### What NOT to Include

- Transient debugging sessions or experiments
- Work-in-progress code not yet merged
- Minor refactors that don't change behavior
- Dependency version bumps (unless they fix a specific issue)
- Code formatting or linting changes

### Entry Format Guidelines

**Feature entries** should describe what the user/system can now do:
```markdown
*   **Feature Name**: Brief description of capability.
    *   Sub-bullet for key implementation details
    *   Sub-bullet for notable design choices
```

**Bug fix entries** should describe what was broken and how it was fixed:
```markdown
*   Fixed [symptom] by [solution] (e.g., "Fixed silent data loss by summing duplicate line items")
```

**Architectural decisions** should follow this template:
```markdown
### Why [Decision Name]?
**Decision**: One sentence describing what was decided.

**Rationale**:
- Bullet point explaining why
- Another reason
- Trade-offs considered
```

### Quick Reference Table Templates

**New API Endpoint:**
```markdown
| `/api/endpoint` | METHOD | Brief purpose description |
```

**New Database Table:**
```markdown
| `table_name` | What it stores and why |
```

**New Storage Bucket:**
```markdown
| `bucket-name` | Purpose | Retention policy |
```

### Update Checklist

When making significant changes, verify:

- [ ] "Last Updated" date at top of document reflects today
- [ ] Table of Contents links still work (if section names changed)
- [ ] Quick Reference tables are current
- [ ] Status Summary reflects actual deployment state
- [ ] No duplicate entries in changelog (search before adding)

### File Location Constants

If key files move, update these sections:
1. Quick Reference → Key File Locations
2. Section 3 → Codebase Map
3. Section 4 → Financial Ingestion (if applicable)

### Versioning Philosophy

This document tracks the **current state** of the system, not its history. The changelog provides a rolling window of recent changes (current release cycle). For historical archaeology, use `git log` on this file.

When the changelog grows too long (>100 entries), archive older entries to a separate `CHANGELOG_ARCHIVE.md` file, keeping only the most recent ~50 entries in this document.
