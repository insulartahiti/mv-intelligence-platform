# Motive Intelligence Platform - Engineering Handoff

**Last Updated:** Dec 11, 2025 (v4.12 - Hybrid Line Item Canonicalization)

This document serves as the primary onboarding and operational guide for the Motive Intelligence Platform. It covers system architecture, operational workflows, and the current development roadmap.

---

## Quick Reference

### Key File Locations

| Purpose | Path |
| :--- | :--- |
| **Frontend App** | `mv-intel-web/` |
| **Global Navigation** | `mv-intel-web/app/components/CollapsibleMenu.tsx` |
| **API Routes** | `mv-intel-web/app/api/` |
| **Pipeline Scripts** | `mv-intel-web/scripts/` |
| **Financial Ingestion** | `mv-intel-web/lib/financials/` |
| **Legal Analysis** | `mv-intel-web/lib/legal/` |
| **Legal Config** | `mv-intel-web/lib/legal/config.ts` |
| **Portfolio Section** | `mv-intel-web/app/portfolio/` |
| **Community Features** | `mv-intel-web/app/suggestions/`, `mv-intel-web/app/actions/` |
| **Taxonomy Schema** | `mv-intel-web/lib/taxonomy/schema.ts` |
| **Search Logic** | `mv-intel-web/lib/search/` |
| **Supabase Migrations** | `supabase/migrations/` |
| **Edge Functions** | `supabase/functions/` |
| **Portco Guides** | `portfolio_guides` (DB table) |

### Database Tables

| Table | Purpose |
| :--- | :--- |
| `companies` | Organization entities (CRM + enriched) |
| `people` | Person entities |
| `interactions` | Notes, emails, meetings from Affinity |
| `entity_notes_rollup` | AI-generated interaction summaries |
| `graph.conversations` | Chat session state |
| `graph.messages` | Chat message history |
| `fact_financials` | Normalized financial line items (linked to `graph.entities`) |
| `fact_metrics` | Computed KPIs (ARR growth, margins, etc.) |
| `dim_line_item` | Standard chart of accounts |
| `dim_source_files` | Ingested file metadata |
| `portfolio_guides` | Dynamic YAML configurations for financial ingestion |
| `portfolio_news_cache` | Caches Perplexity news feed results (12h TTL) |
| `company_insights` | Qualitative insights from documents |
| `legal_analyses` | Structured legal document analysis results |
| `legal_term_sources` | Source attribution for extracted legal terms |
| `legal_config` | Dynamic configuration for legal analysis prompts and normalization |
| `suggestions` | Community feature requests and voting |
| `suggestion_votes` | Tracking upvotes on suggestions |
| `issues` | Bug reports and issue tracking queue |

### Storage Buckets

| Bucket | Purpose | Retention |
| :--- | :--- | :--- |
| `financial-docs` | Uploaded source files (PDF/Excel) | Temporary (deleted after ingestion) |
| `financial-snippets` | Audit trail snippets (page extracts) | Permanent |
| `legal-snippets` | Legal document page snippets with clause highlights | Permanent |
| `issue-screenshots` | Screenshots for bug reports | Permanent |

### API Endpoints

| Endpoint | Method | Purpose |
| :--- | :--- | :--- |
| `/api/chat` | POST | Conversational agent |
| `/api/universal-search` | POST | Hybrid vector + taxonomy search |
| `/api/ingest` | POST | Financial file ingestion (Job-based) |
| `/api/detect-company` | GET | Detect company slug from filename |
| `/api/upload` | GET | Generate signed upload URL |
| `/api/auth/check-access` | POST | Email authorization check |
| `/api/taxonomy/entities` | GET | Entities by taxonomy code |
| `/api/portfolio/companies` | GET | Search and list portfolio companies |
| `/api/portfolio/guide` | GET/POST | Retrieve or update dynamic Portco Guide configurations |
| `/api/portfolio/legal-analysis` | POST/GET | Legal document analysis and retrieval |
| `/api/portfolio/legal-config` | GET/POST | Manage global legal analysis configuration |
| `/api/portfolio/news` | GET | Real-time news feed via Perplexity |

