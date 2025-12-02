# Motive Intelligence Platform - Engineering Handoff

**Last Updated:** Dec 02, 2025

This document serves as the primary onboarding and operational guide for the Motive Intelligence Platform. It covers system architecture, operational workflows, and the current development roadmap.

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

**Deployment Target**: Ensure you are deploying to the correct Vercel project (`motive_intelligence`).
**Domain Configuration**: The domain `motivepartners.ai` is currently assigned to `motive_intelligence`.

**Critical Project Setting (Action Required)**:
Since the application lives in the `mv-intel-web` subdirectory, you **must** configure the Root Directory in Vercel:
1.  Go to Vercel Dashboard > **motive_intelligence** > **Settings** > **General**.
2.  Find **Root Directory**.
3.  Click **Edit** and set it to `mv-intel-web`.
4.  Click **Save**.
*Without this setting, Git deployments will fail (404 Error / "No framework detected") because Vercel tries to build the repository root instead of the app folder.*

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

**Affinity Sync Resilience:**
- 404 errors (entity deleted from Affinity) are logged as warnings, not failures
- Null content fields are handled gracefully (prevents `substring` errors)
- Orphaned entities (stale Affinity IDs) are flagged for re-sync in weekly cleanup

**Taxonomy Skip Mechanism:**
Entities that fail classification 3 times are marked with `taxonomy_skip_until` (30 days). This prevents wasting API calls on unclassifiable entities.
- `taxonomy_attempts`: Count of failed attempts
- `taxonomy_skip_until`: Skip date (null = not skipped)
- Use `--force` flag to override and retry skipped entities

| **Manual Sync** | `tsx scripts/run_affinity_sync.ts` | Syncs only Affinity data (skips enrichment) |
| **Sync Graph** | `tsx scripts/migrate-to-neo4j.ts` | Pushes current Postgres data to Neo4j |

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

### Financial Data Ingestion System (New)
A comprehensive system for ingesting portfolio company financials (PDF, Excel) and computing auditable KPIs.
*   `lib/financials/metrics/`: Common metrics dictionary (`common_metrics.json`) and computation logic.
*   `lib/financials/portcos/`: Per-company "Guides" (`guide.yaml`) defining mapping rules.
*   `lib/financials/ingestion/`: ETL pipeline components:
    *   `load_file.ts`: File handling (supports Supabase Storage paths).
    *   `parse_pdf.ts` & `parse_excel.ts`: Extraction engines.
    *   `map_to_schema.ts`: Semantic mapping logic (supports Nelly-style complex guides).
    *   `ocr_service.ts`: Stub for future OCR integration.
    *   `audit/`: Snippet generation for audit trails.
*   `app/import/`: Drag-and-drop UI for file uploads. Uses **Client-to-Storage** pattern to bypass serverless payload limits.
*   `app/api/ingest/`: API route handling uploads and triggering ingestion.

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

## 4. Operational Runbook (Data Pipelines)

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

### Common Issues & Debugging
*   **"Supabase 0-row bug"**: If scripts fail to fetch data, ensure the `supabase-js` client is initialized with the *Service Role Key*, not the Anon Key.
*   **Timeout Errors**: `postgres-vector.ts` can timeout on generic queries. Fix: Ensure `ILIKE` filters are used before vector similarity.
*   **GitHub Actions Failure**: Check the "Actions" tab in GitHub. Common cause: Missing secrets or Neo4j connection limits.
*   **Vercel Build Errors**: If API routes fail to build due to "Supabase URL required", ensure the client initialization is *inside* the handler function, not global.

---

## 5. Current Status & Known Issues

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

---

## 6. Roadmap & Priorities

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

## Appendix: Recent Changelog (Dec 02, 2025)

