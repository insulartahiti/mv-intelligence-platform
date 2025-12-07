# Motive Intelligence Platform - Engineering Handoff

**Last Updated:** Dec 04, 2025 (v4.1 - Systematic Row Label Extraction)

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
| **Legal Analysis** | `mv-intel-web/lib/legal/` |
| **Portfolio Section** | `mv-intel-web/app/portfolio/` |
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
| `legal_analyses` | Structured legal document analysis results |
| `legal_term_sources` | Source attribution for extracted legal terms |

### Storage Buckets

| Bucket | Purpose | Retention |
| :--- | :--- | :--- |
| `financial-docs` | Uploaded source files (PDF/Excel) | Temporary (deleted after ingestion) |
| `financial-snippets` | Audit trail snippets (page extracts) | Permanent |
| `legal-snippets` | Legal document page snippets with clause highlights | Permanent |

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
| `/api/portfolio/legal-analysis` | POST/GET | Legal document analysis and retrieval |

---

## Table of Contents

1. [System Overview & Architecture](#1-system-overview--architecture)
2. [Development Setup](#2-development-setup)
3. [Codebase Map](#3-codebase-map)
4. [Financial Data Ingestion System](#4-financial-data-ingestion-system)
5. [Legal Document Analysis System](#5-legal-document-analysis-system)
6. [Operational Runbook](#6-operational-runbook-data-pipelines)
7. [Current Status & Known Issues](#7-current-status--known-issues)
8. [Roadmap & Priorities](#8-roadmap--priorities)
9. [Key Architectural Decisions](#9-key-architectural-decisions)
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
3.  **Unified Extraction** (v3.1 - Dec 2025):
    *   **Single Pipeline for PDF + Excel**: `unified_extractor.ts` handles both file types with the same architecture.
    *   **GPT-5.1 (Primary Model)**: Released Nov 2025 with adaptive reasoning
        - Vision + structured analysis in one model
        - Enhanced instruction-following for financial contexts
        - Faster response times with "warmer" default personality
    *   **Deterministic Excel**: `xlsx` library for precise cell references (highest confidence)
    *   **Reconciliation**: GPT-5.1 merges all results, prefers structured for numbers, vision for visuals
    *   **Perplexity Sonar Pro**: Industry benchmark validation (optional)
4.  **Period Detection**: Extracted from document content (headers, titles, "As of...") by GPT-5.1. Filename is fallback only.
5.  **Mapping**: `mapDataToSchema` converts unified results to normalized `fact_financials` using Portco Guide rules.
6.  **Metrics**: Computed from Common Metrics definitions -> `fact_metrics`.
7.  **Audit Trail with Visual Highlighting** (v3.1):
    *   **Bounding Box Extraction**: GPT-4o returns `source_locations` with bbox coordinates (percentage of page)
    *   **Snippet Generation**: `pdf_snippet.ts` extracts single pages with annotations
    *   **Visual Highlighting**: Ellipse circles drawn around extracted values with labels
    *   **Storage**: Annotated snippets saved to `financial-snippets` bucket with signed URLs

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

### Systematic Row Label Extraction (v4.1)

The coordinate-first extraction strategy eliminates LLM hallucination by separating **structure identification** from **value reading**.

```
┌─────────────────────────────────────────────────────────────┐
│              SYSTEMATIC COORDINATE EXTRACTION               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PHASE 1: Column Structure (LLM)                            │
│  ┌─────────────────────────────────────────────┐            │
│  │ "Find date columns and actual/budget split" │            │
│  │ → columnDates: { "D": "2024-03-01", ... }   │            │
│  │ → actualColumns: ["D", "E", "F", ...]       │            │
│  │ → budgetColumns: ["P", "Q", "R", ...]       │            │
│  └─────────────────────────────────────────────┘            │
│                         ↓                                   │
│  PHASE 2: Row Label Index (NO LLM - Deterministic)          │
│  ┌─────────────────────────────────────────────┐            │
│  │ Scan columns A/B/C of ALL sheets            │            │
│  │ Build index of ALL row labels:              │            │
│  │ → { sheet: "P&L", row: 29, label: "Gross Margin" }      │
│  │ → { sheet: "P&L", row: 85, label: "Cash Balance" }      │
│  │ → ... thousands of row labels indexed ...    │            │
│  └─────────────────────────────────────────────┘            │
│                         ↓                                   │
│  PHASE 3: LLM Label Matching (Single Call)                  │
│  ┌─────────────────────────────────────────────┐            │
│  │ "Match guide metrics to row labels"         │            │
│  │ cash_balance_os → "Cash Balance" (row 85)   │            │
│  │ runway_months → "Runway (months)" (row 90)  │            │
│  │ saas_customers → "SaaS Customers" (row 45)  │            │
│  └─────────────────────────────────────────────┘            │
│                         ↓                                   │
│  PHASE 4: Merge Coordinates                                 │
│  ┌─────────────────────────────────────────────┐            │
│  │ Column structure + Row matches = Full map   │            │
│  └─────────────────────────────────────────────┘            │
│                         ↓                                   │
│  PHASE 5: Single Deterministic Parse                        │
│  ┌─────────────────────────────────────────────┐            │
│  │ sheet.data[row][col] for every coordinate   │            │
│  │ NO LLM reads values - 100% deterministic    │            │
│  └─────────────────────────────────────────────┘            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Key Benefits:**
- **100% row coverage**: Scans ALL rows, not samples
- **No hallucinated values**: LLM only provides coordinates, code reads values
- **Fuzzy label matching**: LLM excels at matching "Total actual MRR" → `total_actual_mrr`
- **Single parse**: Values read once at the end with complete coordinate map

**Results (Nelly Test Case):**
- Before: 12 metrics extracted per period
- After: 25 metrics extracted per period (2x+ improvement)
- New metrics found: `cac`, `cogs_private_factoring`, `cogs_public_factoring`, `customers`, `customers_finos`, `customers_saas`, `installment_loans_outstanding`, `interest_cost`, `loan_loss`, `pos_hardware_cost`, `pos_processing_cost`, `services_cost`

### Cross-File Reconciliation (v3.5)

When multiple files are ingested for the same company/period, the system must intelligently resolve conflicts.

#### Source Priority Rules

| File Type | Base Priority | Notes |
| :--- | :---: | :--- |
| Board Deck | 100 | Gold standard for Actuals |
| Investor Report | 80 | Monthly updates |
| Budget File | 60 (Actuals) / 120 (Budget) | Highest for budget scenario |
| Financial Model | 40 | Working documents |
| Raw Export | 20 | Unstructured data |

#### Explanation Priority Boost

Contextual explanations extracted from documents can elevate a lower-priority source:

| Explanation Type | Boost | Effect |
| :--- | :---: | :--- |
| `restatement` | +50 | "Q3 revenue restated..." - Can override Board Deck |
| `correction` | +40 | "Accounting error fixed..." - Can override |
| `forecast_revision` | +20 | "Updated forecast based on..." |
| `one_time` | +10 | "Includes one-time charge..." |
| `commentary` | 0 | General notes, no priority change |

#### Reconciliation Logic

```
For each (company, metric, period, scenario):
  
  1. Calculate Effective Priority = Base Priority + Explanation Boost
  
  2. Compare New vs Existing:
     - New > Existing → OVERWRITE (auto)
     - New < Existing → IGNORE (auto)
     - Equal Priority:
       - If variance > 1% AND has restatement/correction → USE NEW
       - If variance > 1% AND no explanation → FLAG CONFLICT
       - If variance ≤ 1% → UPDATE (minor rounding)
  
  3. Append to Changelog:
     { timestamp, oldValue, newValue, reason, source_file, explanation, view_source_url }
```

#### Changelog Structure

Every `LocalFactRecord` stores its full history:

```typescript
interface LocalFactRecord {
  // ... core fields ...
  priority?: number;
  explanation?: string;
  changelog?: ChangeLogEntry[];
}

interface ChangeLogEntry {
  timestamp: string;
  oldValue: number | null;
  newValue: number;
  reason: string;           // "Higher Priority Source", "RESTATEMENT", etc.
  source_file: string;
  explanation?: string;     // Contextual note from document
  view_source_url?: string; // Link to snippet
}
```

#### UI Indicators

- **History Icon** (📝): Appears next to any fact with `changelog.length > 1`
- **Info Icon** (ℹ️): Appears if fact has an `explanation` but no changes
- **Click to Expand**: Shows full changelog with source links
- **Conflict Panel**: Red banner for high-severity conflicts requiring review

### Visual Audit Highlighting (v3.1)

When GPT-5.1 extracts metrics, it also returns `source_locations` with bounding box coordinates:

```json
{
  "financial_summary": {
    "actuals": { "mrr": 782800, "arr": 9393600 },
    "source_locations": {
      "mrr": { "page": 1, "bbox": { "x": 0.6, "y": 0.3, "width": 0.15, "height": 0.03 } },
      "arr": { "page": 1, "bbox": { "x": 0.6, "y": 0.35, "width": 0.15, "height": 0.03 } }
    }
  }
}
```

The `pdf_snippet.ts` module then:
1. Extracts the relevant page from the source PDF
2. Draws ellipse annotations around each extracted value
3. Adds labels showing the metric name and value
4. Uploads the annotated snippet to storage

This provides **pixel-level auditability** - users can see exactly where each number came from.

**Key Benefits:**
- Cross-validation between models catches extraction errors
- Best-in-class for each task (vision for visuals, structured for reasoning)
- Graceful fallbacks if one model fails
- Same quality for PDF and Excel files

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

## 5. Legal Document Analysis System

**Status: Production Ready**

This module provides AI-powered analysis of investor documentation, extracting structured legal terms and risk assessments from term sheets, SPAs, SHAs, SAFEs, CLAs, and other investment documents.

### Architectural Philosophy

1. **Extension, Not Silo**: Legal analysis attaches to portfolio companies in the Knowledge Graph via `company_id`.
2. **Unified Extraction**: 3-Phase Pipeline using GPT-5.1 vision + structured output.
3. **Agent-Accessible**: Exposed to Chat Agent via `get_legal_analysis` tool.
4. **Audit Trail**: Source snippets stored with bounding box annotations for clause verification.

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

This architecture ensures high-quality extraction across large deal bundles while providing real-time progress feedback.

### Snippet Generation (Visual Audit)

The system generates visual "screenshots" of source clauses using a hybrid approach:

1.  **PDFs**: Uses `pdf-to-img` (with Node.js polyfill) to render high-resolution PNGs of pages.
    *   Adds yellow highlight overlays to relevant sections (if coordinates available).
    *   Fallback: If image rendering fails, extracts the single page as an annotated PDF file.
2.  **Word Docs**: Generates text-based snippet images (`generateTextSnippet`) by rendering the surrounding text context into a clean SVG/PNG image.
3.  **Storage**: Snippets are uploaded to `legal-snippets` bucket and served via signed URLs.

### Supported File Formats

| Format | Processing Method | Snippets |
| :--- | :--- | :--- |
| PDF | GPT-5.1 Vision API | Yes (page extraction with highlights) |
| DOCX | `mammoth` text extraction → GPT-5.1 | No (text quotes only) |

### Document Types Supported

| Instrument Type | Description |
| :--- | :--- |
| `US_PRICED_EQUITY` | NVCA-style preferred share financings (Series Seed/A/B) |
| `US_SAFE` | YC-style Simple Agreement for Future Equity |
| `US_CONVERTIBLE_NOTE` | Convertible promissory notes with interest/maturity |
| `UK_EQUITY_BVCA_STYLE` | UK equity with Subscription + SHA + Articles |
| `UK_EU_CLA` | Convertible Loan Agreements (UK/EU) |
| `EUROPEAN_PRICED_EQUITY` | Non-UK European priced equity (GmbH, AG, SAS, etc.) |

### Document Grouping

When multiple files are uploaded, the system automatically groups related documents:

| Group Type | Documents Included |
| :--- | :--- |
| `priced_equity_bundle` | SPA + SHA + IRA + Voting Agreement + Articles |
| `convertible_bundle` | SAFE/Note/CLA + Side Letters |
| `standalone` | Single unrelated document |

**Grouping Logic:**
1. Each document is classified by filename/content (term_sheet, spa_stock_purchase, sha_shareholders_agreement, etc.)
2. Related documents are grouped for combined analysis
3. A primary document is identified (SPA > SHA > Term Sheet)
4. The LLM cross-references terms between documents in the same group

### Analysis Output Structure

The analysis extracts and classifies terms across 9 major sections:

1. **Executive Summary**: Key points with GREEN/AMBER/RED flags
2. **Transaction Snapshot**: Valuation, round size, ownership
3. **Economics & Downside**: Liquidation preference, anti-dilution, dividends
4. **Ownership & Dilution**: Option pool, convertibles, founder vesting
5. **Control & Governance**: Board seats, protective provisions, drag/tag-along
6. **Investor Rights**: Pre-emption, information rights, ROFR
7. **Exit & Liquidity**: Distribution waterfall, IPO conversion
8. **GC Focus Points**: Legal risks, reps/warranties, disputes
9. **Flag Summary**: Overall risk assessment by category

### Data Flow

```
[Upload PDF] → [GPT-5.1 Vision] → [Structured JSON] → [Database]
                    ↓                     ↓
            [Jurisdiction/Type]    [Snippet Generation]
               Detection              → Storage
```

### Key Files

| File | Purpose |
| :--- | :--- |
| `lib/legal/types.ts` | TypeScript interfaces for analysis output |
| `lib/legal/prompts/investor_doc_analyzer.ts` | Full VC lawyer prompt schema |
| `lib/legal/pipeline/*` | 3-Phase extraction logic (Phase 1, 2, 3) |
| `lib/legal/snippets/*` | Visual snippet generation (PDF/Image/Text) |
| `lib/legal/extractor.ts` | Legacy document extraction pipeline (deprecated) |
| `lib/legal/instrument_classifier.ts` | Jurisdiction & instrument type detection |
| `app/portfolio/legal/page.tsx` | Upload and analysis UI |
| `app/api/portfolio/legal-analysis/route.ts` | API endpoint |

### Database Schema

```sql
-- Core analysis storage
legal_analyses (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES graph.entities(id),
  document_name TEXT,
  document_type TEXT,      -- e.g. 'US_SAFE'
  jurisdiction TEXT,       -- 'US', 'UK', 'Continental Europe'
  analysis JSONB,          -- Full structured analysis
  executive_summary JSONB, -- Key points with flags
  flags JSONB,             -- Category-level risk flags
  created_at TIMESTAMPTZ
)

-- Source attribution
legal_term_sources (
  id UUID PRIMARY KEY,
  analysis_id UUID REFERENCES legal_analyses(id),
  section TEXT,            -- e.g. 'liquidation_preference'
  term_key TEXT,           -- e.g. 'multiple'
  page_number INT,
  snippet_url TEXT,        -- Link to annotated PDF page
  bbox JSONB               -- Bounding box coordinates
)
```

### Chat Agent Integration

The Chat Agent can retrieve legal analyses via the `get_legal_analysis` tool:

```
User: "What are the terms of the Acme Series A?"
Agent: [Calls get_legal_analysis with companyId]
       Returns: Executive summary, key flags, link to full analysis
```

### UI Pages

| Page | Purpose |
| :--- | :--- |
| `/portfolio` | Portfolio section dashboard |
| `/portfolio/legal` | Document upload and analysis |
| `/portfolio/legal/history` | Past analyses list |
| `/portfolio/legal/analysis?id=...` | View specific analysis |

---

## 6. Operational Runbook (Data Pipelines)

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

## 7. Current Status & Known Issues

### Status Summary
*   **Conversational Agent**: **Live**. Uses GPT-5.1 with query expansion and tool calling (`search_notes`, `traverse_graph`, `get_legal_analysis`).
*   **Graph UI**: **Stable**. Features "Highlighting" for cited nodes and "Densification" to show hidden connections.
*   **Data Pipeline**: **Stable**. Migrated to `supabase-js` to resolve server-side DNS issues.
*   **Financial Ingestion**: **Staging**. New module for processing Portco financials (PDF/Excel) with drag-and-drop UI and "Portco Guide" mapping logic.
*   **Legal Analysis**: **Production Ready**. New module for analyzing investor documentation (term sheets, SAFEs, CLAs, etc.) with Chat Agent integration.
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

## 8. Roadmap & Priorities

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

## 9. Key Architectural Decisions

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

### Why Unified Multi-Model Extraction?
**Decision**: Use parallel GPT-4o + GPT-5.1 + Perplexity instead of single-model or deterministic-only extraction.

**Rationale**:
- **Serverless Compatibility**: `pdf-parse` (pdfjs-dist) fails in Vercel with "r is not a function" error
- **Cross-Validation**: Multiple models catch each other's errors (e.g., OCR misreads)
- **Best-in-Class**: GPT-4o for visuals, GPT-5.1 for financial reasoning, xlsx for precision
- **Period Detection**: GPT-5.1 extracts reporting period from document content (not just filename)
- **Benchmark Context**: Perplexity adds industry comparisons for outlier detection

**Trade-offs**:
- **Cost**: ~$0.05-0.15 per document (parallel API calls)
- **Latency**: ~5-10s per document (parallel, so not 3x slower)
- **Rate Limits**: Subject to OpenAI + Perplexity API limits

**Implementation**: `lib/financials/ingestion/unified_extractor.ts` - single entry point for PDF and Excel.

---

## Appendix A: Changelog (Dec 04, 2025)

### Features Added

*   **Legal Document Analysis System v1.0**: AI-powered analysis of investor documentation.
    *   **Comprehensive Term Extraction**: Analyzes term sheets, SPAs, SHAs, SAFEs, CLAs, convertible notes, and side letters.
    *   **Multi-Jurisdiction Support**: Classifies documents as US, UK, or Continental Europe based on drafting signals.
    *   **7 Instrument Types**: US_PRICED_EQUITY, US_SAFE, US_CONVERTIBLE_NOTE, UK_EQUITY_BVCA_STYLE, UK_EU_CLA, EUROPEAN_PRICED_EQUITY, OTHER.
    *   **9-Section Analysis**: Executive Summary, Transaction Snapshot, Economics, Ownership, Control, Investor Rights, Exit, Legal/GC, Flag Summary.
    *   **Risk Flagging**: GREEN/AMBER/RED flags for economics, control, dilution, investor rights, and legal risk.
    *   **Source Attribution**: PDF page snippets with bounding box annotations for audit trail.
    *   **Chat Agent Integration**: `get_legal_analysis` tool for conversational access to past analyses.
    *   **Portfolio Section**: New `/portfolio` route structure housing both financial and legal analysis.
    *   **Database Schema**: `legal_analyses` and `legal_term_sources` tables with `legal-snippets` storage bucket.
    *   **Word Document Support**: Analyzes both PDF and Word (.docx) documents using `mammoth` library for text extraction.
    *   **Document Grouping**: Automatically groups related documents (e.g., SPA + SHA + Side Letter) for combined deal-package analysis.
        *   Groups detect priced equity bundles, convertible bundles, or standalone documents.
        *   Primary document identified for each group (e.g., SPA > SHA > Term Sheet).
        *   Multi-document analysis cross-references terms between documents.
    *   **Multi-File Upload**: UI supports drag-and-drop of multiple files simultaneously.
    *   **Visual Snippets**:
        *   **PDF**: Renders true page "screenshots" (PNG) with `pdf-to-img` + `sharp`. Handles Node.js environments via custom `DOMMatrix` polyfills. Fallback to annotated PDF pages if image rendering fails.
        *   **Word**: Generates synthesized text snippet images for `.docx` sources.
        *   **UI**: "View Source" buttons open snippets in a modal lightbox.

*   **Portfolio Section Hub**: Unified `/portfolio` route with sub-navigation.
    *   `/portfolio` - Dashboard with links to financials and legal
    *   `/portfolio/financials` - Redirects to existing `/import` (temporary)
    *   `/portfolio/legal` - Legal document upload and analysis UI
    *   `/portfolio/legal/history` - Past analyses list
    *   `/portfolio/legal/analysis` - View specific analysis

*   **Financial Data Ingestion System v4.1**: Systematic Row Label Extraction.
    *   **5-Phase Coordinate-First Architecture**: Complete rewrite of extraction logic to eliminate LLM hallucination.
        - Phase 1: LLM identifies column structure (dates, actual/budget columns)
        - Phase 2: Deterministic scan builds complete row label index (NO LLM)
        - Phase 3: LLM matches guide metrics to row labels (single fuzzy-match call)
        - Phase 4: Merge column structure with row matches
        - Phase 5: Single deterministic parse reads values from coordinates
    *   **100% Row Coverage**: Scans ALL rows in ALL sheets for labels, not just samples.
    *   **No Hallucinated Values**: LLM only provides coordinates (sheet, row, column). Code reads actual values using `xlsx` library - impossible to hallucinate.
    *   **2x+ Metric Improvement**: Nelly test case improved from 12 to 25 metrics per period.
    *   **New Metrics Found**: `cac`, `cogs_private_factoring`, `cogs_public_factoring`, `cogs_saas_and_integrations`, `customers`, `customers_finos`, `customers_saas`, `installment_loans_outstanding`, `interest_cost`, `loan_loss`, `pos_hardware_cost`, `pos_processing_cost`, `services_cost`.
    *   **Timezone Fix**: Date display now uses UTC to prevent off-by-one errors (e.g., "Sep 24" showing as "Aug 24").
    *   **Row Label Index**: `buildRowLabelIndex()` scans columns A/B/C of all sheets and builds a comprehensive index of potential metric labels.
    *   **Fuzzy Label Matching**: `matchMetricsToRowLabels()` uses LLM to match guide metric IDs to actual spreadsheet row labels (e.g., "Total actual MRR" → `total_actual_mrr`).

*   **Financial Data Ingestion System v3.9**: Multi-Sheet Time Series Extraction.
    *   **Dynamic Actual/Forecast Detection**: Replaced hardcoded date logic with dynamic header scanning. The system now identifies transition columns (e.g., "Actual" vs "Forecast") per file.
    *   **Snippet Cell Overlay**: Generated snippets now include the target cell address (e.g., "Target: J29") overlaid on the image for instant verification.
    *   **Strict Sheet/Date Alignment**: LLM prompt updated to verify date headers *per sheet* to handle files where Revenue and P&L sheets have different column structures.
    *   **Multi-Sheet Extraction**: LLM prompts now explicitly instruct extraction from BOTH Revenue sheet (MRR, ARR, customers) AND P&L sheet (revenue, margins, opex) and combine into same period entries.
    *   **Full Time Series**: Extracts all monthly columns (typically 12-36 months) instead of just latest period.
    *   **Metrics Table Layout**: Computed metrics now display in same table format as financial data (not cards).
    *   **Granular Source Attribution**: Enforced `sheet` and `cell` extraction for every data point in time series.
    *   **Guide Transparency**: Added "View Active Portco Guide" section in UI for debugging mapping logic.
    *   **Robust JSON Parsing**: Fixed parser to handle truncated LLM responses and trailing commas.
    *   **Column Reference Fix**: `columnIndexToLetter()` now supports columns beyond Z (AA, AB, AC...).
    *   **Output Tab Prioritization**: `categorizeSheets()` identifies output tabs (Revenue, P&L, Charts) vs input tabs (Data, Raw) and prioritizes output tabs for extraction.
    *   **Cover Sheet Context**: `extractCoverSheetContext()` captures high-level context from first rows of sheets.
    *   **Tail Row Scanning**: Extracts last 100 rows of each sheet to capture summary/total rows.
    *   **Actual/Forecast Detection**: Vision context now identifies transition columns between actual and forecast data.
    *   **Excel Snippet Generation**: `generateExcelSnippetImage()` renders highlighted cell regions as PNG images for audit trail.
    *   **Metrics Mapping Injection**: Up to 20 metrics from Portco Guide's `metrics_mapping` injected into extraction prompts.
    *   **Source Location Enhancement**: Each extracted value includes sheet name and cell reference (e.g., "Revenue!N29").

*   **Financial Data Ingestion System v3.8**: Robust Excel Ingestion with Layout-Aware Assistants.
    *   **Layout-Aware Edge Functions**: `extract-excel-assistant` now performs a deterministic `xlsx` scan of the workbook before calling the LLM. It generates "Layout Hints" (sheet names, potential header rows, data dimensions) to guide the Assistant, drastically reducing hallucinations and empty extractions.
    *   **Direct Storage Access**: Edge Functions now download files directly from Supabase Storage (using `storagePath`) instead of accepting base64 payloads, bypassing Vercel's payload limits and enabling processing of large financial models (20MB+).
    *   **Strict Schema Enforcement**: The Assistant's instructions now enforce the exact `UnifiedExtractionResult` JSON structure, ensuring compatibility with the downstream mapping pipeline.
    *   **Portco Guide Injection**: Company-specific mapping rules (`guide.yaml`) are injected into the Assistant's system prompt as high-priority "hints", allowing it to find obscure metrics (e.g., "Deferred Revenue is in cell B45").

*   **Financial Data Ingestion System v3.7**: Hybrid Vercel + Supabase Edge Architecture.
    *   **NO FUNCTIONALITY SACRIFICED**: Full feature parity across all deployment targets.
    *   **Hybrid Architecture**: Vercel for API routing, Supabase Edge for heavy processing.
        ```
        ┌─────────────────────────────────────────────────────────────────────────┐
        │                         VERCEL (Next.js API Routes)                     │
        │                                                                         │
        │  • maxDuration: 300s (Pro), 800s with Fluid Compute                    │
        │  • Handles: File upload, routing, light processing, response           │
        │  • Falls back to: Supabase Edge Functions for heavy operations         │
        └────────────────────────────────────┬────────────────────────────────────┘
                                             │
                    ┌────────────────────────┴────────────────────────┐
                    │                                                 │
                    ▼                                                 ▼
        ┌───────────────────────────────┐           ┌───────────────────────────────┐
        │  Supabase Edge: extract-      │           │  Supabase Edge: render-       │
        │  excel-assistant              │           │  pdf-snippet                  │
        │                               │           │                               │
        │  • OpenAI Assistants API      │           │  • magick-wasm (ImageMagick)  │
        │  • Code Interpreter           │           │  • PDF to PNG rendering       │
        │  • No timeout constraints     │           │  • Annotation overlays        │
        │  • Polling without limits     │           │  • Crop to region             │
        └───────────────────────────────┘           └───────────────────────────────┘
        ```
    *   **Supabase Edge Functions Created**:
        *   `extract-excel-assistant`: Full Assistants API with Code Interpreter
            - Handles complex Excel analysis
            - 5+ minute execution time supported
            - Returns structured JSON with source locations
        *   `render-pdf-snippet`: PDF page to PNG with annotations
            - Uses `magick-wasm` (WebAssembly ImageMagick)
            - Draws bounding boxes and labels
            - Supports cropping and DPI settings
    *   **Vercel Configuration**:
        *   `maxDuration: 300` on ingestion routes (Pro plan)
        *   Fluid Compute can extend to 800s if needed
        *   Automatic fallback to Edge Functions for long operations
    *   **Extraction Priority Order (Excel)**:
        1. Supabase Edge Function (Assistants API) - Best accuracy, no timeouts
        2. Vision-Guided 2-Phase (Local) - Best for development
        3. Chat API Single-Pass (Serverless fallback) - Always works
    *   **Vision-Guided Excel Extraction**: 2-phase pipeline for maximum accuracy.
        *   Phase 1: Vision pre-scan identifies sheet purposes, table locations, actual vs budget columns
        *   Phase 2: Guided extraction uses context hints to extract precise values
        *   Eliminates conflicting outputs from parallel extraction
    *   **Parallel File Extraction**: Multiple files processed concurrently.
        *   Extraction phase runs in parallel (`Promise.all`)
        *   Post-processing (mapping, reconciliation) sequential for consistency
        *   Significant speedup for multi-file uploads
    *   **Time-Series Pivot Table**: New UI visualization.
        *   Metrics as rows, dates as columns
        *   Actual / Budget / Variance % for each period
        *   Sticky metric column for horizontal scrolling
        *   Supports multi-period data from single documents
    *   **Screenshot Snippets**: High-resolution PNG rendering.
        *   Supabase Edge: `magick-wasm` for serverless PDF rendering
        *   Local: `pdf2pic` + `sharp` for development
        *   Falls back gracefully based on environment

*   **Financial Data Ingestion System v3.5**: Reconciliation Engine & Changelog.
    *   **Reconciliation Service** (`lib/financials/ingestion/reconciliation.ts`): Intelligent conflict resolution when ingesting multiple files.
        *   **Source Priority**: Board Deck (P100) > Investor Report (P80) > Budget File (P60) > Financial Model (P40) > Raw Export (P20)
        *   **Scenario-Specific**: Budget files get higher priority (P120) for budget scenario data
        *   **Explanation Boost**: Restatements (+50) and Corrections (+40) can elevate a lower-priority file
    *   **Variance Explanations**: LLM now extracts contextual commentary from documents (e.g., "MRR decreased due to churn from Enterprise customer X")
        *   Types: `restatement`, `correction`, `one_time`, `forecast_revision`, `commentary`, `other`
        *   Restatements/Corrections can override even Board Deck numbers
    *   **Changelog Tracking**: Every fact stores a `changelog[]` array with full history of changes
        *   Each entry: `{ timestamp, oldValue, newValue, reason, source_file, explanation, view_source_url }`
    *   **UI Enhancements**:
        *   History icon (📝) appears next to any data point that has been updated
        *   Click icon to expand inline changelog with source links
        *   Reconciliation summary shows: New / Updated / Ignored / Conflicts
        *   Conflict panel highlights high-severity conflicts with recommendations
        *   File type badges with priority scores (e.g., "BOARD DECK P100")
    *   **Conflict Resolution Logic**:
        *   Higher priority → Overwrite (automatic)
        *   Lower priority → Ignore (automatic)
        *   Equal priority + >1% variance → Flag conflict + optimistic update
        *   Equal priority + explanation (restatement/correction) → Use new value

*   **Financial Data Ingestion System v3.4**: Multi-Period & Advanced Visualization.
    *   **Multi-Period Extraction**: Updated `unified_extractor.ts` and `map_to_schema.ts` to support time-series extraction (e.g., 12 months of MRR from one PDF).
    *   **Pivoted Financial Table**: New UI table showing **Actual vs Budget vs Variance** side-by-side.
    *   **Local Snippet Server**: Generated snippets are served locally (`/api/local-snippet`) for immediate audit links without cloud storage.
    *   **Robust JSON Parsing**: Improved resiliency against markdown code blocks in LLM responses.
    *   **Visual Improvements**: Cleaned up "Key Metrics" as cards and detailed financials as a structured table.
    *   **No Hallucination**: Prompt uses placeholders, not example values that could be copied
    *   **Fail-Fast**: Removed fallback methods - extraction fails clearly instead of degrading
    *   **Scenario Separation**: Actuals vs Budget clearly separated in UI and computation
    *   **Deduplication**: Same metric from multiple sources uses latest value, not sum
    *   **Visual Audit Highlighting**: Ellipse annotations drawn around extracted values in PDF snippets
    *   **Unified Extractor** (`unified_extractor.ts`): Single pipeline for PDF + Excel
    *   **Perplexity Benchmarks**: Industry comparison via Sonar Pro API
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

*   **Financial Ingestion (Dec 03)**:
    *   Fixed column reference bug where columns beyond Z displayed incorrectly (e.g., `[231` instead of `AA231`)
    *   Fixed time-series not displaying in UI due to missing `date` field in API response
    *   Fixed XLSX import missing in `ingest-local` route causing `ReferenceError: XLSX is not defined`
    *   Fixed `max_tokens` → `max_completion_tokens` for GPT-5.1 model calls
    *   Fixed `outputFileTracingIncludes` location in `next.config.js` (moved to `experimental` block)
    *   Fixed date parsing for YYYYMMDD filename format (e.g., `20250301_Budget.xlsx`)
    *   Fixed Budget file detection patterns for `(\d{4}) Annual Budget` and `Budget (\d{4})` formats

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