---

## Table of Contents

1. [System Overview & Architecture](#1-system-overview--architecture)
2. [Development Setup](#2-development-setup)
3. [Codebase Map](#3-codebase-map)
4. [Financial Data Ingestion System](#4-financial-data-ingestion-system)
5. [Legal Document Analysis System](#5-legal-document-analysis-system)
6. [Community & Issue Management](#6-community--issue-management)
7. [Operational Runbook](#7-operational-runbook-data-pipelines)
8. [Current Status & Known Issues](#8-current-status--known-issues)
9. [Roadmap & Priorities](#9-roadmap--priorities)
10. [Key Architectural Decisions](#10-key-architectural-decisions)
- [Appendix A: Changelog](#appendix-a-changelog-dec-07-2025)
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
*   `/admin`: **Admin Console** — User access control (add/remove authorized users, resend magic links), **Issue Queue**.
*   `/dashboard`: Alternative dashboard view with similar metrics.
*   `/taxonomy`: **Taxonomy Browser** — Hierarchical taxonomy browser.
*   `/import`: **Data Ingestion** — Drag-and-drop interface for uploading portfolio financials.
*   `/suggestions`: **Community Suggestions** — Voting and feature requests.

---

## 4. Financial Data Ingestion System (Knowledge Graph Extension)

**Status: Production Staging**

This module extends the Knowledge Graph by attaching structured financial performance data (`fact_financials`, `fact_metrics`) and unstructured narrative insights (`company_insights`) to existing portfolio company nodes.

### Architectural Philosophy
1.  **Extension, Not Silo**: Financial data is not a separate "app". It is an attribute of the Company Entity in the Knowledge Graph.
2.  **Unified Identity**: Ingestion relies on the **`graph.entities`** table as the source of truth. This table is enriched and deduplicated (unlike the raw `companies` table).
    *   **Migration**: `fact_financials` and related tables now reference `graph.entities(id)`.
3.  **RAG-Ready**: Narrative content (board deck summaries, risks, strategy) is stored in `company_insights` and will be vector-embedded for semantic search.
4.  **Agent-Accessible**: Structured metrics (ARR, Growth, Burn) will be exposed to the Chat Agent via a dedicated tool (`get_financial_metrics`), allowing queries like *"Compare the burn multiple of SaaS portcos"*.

### Unified Extraction Architecture (v3.1)

```
┌─────────────────────────────────────────────────────────────────┐
│                    UNIFIED EXTRACTOR                            │
│                  (PDF + Excel → Same Pipeline)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────┐    ┌──────────────┐      │
│  │           GPT-5.1               │    │ Deterministic│      │
│  │   (Primary - Released Nov 2025) │    │ xlsx Parser  │      │
│  │                                 │    │ (Excel only) │      │
│  │ • Vision + Structured Analysis  │    │              │      │
│  │ • Charts, Layouts, Tables       │    │ • Cell refs  │      │
│  │ • Adaptive Reasoning            │    │ • 100% conf  │      │
│  │ • Period & Metric Detection     │    │              │      │
│  └──────────────┬──────────────────┘    └──────┬───────┘      │
│                 │                              │               │
│                 └──────────────────────────────┘               │
│                             │                                   │
│                             ▼                                   │
│                   ┌──────────────────┐                          │
│                   │  RECONCILIATION  │                          │
│                   │    (GPT-5.1)     │                          │
│                   │                  │                          │
│                   │ • Merge results  │                          │
│                   │ • Flag conflicts │                          │
│                   │ • Confidence     │                          │
│                   └────────┬─────────┘                          │
│                            ▼                                    │
│                   ┌──────────────────┐                          │
│                   │   PERPLEXITY     │                          │
│                   │   Sonar Pro      │                          │
│                   │                  │                          │
│                   │ • Benchmarks     │                          │
│                   │ • Market context │                          │
│                   └────────┬─────────┘                          │
│                            ▼                                    │
│              UnifiedExtractionResult                            │
│   { pages[], financial_summary, benchmarks }                    │
└─────────────────────────────────────────────────────────────────┘
```

| Component | Model/Library | Purpose |
| :--- | :--- | :--- |
| Primary extraction | `gpt-5.1` | Vision + structured analysis (released Nov 2025) |
| Reconciliation | `gpt-5.1` | Merge results, flag discrepancies |
| Excel parsing | `xlsx` | Deterministic cell values (100% confidence) |
| Benchmarks | `perplexity/sonar-pro` | Industry comparisons, outlier flagging |
| Audit snippets | `pdf-lib` | Single page extraction with visual highlighting |

### Job Queue & UI Architecture (v4.4)
To support high-volume operations, the UI at `/import` has been refactored into a **non-blocking Job Queue**.
- **Concurrent Uploads**: Users can initiate multiple uploads for different companies without waiting for previous jobs to finish.
- **Inline Status**: Upload progress and results are shown in an "Active Uploads" list, persisting across SPA navigation.
- **Auto-Detection**: The interface provides immediate visual feedback while detecting companies from filenames.

### Systematic Row Label Extraction (v4.1)
The coordinate-first extraction strategy eliminates LLM hallucination by separating **structure identification** from **value reading**.

**Key Benefits:**
- **100% row coverage**: Scans ALL rows, not samples
- **No hallucinated values**: LLM only provides coordinates, code reads values
- **Fuzzy label matching**: LLM excels at matching "Total actual MRR" → `total_actual_mrr`
- **Single parse**: Values read once at the end with complete coordinate map

### Cross-File Reconciliation (v3.5)
When multiple files are ingested for the same company/period, the system must intelligently resolve conflicts.

#### Source Priority Rules

| File Type | Base Priority | Notes |
| :---: | :---: | :--- |
| Board Deck | 100 | Gold standard for Actuals |
| Investor Report | 80 | Monthly updates |
| Budget File | 60 (Actuals) / 120 (Budget) | Highest for budget scenario |
| Financial Model | 40 | Working documents |
| Raw Export | 20 | Unstructured data |

### Visual Audit Highlighting (v3.1)
When GPT-5.1 extracts metrics, it also returns `source_locations` with bounding box coordinates. The `pdf_snippet.ts` module extracts relevant pages, draws ellipse annotations, and uploads snippets for pixel-level auditability.

### Ingestion Pipeline Review & Known Issues (Dec 11, 2025)

#### Current Issues Identified

| Issue | Root Cause | Status |
| :--- | :--- | :--- |
| **Duplicate date columns** | LLM returns dates with day precision (2025-09-30) while filename extraction returns first-of-month (2025-09-01), both stored as separate records | ✅ Fixed: `normalizeToFirstOfMonth()` in `map_to_schema.ts` |
| **Duplicate file uploads** | Same files uploaded multiple times (24 source files for Nelly, many duplicates of same 3 docs) | ⚠️ No UI prevention of re-uploads |
| **No per-upload output** | All data merged into single fact tables, no way to see what came from each specific upload | ⚠️ Architecture needed |
| **Missing source links** | Dashboard table didn't show snippet URLs for audit trail | ✅ Fixed: Source column added |
| **Budget/Actuals mixed** | Single table showed all scenarios without distinction | ✅ Fixed: Separate tables with color coding |

#### Reconciliation Logic (Already Implemented)

The system has comprehensive reconciliation logic in `lib/financials/ingestion/reconciliation.ts`:

**Priority System (Higher = Better):**

| Source Type | Base Priority | Notes |
| :--- | :---: | :--- |
| Board Deck | 100 | Gold standard for Actuals |
| Investor Report | 80 | Monthly updates |
| Budget File | 60 (Actuals) / 120 (Budget) | Highest for budget scenario |
| Financial Model | 40 | Working documents |
| Raw Export | 20 | Unstructured data |

**Priority Boosts (from variance explanations):**
- Restatement: +50
- Correction: +40
- Forecast Revision: +20
- One-Time: +10

**Decision Matrix:**
```
New Priority > Existing → UPDATE (overwrite)
New Priority < Existing → IGNORE (keep existing)
Equal Priority + Explanation → Use explanation to decide
Equal Priority + >1% variance → Flag as CONFLICT for manual review
Equal Priority + <1% variance → Silent update (rounding)
```

**Changelog Tracking:** Every update is logged with timestamp, old/new values, reason, source file, explanation, and snippet URL.

### UI Improvements Status

| Feature | Status | Description |
| :--- | :--- | :--- |
| **Conflict Dashboard** | ⚠️ Not Built | UI to review high-severity conflicts flagged by reconciliation |
| **Per-Upload View** | ⚠️ Not Built | Show what each source file contributed before reconciliation |
| **Audit History Modal** | ✅ Complete | Click any cell → see Actual/Budget/Variance + all source records with links |
| **Budget vs Actual Summary** | ✅ Complete | Side-by-side comparison with variance % and directional arrows |

### Dashboard Features (v4.11)

The Financials Dashboard now includes:

1. **All Periods**: Shows complete date range (no 12-period limit)
2. **Chronological Order**: Oldest on left, newest on right
3. **Collapsible Categories**:
   - Revenue & Growth (arr, mrr, revenue, parr, nrr...)
   - Customers & Retention (customers, churn, ltv, cac...)
   - Cash & Liquidity (cash, runway, burn...)
   - Costs & Expenses (cogs, opex, capex...)
   - Profitability (ebitda, margin, profit...)
4. **Source Links**: Snippet URLs for audit trail
5. **Separate Actuals/Budget**: Visual distinction with color coding

### Hybrid Line Item Canonicalization (v4.12)

Intelligent mapping of extracted line items to canonical metric names:

**Architecture:**
```
┌─────────────────────────────────────────────────────────────┐
│                  HYBRID CANONICALIZATION                     │
├─────────────────────────────────────────────────────────────┤
│  1. STATIC MAPPING (instant, free)                           │
│     Check 60+ predefined synonyms                            │
│     e.g., "annual_recurring_revenue" → "arr"                 │
│                                                              │
│  2. DATABASE LOOKUP (fast)                                   │
│     Check approved/auto_approved suggestions                 │
│     Company-specific learned mappings                        │
│                                                              │
│  3. LLM SUGGESTION (when unknown)                            │
│     GPT-4o-mini suggests canonical name                      │
│     Stored with confidence score and reasoning               │
│     Auto-approved if confidence >= 90%                       │
│                                                              │
│  4. HUMAN REVIEW (Config Tab UI)                             │
│     Pending suggestions shown for review                     │
│     Approve/reject with editable canonical name              │
└─────────────────────────────────────────────────────────────┘
```

**Components:**
- `lib/financials/ingestion/line_item_canonicalizer.ts` - Core logic
- `api/portfolio/mapping-suggestions` - REST API for suggestions
- `portfolio/[id]/page.tsx` - Review UI in Config Guide tab
- `line_item_mapping_suggestions` table - Database storage

**Static Mappings Include:**
- MRR/ARR variations (20+ synonyms)
- Customer metrics (customers, users, merchants, churn, ltv, cac)
- Cash metrics (cash_balance, runway_months, burn_rate)
- Cost metrics (cogs, opex, capex)
- Profitability (ebitda, gross_margin, net_income)

**Future Enhancement (Agent Tool):**
Global vocabulary aggregation across all portfolio guides - designed to be called by a search agent once multiple companies have guides configured.

---

## 5. Legal Document Analysis System

**Status: Production Ready**

This module provides AI-powered analysis of investor documentation, extracting structured legal terms and risk assessments from term sheets, SPAs, SHAs, SAFEs, CLAs, and other investment documents.

### 3-Phase Extraction Pipeline

The extraction process has been re-architected into a resilient 3-phase pipeline:

```
Phase 1: Individual Extraction (Parallel, gpt-4o-mini)
    ↓ Each doc: ~2-3 seconds, runs 3 at a time
    ↓ Extracts: type, jurisdiction, key terms, source quotes
    
Phase 2: Category Analysis (Sequential, gpt-4o)
    ↓ Groups: Economics | Governance | Legal/GC | Standalone
    ↓ Deep analysis per category
    
Phase 3: Deal Synthesis (Single call, gpt-4o)
    ↓ Unified executive summary
    ↓ Cross-document conflict detection
    ↓ Final RED/AMBER/GREEN flags
```

### Key Files

| File | Purpose |
| :--- | :--- |
| `lib/legal/types.ts` | TypeScript interfaces for analysis output |
| `lib/legal/prompts/investor_doc_analyzer.ts` | Full VC lawyer prompt schema |
| `lib/legal/pipeline/*` | 3-Phase extraction logic (Phase 1, 2, 3) |
| `lib/legal/snippets/*` | Visual snippet generation (PDF/Image/Text) |
| `lib/legal/instrument_classifier.ts` | Jurisdiction & instrument type detection |
| `app/portfolio/legal/page.tsx` | Upload and analysis UI |
| `app/api/portfolio/legal-analysis/route.ts` | API endpoint |
| `lib/legal/config.ts` | Utilities for fetching/updating legal configuration |

---

## 6. Community & Issue Management

**Status: Live**

New features for community engagement and issue tracking have been integrated.

### Suggestions Page (`/suggestions`)
- **Public Voting**: Users can upvote feature requests.
- **AI-Powered De-Duplication**: GPT-4o checks new suggestions against existing ones. If a match is found, it merges them and rewrites the description.
- **UI**: Modern, centered layout with gradient headers, consistent with the Chrome Extension page styling.

### Issue Reporting
- **Global Feedback Button**: Floating bug icon on all pages.
- **Screenshot Capture**: Client-side capture via `html2canvas`.
- **AI Triage**: GPT-4o Vision analyzes screenshots and comments to generate a technical summary, potential cause, and priority.
- **Admin Queue**: New "Issue Queue" tab in `/admin` for tracking and updating bug reports.

---

## 7. Operational Runbook (Data Pipelines)

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

### Weekly Data Maintenance (Sundays @ Midnight UTC)
A separate workflow (`cleanup.yml`) runs intelligent data assurance:

1.  **Garbage Collection** (`systematic_cleanup.js`)
2.  **Intelligent Cleanup** (`intelligent_cleanup.ts`): LLM-based maintenance (duplicate merge, type verification, taxonomy validation, founder cleanup, location enrichment).
3.  **Neo4j Sync**

---

## 8. Current Status & Known Issues

### Status Summary
*   **Conversational Agent**: **Live**. Uses GPT-5.1 with query expansion and tool calling.
*   **Graph UI**: **Stable**. Features "Highlighting" and "Densification".
*   **Data Pipeline**: **Stable**. Migrated to `supabase-js`.
*   **Financial Ingestion**: **Staging**. Parallel processing, unified extractor, and dynamic guides.
*   **Legal Analysis**: **Production Ready**. 3-phase pipeline, visual snippets, chat integration.
*   **Community**: **Live**. Suggestions page and Issue Reporting system.
*   **Deployment**: **Production**. Live at https://motivepartners.ai.

### Recent Updates (Dec 07, 2025)
*   **Enhanced Search Architecture (Dec 7)**:
    *   **Perplexity Primary**: Adopted `sonar-pro` as the primary external search engine due to its superior reasoning and structured response capabilities.
    *   **Rich Ingestion**: Updated `app/api/chat/route.ts` to ingest rich metadata (`title`, `snippet`, `date`) from Perplexity's `search_results` field instead of just `citations`.
    *   **Fallback Strategy**: Rejected parallel GPT-5.1 web search in favor of a robust fallback pattern (using OpenAI native web search only if Perplexity fails, if implemented in future).
    *   **Data Quality**: Virtual Nodes in the graph now contain actual article titles and publication dates, improving user trust and context.

*   **Layout Overhaul (Dec 7)**: Redesigned Knowledge Graph page for Agent-First experience.
    *   **Split Pane**: Chat Agent (65%) vs Results/Graph (35%) by default.
    *   **Resizable**: Chat window can be resized when Graph is expanded.
    *   **Graph Toggle**: Floating icon to expand Graph visualization to full right pane.
    *   **Stability**: Increased physics iterations (2500) for stable graph rendering.
    *   **Chat Features**: Added History Sidebar, New Chat, Copy/Download buttons.

### Known Risks & Limitations
*   **Taxonomy Limits**: The `/api/taxonomy/entities` endpoint hits Supabase's 1000-row limit.
*   **Latency**: Initial graph load can be heavy (~2s).
*   **Affinity API v1 Limitations**: No server-side delta sync.

### ⚠️ CRITICAL: Vercel Staging Authentication
**Issue**: The staging deployment has **Vercel Authentication** enabled, which blocks all API requests with 401/405 errors.
**Resolution**: Disable Vercel Authentication for the staging deployment in Vercel Project Settings.

### ⚠️ Active Investigation: Metrics API Returns Empty
**Symptom**: `/api/portfolio/metrics?companyId=...` returns `{"metrics":[]}` on staging even though database contains data.
**Verified**: Direct Supabase queries confirm data EXISTS (2 metrics, 237 facts for Aufinity).
**Next Steps**: Check Vercel deployment logs for errors; verify environment variables are correct; added fallback to `fact_financials` in metrics API.

---

## 9. Roadmap & Priorities

### Immediate Priorities (This Week)
1.  **Monitor Edge Creation**: Verify `owner` and `sourced_by` fields in Neo4j.
2.  **Verify Cleanup**: Check logs of `intelligent_cleanup.ts` (Weekly Run).
3.  **Monitor Pipeline Performance**: Verify completion in <1 hour.

### Strategic Backlog
*   **Admin Data Tools**: Build UI for manual entity reclassification and merging.
*   **Subgraph Retrieval**: Optimize graph loading.
*   **"Explain" Feature**: Visualize recommendation paths.
*   **Email Drafting**: Expand `draft_message` tool.

---

## 10. Key Architectural Decisions

### Why Perplexity for External Search?
**Decision**: Use `sonar-pro` as the exclusive search engine for the agent's `perform_web_search` tool.
**Rationale**:
1.  **Structured Data**: Returns `search_results` with titles/snippets/dates, enabling rich Virtual Nodes in the graph.
2.  **Reasoning**: `sonar-pro` includes Chain-of-Thought reasoning, providing pre-synthesized answers that GPT-5.1 can further refine.
3.  **Efficiency**: Single API call replaces the [Search -> Scrape -> Clean -> Embed] pipeline required for manual GPT web search.

### Why Separate Affinity Sync from AI Processing?
**Decision**: The pipeline fetches raw data first, then runs AI enrichment in a separate parallel block.
**Rationale**: Speed (15-30 min vs 6+ hours), Resilience, Cost, Debuggability.

### Why Client-to-Storage Upload Pattern?
**Decision**: Frontend uploads files directly to Supabase Storage via `/api/upload`.
**Rationale**: Bypasses Vercel's 4.5MB payload limit and avoids double transit.

### Why Centralized Taxonomy Schema?
**Decision**: All taxonomy codes defined in `lib/taxonomy/schema.ts`.
**Rationale**: Single Source of Truth, Type Safety, LLM Consistency.

### Why YAML Portco Guides?
**Decision**: Each portfolio company has a `guide.yaml` (stored in DB) defining file mappings.
**Rationale**: Flexibility, Non-Technical Editing, Version Control.

### Why Unified Multi-Model Extraction?
**Decision**: Use parallel GPT-4o + GPT-5.1 + Perplexity.
**Rationale**: Serverless compatibility, Cross-Validation, Best-in-Class capabilities.

---

## Appendix A: Changelog (Dec 07, 2025)

### Bug Fixes

*   **Financial Dashboard Improvements (Dec 11)**:
    *   **Separate Actuals vs Budget Tables**: Dashboard now shows Actuals (blue) and Budget/Plan (amber, collapsible) as distinct sections with clear visual distinction.
    *   **Date Normalization**: Added `normalizeToFirstOfMonth()` in `map_to_schema.ts` to prevent duplicate columns when LLM returns dates like `2025-09-30` vs `2025-09-01` for the same month.
    *   **Source Links Column**: Added clickable snippet URLs in the financial data table for audit trail access.
    *   **Summary Stats Bar**: Shows counts of Actual records, Budget records, and Computed KPIs.
    *   **Comprehensive Guide Generation**: Updated Configuration Assistant prompt from 17 to 138 lines for complete YAML guide generation.
    *   **Ingestion History Page**: Fixed query to properly join `dim_source_files` with `graph.entities`.
    *   **Metrics API**: Returns both `fact_metrics` (computed KPIs) and `fact_financials` (raw line items) in single response.
    *   **Pipeline Architecture Review**: Documented per-upload output model and reconciliation strategy in handoff.

*   **Admin Console Issue Queue (Dec 10)**:
    *   **Fixed "View" Button Not Clickable**: Added missing `X` icon import from `lucide-react` in `/admin` page. The modal close button (`<X />`) was causing a runtime error when clicking "View" because the icon component was undefined.

*   **Build & Deployment (Dec 10)**:
    *   **Fixed Dynamic Route Warnings**: Added `export const dynamic = 'force-dynamic'` to 18 API routes to resolve "Dynamic server usage" build warnings.
    *   **Fixed Legal Export Error**: Added backward-compatible alias for `LEGAL_ANALYSIS_SYSTEM_PROMPT` to fix import errors during build.
    *   **Staging Environment**: Validated that 401 OpenAI errors in staging are due to Vercel Preview environment variable configuration (mismatch vs Production).

*   **Knowledge Graph UI Overhaul (Dec 10)**:
    *   **Chat Interface**: Added persistent Mini Sidebar for chat history and quick "New Chat" access.
    *   **Button Alignment**: Graph Toggle button (`Share2` icon) positioned above global Feedback button at `bottom-24 right-4`.
    *   **Loading State**: Implemented `LoadingResultsSkeleton` for a pulsating blur effect while graph results load.
    *   **Auto-Centering**: Added graph stabilization event listener to auto-center the visualization on load.
    *   **Chat Layout Fix**: Resolved persistent footer gap issue using `absolute inset-0` positioning pattern for cross-browser reliability. Added `min-h-0` and `flex-shrink-0` to nested flex containers for proper overflow handling.
    *   **Unified Feedback Button**: Removed duplicate from Knowledge Graph page; global button in `layout.tsx` now handles all pages.

*   **Architecture Page UI (Dec 07)**:
    *   Moved the close button on the details panel to the left side to prevent overlap with the global navigation menu.
    *   Added a notebook-style "Architectural Context" section to the details panel for richer documentation.

*   **Portfolio Dashboard Categorization (Dec 07)**:
    *   Grouped portfolio companies by standardized fund names.
    *   Fixed z-index layering issues for the global `CollapsibleMenu`.

*   **Portfolio API & Ingestion (Dec 07)**:
    *   Fixed Ingestion Status Codes (207 vs 200).
    *   Fixed Portfolio Company Listing to use Supabase as source of truth.
    *   Implemented Agent-Style Enrichment for robust property mapping.
    *   Added Strict Portfolio Filtering (`is_portfolio=true`).
    *   Fixed Concurrency Bug in `pLimit` function (removed race condition).
    *   Fixed Caching Issue in `/api/portfolio/news` (added `force-dynamic`).
    *   **Resolved Constraint Conflict**: Switched `saveMetricsToDb` to `DELETE` + `INSERT` logic to prevent unique constraint errors during metric updates.
    *   **Date Parsing**: Added support for `YYYYMMDD` formatted dates in filenames.
    *   **DB-Backed Guides**: Updated `loadPortcoGuide` to fetch configuration from `portfolio_guides` table, enabling dynamic guide creation via UI to take immediate effect in ingestion pipeline.
    *   **Dynamic Company Dropdown (v4.5)**: Refactored Import page to load portfolio companies dynamically from `/api/portfolio/companies` instead of hardcoded options. Company selection now sends UUID directly to `/api/ingest`, eliminating slug-to-ID resolution errors.
    *   **Ingest API Simplification (v3.3)**: Updated `/api/ingest` to accept `companyId` (UUID) as primary identifier. Removed complex company resolution logic that was causing `companyId is not defined` errors.
    *   **Guide API Robustness**: Enhanced `/api/portfolio/guide` with comprehensive error handling, graceful fallback for missing `type` column (migration compatibility), and detailed server-side logging.

*   **Ingestion Pipeline Performance (Dec 07)**:
    *   Parallel Person Enrichment moved to concurrent block.
    *   Refactored `/api/ingest` for parallel file upload processing.
    *   Added detailed Progress Overlay to `/import` UI.

*   **Data Quality (Dec 07)**:
    *   **Nelly Correction**: Updated metadata to reflect correct Fund (MVF1) and Status (MES(E)). Fixed domain enrichment to point to fintech entity `getnelly.de` instead of fashion retailer.

### Features Added

*   **Financial Ingestion Overhaul (v4.4)**:
    *   **Non-Blocking Job Queue**: Replaced modal-based uploads with a background job queue, allowing users to navigate and queue multiple companies concurrently.
    *   **Inline Status**: Integrated "Active Uploads" UI directly into the page layout.
    *   **UX Polish**: Added "Detecting..." feedback for company auto-selector and removed legacy "Local Mode" toggles.
    *   **Dashboard Linking**: Successful uploads now link directly to the specific company's Financials tab on the Portfolio Dashboard.

*   **Community Suggestions Page**:
    *   Public voting and feature requests at `/suggestions`.
    *   AI-powered duplicate detection and merging.
    *   Modern UI matching the Chrome Extension page aesthetic.

*   **Issue Reporting System**:
    *   Global feedback button with screenshot capture.
    *   GPT-4o Vision analysis of bug reports.
    *   Admin Issue Queue for tracking and status updates.

*   **Perplexity News Feed**:
    *   Real-time news integration in Portfolio Detail pages.
    *   Contextual queries and caching (12h TTL).
    *   Clickable source links with external icon indicators.

*   **Taxonomy Page Fixes & Enhancements**:
    *   Server-Side Stats and Accurate Entity Loading.
    *   Frontend Overhaul with lazy loading and hybrid search.

*   **Legal Document Analysis System v1.0**:
    *   AI-powered analysis of investor documentation (Term Sheets, SPAs, etc.).
    *   3-Phase Extraction Pipeline.
    *   Visual Snippets for audit trail.
    *   Chat Agent Integration.

*   **Portfolio Section Hub**: Unified `/portfolio` route structure.

*   **Financial Data Ingestion System v4.1**: Systematic Row Label Extraction (Coordinate-First Architecture).

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
| Bug fixed | Add to Appendix A → Bug Fixes |
| Performance improvement | Add to Appendix A → Infrastructure & Performance |
| Security change | Add to Appendix A → Security |