*   **Financial Data Ingestion**: Added a new subsystem (`lib/financials`) for ingesting portfolio financials.
    *   **Common Metrics**: Standardized dictionary of SaaS/Fintech KPIs.
    *   **Portco Guides**: YAML-based configuration for mapping company-specific files (e.g. `nelly/guide.yaml`) to the standard schema.
    *   **Import UI**: New `/import` page with drag-and-drop support and company auto-detection.
    *   **Auditability**: System generates cropped PDF/image snippets for every data point and stores them in `financial-snippets` bucket.
    *   **Large File Support**: Implemented Client-to-Storage upload pattern to bypass Vercel 4.5MB payload limits.
    *   **Bug Fixes**:
        *   **Build Pipeline**: Fixed module resolution errors by installing dependencies (`pdf-parse`, `xlsx`, `pdf-lib`) in `mv-intel-web` and tracking `pdf_snippet.ts`.
        *   **Guide Parsing**: Added resilience for varying YAML structures (`company:` vs `company_metadata:`) to support Nelly-style guides.
        *   **Database**: Created `financial-snippets` bucket with correct RLS policies and added unique constraints to `fact_metrics` for upserts.
        *   **Logic**: Fixed snippet retry loop and ensured Company ID resolution handles missing rows gracefully.
        *   **Stability**: Fixed critical bugs in metrics upsert (conflict syntax), company lookup (null ID prevention), and guide parsing (optional currency fallback).
*   **Affinity Orphan Detection**: Added `cleanOrphanedAffinityEntities()` to `intelligent_cleanup.ts`. Identifies entities with stale Affinity IDs (not updated in 30+ days) and flags them for re-sync verification. Prevents accumulation of orphaned data from entities deleted in Affinity CRM.
*   **Affinity Sync Resilience**: Updated `lib/affinity/sync.ts` to gracefully handle 404 errors (entity deleted from Affinity) and null content fields. Logs warnings instead of failing the pipeline.
*   **Taxonomy Skip Mechanism**: Added `taxonomy_attempts` and `taxonomy_skip_until` fields to prevent repeated failed classification attempts. After 3 failed attempts (still `IFT.UNKNOWN`), entity is skipped for 30 days. Use `--force` flag to override.
*   **Status Dashboard Fix**: Corrected interaction summarization metric to check `entity_notes_rollup.latest_summary` instead of non-existent `interactions.summary` field.
*   **Taxonomy Search Bar**: Added spotlight-style search to `/taxonomy` page. Searches both taxonomy codes/labels and company names. Results show category (green) or entity (blue) with navigation on click.
*   **Strict Taxonomy Enforcement**: Taxonomy page now only displays canonical categories from schema. Invalid paths show error state with "Return to Root" button. Enrichment pipeline validates codes against `isValidTaxonomyCode()`.
*   **Service Worker Resilience**: Updated `sw.js` to v2.0.3 with `Promise.allSettled` for individual asset caching. Prevents installation failure from cached 404s.
*   **PWA Deployment Fix**: Fixed 404 errors for Service Worker, manifest, and icon files. Root cause: `.gitignore` had a broad `public` rule (from Gatsby) that ignored `mv-intel-web/public/`. Changed to `public/` and committed all PWA assets. Added `vercel.json` headers for proper caching and `Service-Worker-Allowed` header.
*   **Centralized Taxonomy Schema**: Created `lib/taxonomy/schema.ts` as single source of truth for IFT taxonomy. Exports tree structure, LLM prompt schema, and validation utilities. Eliminates duplication across taxonomy page and classifier.
*   **Agent Strategy Enhancement**: Updated Chat Agent system prompt to support "Strategy-First" list building. Queries like "Who should I invite..." now trigger a segment-based multi-search workflow (e.g. "Vertical SaaS", "Competitors") rather than single keyword searches.
*   **Taxonomy Threshold Fix**: Aligned confidence thresholds between `detectTaxonomy()` (0.85→0.7) and `universal-search/route.ts` (0.7) using shared `TAXONOMY_CONFIDENCE_THRESHOLD` constant. Prevents unnecessary LLM calls for high-confidence fast matches.
*   **GPT-5.1 Taxonomy Classifier**: Updated `lib/search/taxonomy-classifier.ts` to use GPT-5.1. Now imports schema from centralized source.
*   **Enrichment-Only Pipeline**: Added `scripts/run_enrichment_only.js` and GitHub Action to allow re-running AI enrichment without full Affinity sync. Useful for error recovery.
*   **Taxonomy Hallucination Fix**: Updated `enhanced_embedding_generator.js` to use centralized schema and force validation (invalid codes -> `IFT.UNKNOWN`). Prevents entities from disappearing from the dashboard.
*   **Interaction Summary Fixes**: 
    *   Corrected column mapping (`interaction_type`, `ai_summary`) in `summarize_interactions.ts`.
    *   Updated OpenAI parameter (`max_tokens` → `max_completion_tokens`) for GPT-5.1 compatibility.
