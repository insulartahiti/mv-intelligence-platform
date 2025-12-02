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

## 4. Financial Data Ingestion System

A comprehensive system for ingesting portfolio company financials (PDF, Excel) and computing auditable KPIs. **Status: Staging**

### Architecture Overview
```
Upload (UI) → Storage → Ingestion API → Parser → Mapper → Database
                                           ↓
                                    Snippet Generator → Audit Storage
```

### Key Components

| Component | Path | Purpose |
| :--- | :--- | :--- |
| **Import UI** | `app/import/page.tsx` | Drag-and-drop file upload with company detection |
| **Upload API** | `app/api/upload/route.ts` | Service-role storage upload (bypasses RLS) |
| **Ingest API** | `app/api/ingest/route.ts` | Orchestrates parsing, mapping, and storage |
| **File Loader** | `lib/financials/ingestion/load_file.ts` | Loads from Supabase Storage or local FS |
| **PDF Parser** | `lib/financials/ingestion/parse_pdf.ts` | Extracts text per page |
| **Excel Parser** | `lib/financials/ingestion/parse_excel.ts` | Extracts sheets as row-major grids |
| **Schema Mapper** | `lib/financials/ingestion/map_to_schema.ts` | Maps raw data to standardized line items |
| **Metrics Engine** | `lib/financials/metrics/compute_metrics.ts` | Computes KPIs from normalized data |
| **Snippet Generator** | `lib/financials/audit/pdf_snippet.ts` | Extracts source page for audit trail |

### Database Schema (Financial Tables)

```sql
-- Dimension: Standardized Line Items
dim_line_item (id, name, category, description)

-- Dimension: Source Files
dim_source_files (id, company_id, filename, storage_path, file_type, ingested_at, ingestion_status, metadata)

-- Fact: Normalized Financial Data
fact_financials (id, company_id, date, period_type, scenario, line_item_id, amount, currency, source_file_id, source_location)

-- Fact: Computed KPIs
fact_metrics (id, company_id, period, metric_id, value, unit, calculation_version, inputs)
```

### Portco Guide Format
Each portfolio company has a `guide.yaml` defining how to map their specific file formats:

```yaml
company_metadata:
  name: "Acme Corp"
  currency: "USD"
  business_models: ["saas"]

source_docs:
  - type: "financials"
    format: "xlsx"
    pattern: "Acme_Financials_*.xlsx"

mapping_rules:
  line_items:
    revenue_recurring:
      source: "financials"
      sheet: "Summary P&L"
      label_match: "Subscription Revenue"
    arr_current:
      source: "financials"
      sheet: "KPIs"
      label_match: "Ending ARR"

validation_rules:
  - check: "revenue_recurring + revenue_services == revenue_total"
    tolerance: 0.01
```

### Common Metrics
Defined in `lib/financials/metrics/common_metrics.json`. Includes:
- ARR Growth YoY
- Gross Margin
- Net Revenue Retention (NRR)
- LTV/CAC
- CAC Payback
- Burn Multiple
- Rule of 40

Each metric specifies: `id`, `name`, `formula`, `inputs`, `unit`, `benchmark_bands` (poor/good/great).

### Qualitative Insights (NEW)
Defined in `lib/financials/qualitative/insights_schema.ts`. Captures narrative data:
- **Categories**: key_highlight, risk_factor, strategic_initiative, market_observation, management_commentary, customer_update, product_update, team_update, fundraising, regulatory
- **Fields**: title, content, sentiment, confidence, source_location
- **Storage**: `company_insights` table with full audit trail

### LLM Extraction Service (NEW)
Located in `lib/financials/extraction/llm_extractor.ts`. Uses OpenAI GPT-4:
- **Period Extraction**: Determines reporting period from filename/content
- **Insight Extraction**: Extracts qualitative insights from document text
- **Table Extraction**: Uses GPT-4 Vision for scanned/image PDFs
- **Data Validation**: Cross-checks extracted values for consistency

**Why OpenAI over Google Vision?**
- Consistent with existing platform LLM usage
- Single API/billing relationship
- GPT-4V combines OCR + semantic understanding
- Better financial domain comprehension

### Upload Flow
1. User drops files on `/import` page
2. Frontend detects company from filename (slug matching with word boundaries)
3. Files uploaded via `/api/upload` (service role, bypasses RLS)
4. `/api/ingest` called with file paths
5. Backend loads guide, parses files, maps to schema
6. Line items saved to `fact_financials`
7. Metrics computed and saved to `fact_metrics`
8. PDF snippets extracted for audit trail → `financial-snippets` bucket
9. Source files deleted from `financial-docs` (success only)

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
    *   **Summarize**: `summarize_interactions.ts` generates entity summaries (p-limit: 10).
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
    *   **Fixed DOMMatrix not defined error**: Added polyfill in `parse_pdf.ts` for serverless environments. The `pdf-parse` library uses `pdfjs-dist` which requires browser APIs (`DOMMatrix`) not available in Node.js/Vercel serverless.
    *   **Fixed Nelly guide format incompatibility**: Portco loader now normalizes different YAML structures. Nelly uses `company:` and `metrics_mapping` instead of `company_metadata:` and `mapping_rules`. The loader now extracts line items from `document_structure.*.kpi_tables.*.metric_rows`.
    *   **Fixed EUR number parsing corruption**: Added `parseLocalizedNumber()` that detects EUR format (1.234,56) vs US format (1,234.56) based on separator positions and guide currency. Previously, EUR numbers were silently corrupted (1.234,56 → 1.234 instead of 1234.56).

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
