# Motive Intelligence Platform - Engineering Handoff

**Last Updated:** Dec 01, 2025

This document serves as the primary onboarding and operational guide for the Motive Intelligence Platform. It covers system architecture, operational workflows, and the current development roadmap.

---

## 1. System Overview & Architecture

The Motive Intelligence Platform is a **Conversational Knowledge Graph** that aggregates data from Affinity (CRM), external enrichment sources, and interaction logs into a unified graph database. It enables users to query their network using natural language.

### Core Stack
- **Frontend**: Next.js 14 (App Router), React, Tailwind CSS.
- **Primary Database**: Supabase (PostgreSQL) - Stores structured entity data, interaction logs, and vector embeddings (`pgvector`).
- **Graph Database**: Neo4j (AuraDB) - Stores relationship nodes and edges for visualization and traversal.
- **AI/LLM**: OpenAI GPT-5.1 (Reasoning & Synthesis), Perplexity `sonar-pro` (Enrichment), Supabase Edge Functions.
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
2.  **Edge Function Secrets**: Set the following secrets for production edge functions (specifically `linkedin-api-direct`):
    ```bash
    supabase secrets set LINKEDIN_REDIRECT_URI="https://motivepartners.ai/api/knowledge-graph/linkedin-callback"
    ```

### Key Commands
Run these from the `mv-intel-web/` directory:

| Action | Command | Description |
| :--- | :--- | :--- |
| **Start App** | `npm run dev` | Starts Next.js on localhost:3000 |
| **Run Pipeline** | `node scripts/run_pipeline.js` | Triggers full data sync & enrichment |
| **Test Pipeline** | `node scripts/run_pipeline.js --test` | Runs a dry run (limit 5) to verify logic |
| **Manual Sync** | `tsx scripts/run_affinity_sync.ts` | Syncs only Affinity data (skips enrichment) |
| **Sync Graph** | `tsx scripts/migrate-to-neo4j.ts` | Pushes current Postgres data to Neo4j |

---

## 3. Codebase Map

### `mv-intel-web/` (Frontend & API)
*   `app/api/chat/`: Core Chat Agent logic (Next.js Route Handler).
*   `app/components/Neo4jGraphViewer.tsx`: Main graph visualization component (Vis.js).
*   `app/components/ChatInterface.tsx`: Split-screen chat UI.
*   `lib/search/postgres-vector.ts`: Hybrid search implementation.
*   `lib/graph/`: Graph algorithms and helpers.

**Note:** Components relying on `graphology` (e.g., `EnhancedClientGraph.tsx`) have been disabled to fix build issues.

### `mv-intel-web/scripts/` (Data Pipeline)
*   `run_pipeline.js`: Master orchestrator script.
*   `run_affinity_sync.ts`: Affinity API ingestion logic.
*   `enhanced_embedding_generator.js`: Entity enrichment (Perplexity + GPT).
*   `generate_relationships.js`: Relationship inference.
*   `intelligent_cleanup.ts`: LLM-based data hygiene (deduplication).

### `supabase/` (Database)
*   `functions/`: Edge Functions for scheduled tasks and webhooks.
*   `migrations/`: SQL schemas for `graph.conversations`, `graph.interactions`, etc.

---

## 4. Operational Runbook (Data Pipelines)

### The "Self-Healing" Pipeline
The master script `mv-intel-web/scripts/run_pipeline.js` orchestrates the data refresh. It runs hourly via GitHub Actions.

**Pipeline Stages:**
1.  **Sync**: Fetches delta updates from Affinity.
2.  **Parallel Enrichment Block**:
    *   **Embed**: Vectorizes new notes/meetings.
    *   **Summarize**: Generates 1-paragraph summaries of interaction history (p-limit: 10).
    *   **Enrich (Orgs)**: Fills missing fields for Organizations via Web Search (batch: 50).
3.  **Sync & Person Enrichment**:
    *   **Graph Sync**: Updates Neo4j with Org data.
    *   **Enrich (People)**: Enriches People using newly enriched Company context.
4.  **Relate**: Extracts 2nd-degree connections.
5.  **Final Push**: Updates Neo4j with all new inferences.

### Common Issues & Debugging
*   **"Supabase 0-row bug"**: If scripts fail to fetch data, ensure the `supabase-js` client is initialized with the *Service Role Key*, not the Anon Key.
*   **Timeout Errors**: `postgres-vector.ts` can timeout on generic queries. Fix: Ensure `ILIKE` filters are used before vector similarity.
*   **GitHub Actions Failure**: Check the "Actions" tab in GitHub. Common cause: Missing secrets or Neo4j connection limits.
*   **Vercel Build Errors**: If API routes fail to build due to "Supabase URL required", ensure the client initialization is *inside* the handler function, not global.

---

## 5. Current Status & Known Issues (as of Dec 01, 2025)

### Status Summary
*   **Conversational Agent**: **Live**. Uses GPT-5.1 with query expansion and tool calling (`search_notes`, `traverse_graph`).
*   **Graph UI**: **Stable**. Features "Highlighting" for cited nodes and "Densification" to show hidden connections.
*   **Data Pipeline**: **Stable**. Migrated to `supabase-js` to resolve server-side DNS issues.
*   **Deployment**: **Production**. Live at https://motivepartners.ai.

### Known Risks & Limitations
*   **Taxonomy Limits**: The `/api/taxonomy/entities` endpoint hits Supabase's 1000-row limit. *Mitigation: Pagination implemented, but monitor performance.*
*   **Latency**: Initial graph load can be heavy (~2s). *Work In Progress: Subgraph retrieval optimization.*
*   **Affinity Rate Limits**: Full syncs are API-intensive. *Next Step: Implement strict Delta Sync.*

---

## 6. Roadmap & Priorities

### Immediate Priorities (This Week)
1.  **Monitor Edge Creation**: Verify `owner` and `sourced_by` fields are correctly creating edges in Neo4j.
2.  **Verify Cleanup**: Check logs of `intelligent_cleanup.ts` (Weekly Run) to ensure no valid entities are being merged/deleted.
3.  **Delta Sync**: Modify `run_affinity_sync.ts` to fetch only records modified since `last_sync`.

### Strategic Backlog
*   **Subgraph Retrieval**: Instead of loading the full graph, query Neo4j for *only* the nodes relevant to the current user context/search.
*   **"Explain" Feature**: Add UI to visualize *why* a node was recommended (e.g., highlight the path "You -> Invested In X -> Partnered With Y").
*   **Email Drafting**: Expand `draft_message` tool to support template selection.

---

## Appendix: Recent Changelog (Dec 01, 2025)

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
*   **Improved**: Search recall boosted (10 -> 30 results) and portfolio prioritization (+0.25 score).