*   **Search Architecture Upgrade**: Universal search now runs embedding generation and taxonomy classification in parallel. Taxonomy codes are applied as filters when confidence >= 0.7.
*   **Location Enrichment with Perplexity**: Added `enrichLocation` to `intelligent_cleanup.ts`. Uses a two-step process (Internal GPT-5.1 → External Perplexity Sonar) to find headquarters location for entities with missing geographic data.
*   **Spotlight Search Placeholders**: Updated example queries to showcase key capabilities (portfolio, draft messages).
*   **Cleanup Resilience Fix**: Added `continue-on-error: true` and `if: always()` to ensure Neo4j sync runs regardless of cleanup failures.
*   **Weekly Maintenance Workflow**: Updated `cleanup.yml` to run intelligent cleanup with live execution (removed dry-run default).
*   **Neo4j Sync After Cleanup**: Added `migrate-to-neo4j.ts` step after intelligent cleanup to sync merged/deleted entities to graph.
*   **Stale Re-Enrichment**: `checkStale()` now actively queues entities for re-enrichment by clearing enrichment flags (previously only logged).
*   **Major Pipeline Refactor**: Separated data fetching from AI processing for 10-20x speedup.
    *   Affinity sync now stores raw interactions (no OpenAI calls during sync).
    *   Embeddings generated by `embed_interactions.ts` in parallel block.
    *   Summaries generated by `summarize_interactions.ts` in parallel block.
*   **Schedule Change**: Pipeline now runs daily at 6 AM UTC (was hourly).
*   **Disabled Naive Deduplication**: `systematic_cleanup.js` now only does garbage collection; intelligent deduplication handled by weekly `intelligent_cleanup.ts`.
*   **Pipeline Optimization**: Parallelized ingestion, summarization, and enrichment steps to solve 6-hour timeout issues.
*   **Concurrency Controls**: Added `p-limit` to summarization and increased batch sizes (5 -> 50) for enrichment to maximize throughput.
*   **Test Mode**: Added `--test` flag to `run_pipeline.js` for rapid verification (dry run).
*   **Security Fix**: Removed hardcoded `SUPABASE_SERVICE_ROLE_KEY` from all API routes.
*   **Deployment Fix**: Refactored ~20 API routes to initialize Supabase client lazily (inside handlers) to prevent Vercel build failures.
*   **Deployment Fix**: Disabled unused `graphology` components causing build errors.
*   **Fixed**: Refactored all pipeline scripts to use `supabase-js` client, bypassing server-side DNS issues.
*   **Added**: `graph.conversations` and `graph.messages` tables for chat state.
*   **Added**: Taxonomy View (`/taxonomy`) with hierarchical filtering.
*   **Added**: "Spotlight Login" with Magic Link auth.
*   **Added**: "Magic Code" OTP login support to bypass corporate email scanners (Antigena).
*   **Documentation**: Updated Handoff doc with Production Auth Configuration (Redirect URLs) and Deployment Target (`motive_intelligence`).
*   **Security Enforced**: Added strict server-side authorization check (`/api/auth/check-access`) before sending OTP codes. Unauthorized users are blocked immediately with a clear error message.
*   **Improved**: Search recall boosted (10 -> 30 results) and portfolio prioritization (+0.25 score).
