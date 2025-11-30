# Cursor Handoff Document

## 1. Current Status (As of Dec 01, 2025)

**Objective**: Convert the platform into a "Conversational Knowledge Graph" - where users can chat with the data and see the graph update dynamically.

**Progress**:
- **System**:
  - `enhanced_embedding_generator.js`: **Fixed & Running**. Refactored to use `supabase-js` client to bypass server-side DNS resolution issues. Enriches Organizations via Web Scraper -> Perplexity (`sonar-pro`) -> GPT-5.1.
  - `enhanced_person_embedding_generator.js`: **Fixed & Running**. Refactored to use `supabase-js` client. Enriches People via Perplexity (`sonar-pro`) -> GPT-5.1.
  - `scripts/generate_relationships.js`: **Fixed & Running**. Refactored to use `supabase-js` client. Extracts market relationships using **GPT-5.1**.
  - `mv-intel-web/scripts/summarize_interactions.ts`: **Fixed & Running**. Refactored to use `supabase-js` client. Summarizes interaction history using **GPT-5.1**.
  - **Quality Control**:
    - **Audit**: Created `scripts/check_data_quality.js`.
    - **Purge**: Cleared 398 low-quality entities (short/unknown text, low confidence) for re-processing.
    - **Fixes**: Restored `systematic_cleanup.js` to use `Supabase Client` instead of direct Postgres connection.
  - **Database**:
    - **Conversational State**: Created `graph.conversations` and `graph.messages` tables.
    - **History Tracking**: Added `graph.history_log`.
    - **Interactions**: Added `graph.interactions` table for Notes, Meetings, Emails, Reminders.
    - **Files**: Added `graph.affinity_files` table.
    - **Rollup**: Added `graph.entity_notes_rollup` for summarized interaction history.
  - **Frontend**:
    - **Chat Interface**: Implemented split-screen chat UI (`ChatInterface.tsx`).
    - **Dynamic Graph**: Updated `Neo4jGraphViewer` to highlight nodes cited by the chatbot.
    - **Status Page**: Live pipeline monitoring with real-time sync counts.
    - **Updated NodeDetailPanel**: Added "Interactions" and "Files" tabs.
    - **Updated Search**: Added "Taxonomy" and "Seniority" filters.
    - **Graph RAG**: Added "AI Insight" button.
    - **Fixes**: Fixed `HTTP 404` error in Knowledge Graph search.

**Completed Tasks**:
- [x] **Conversational V1 Implementation**:
  - [x] Created `conversations` and `messages` tables.
  - [x] Built `ChatService` with **GPT-5.1** query rewriting.
  - [x] Created `/api/chat` endpoint orchestrating Rewrite -> Search -> Generate -> Graph Update.
  - [x] Integrated `ChatInterface` into Knowledge Graph page (split view).
  - [x] **Tested**: Verified end-to-end chat flow via API (Latency ~15s cold start, functional).
  - [x] **Graph Context Fix**: Added neighbor retrieval to RAG context to support queries like "Co-invested with X".
- [x] Switch to GPT-5.1 for all analysis.
- [x] Implement robust Perplexity fallback.
- [x] Fix `supabase-js` 0-row bug.
- [x] Implement "Enrichment Source" tracking.
- [x] Tune Graph Physics.
- [x] **Chrome Extension**:
  - [x] "One-click" connect.
  - [x] Universal capture.
- [x] **Relationship Extraction**:
  - [x] Created `generate_relationships.js`.
- [x] **Graph RAG**:
  - [x] Implemented `/api/graph-rag`.
- [x] **Universal Search Agent**:
  - [x] Intent Classification.
  - [x] Conversational UI.
  - [x] Fixed dynamic route 404.
- [x] **Automated Data Pipeline**:
  - [x] Created `scripts/run_pipeline.js` with **Batch Processing** (5x speedup).
  - [x] **Affinity Sync**: Implemented full sync including **Files**.
  - [x] **Interaction Summarization**: Created `scripts/summarize_interactions.ts` (Updated to GPT-5.1).
  - [x] **Fix**: Updated `run_pipeline.js` to use `tsx` for TypeScript files, fixing "All jobs have failed" error.
  - [x] **Fix**: Patched enrichment scripts to handle missing `.env` path in server execution context.
  - [x] **Fix**: Resolved DNS resolution errors by migrating `run_pipeline.js` and `systematic_cleanup.js` to use `supabase-js` client instead of direct Postgres connection.
  - [x] **Fix**: Resolved `42P10` ON CONFLICT errors in `sync.ts` by implementing manual upsert logic.
  - [x] **Fix**: Refactored ALL pipeline scripts (`enhanced_embedding_generator.js`, `enhanced_person_embedding_generator.js`, `summarize_interactions.ts`, `generate_relationships.js`) to use `supabase-js` client, ensuring full pipeline functionality despite server-side DNS issues with direct Postgres connection.
  - [x] **Fix**: Updated Perplexity API model from deprecated `llama-3.1-sonar` to `sonar-pro`.
  - [x] **Update**: Standardized all AI analysis tasks to use **GPT-5.1**.
  - [x] **Fix**: Resolved `fetch failed` error in `migrate-to-neo4j.ts` by adding retry logic with exponential backoff for Supabase fetches.
  - [x] **Resume**: Restored pipeline execution from mid-point (`embed_interactions.ts`) after failures, skipping completed steps.
  - [x] **Feature**: Implemented robust field mapping for Affinity sync (Status, Fund, Valuation, Sourced By).
  - [x] **Fix**: Relaxed error handling in `run_affinity_sync.ts` to prevent total pipeline failure on minor sync errors.
  - [x] **Fix**: Added validation for `--limit` argument in pipeline scripts to prevent NaN errors.
  - [x] **Fix**: Resolved `PGRST204` schema cache error by forcing a reload and verifying column existence.
  - [x] **Fix**: Updated `sync.ts` to include `participants: []` for all interaction types to satisfy `NOT NULL` DB constraint.
- [x] **Affinity Integration**:
  - [x] Backend: Updated `node-details` API.
  - [x] Frontend: Updated `NodeDetailPanel` to display Interactions and Files.
  - [x] **People Search Fix**: Updated Chat API to:
    - Automatically fetch and inject connected people (Founder, Works At) into the LLM context when an Organization is found.
    - **[v2]** Prioritize `Person` entities when the query implies it (e.g. "investors in..."), filtering by `types=['person']` and enriching results with employment history and organization connections.
  - [x] **Deep RAG (Notes)**:
  - [x] Confirmed `graph.interactions` table exists.
  - [x] Created `api/cron/embed-interactions` to generate embeddings for notes/meetings.
  - [x] Updated Chat Agent with `search_notes` tool.
  - [x] **Schema Mismatch Fix**: Created `supabase/migrations/20251130_fix_interactions_schema.sql` to resolve missing columns blocking sync.
  - [x] **Search Improvements**:
    - [x] **Hybrid Search**: Implemented Parallel Keyword Search using **Full Text Search** (`websearch_to_tsquery`) to correctly handle natural language queries (e.g. "what about Mark Gilbert" -> matches "Mark Gilbert").
    - [x] **Recall Boost**: Increased search result limit from 10 to **30** to ensure broader context coverage for RAG.
    - [x] **Smart Prioritization**: Implemented boosted ranking for **Portfolio Companies** (+0.25) and **Founders** (+0.15) to ensure they appear first in relevant searches.
    - [x] **Query Expansion**: Updated Chat System Prompt to automatically broaden "tool/software" queries with "AI", "WealthTech", and "Modern" to capture innovative solutions.
    - [x] **Data Correction**: Fixed classification of "Mark Gilbert (Zocks)" (Org -> Person) and re-generated his profile/embedding to fix search visibility.
    - [x] **Design Overhaul (Nov 30, 2025)**:
      - [x] **Main Page**: Set Knowledge Graph as the default landing page.
      - [x] **Navigation**: Implemented elegant collapsible "Spotlight" menu.
      - [x] **Taxonomy View**: Created interactive, searchable hierarchical view of Investment Taxonomy (`/taxonomy`).
      - [x] **Chrome Extension**: Added placeholder page (`/chrome-extension`).
      - [x] **Refactoring**: Extracted core graph logic to `KnowledgeGraphPageContent` for reusability.
    - [x] **UI Improvements**:
      - [x] **Spotlight Transition**: Lifted loading state to eliminate empty chat screen flash.
      - [x] **Result Tags**: Added Industry, Country, Pipeline Stage tags to results list; removed redundant description text.
      - [x] **Prioritization**: Updated Chat API to sort results by relevance (Portfolio first).
      - [x] **Graph Legend**: Updated legend to include "Amber" for Highlighted/Cited nodes.
      - [x] **Home & Branding**: Added Home icon to menu, updated "Motive Intelligence" branding, and added cycling search examples.
    - [x] **Pipeline Logic Fixes**:
      - [x] **Portfolio Flag**: Updated `sync.ts` to correctly detect `pipeline_stage` ("Portfolio MVF1", "Motive AAV", etc.) and set `is_portfolio=true`.
      - [x] **Founder Propagation**: Implemented `fix_portfolio_flags.ts` to automatically tag Founders/Owners of portfolio companies as "Portfolio" entities.
      - [x] **Official People Sync**: Updated `sync.ts` to fetch Organization details (`GET /organizations/{id}`) and extract `person_ids` to link official contacts, replacing noisy interaction mining.
    - [x] **Taxonomy & Data Quality (Dec 01, 2025)**:
      - [x] **Missing Categories**: Added `SAV` (Digital Savings), `ENT` (Enterprise Tech), `MKT` (Market Infrastructure), `CONS` (Consensus), `CAPR` (Capital Raising), and `OPS` (Finance Ops) to frontend.
      - [x] **Filtering Logic**: Implemented "Blocklist" filter to hide invalid categories (`UNKNOWN`, `UNDEFINED`, `OUT_OF_SCOPE`) and **Low-Count Filter** to hide noisy discovered categories (< 3 entities).
      - [x] **Pagination**: Updated `/api/taxonomy/entities` to support batch fetching, bypassing Supabase 1000-row limit.
      - [x] **Cleanup**: Created `fix_taxonomy.js` for reclassification.
      - [x] **UI**: Added visual grid layout, formatted entity counts with commas, and implemented server-side individual entity refresh.
      - [x] **Rebranding**: Updated application name from "MV Intelligence Platform" to "**Motive Intelligence**" in web metadata, PWA manifest, and Chrome extension.
      - [x] **Pre-loading**: Updated Taxonomy Page to fetch all entities upfront, enabling instant client-side filtering and navigation.
      - [x] **Payload Optimization**: Modified `/api/taxonomy/entities` to exclude `enrichment_data` column, significantly reducing initial load size.
      - [x] **Logic Fixes**: Corrected entity count logic to sum all items in a branch recursively.
      - [x] **Structural Update**: Moved "Consensus & Networks" (`CONS`) from root level to `IFT.CRYP.CONS`. Migrated database entities and updated frontend taxonomy tree.
    - [x] **Auth & Administration (Dec 01, 2025)**:
      - [x] **Login System**: Implemented "Spotlight Login" - email-only, magic link authentication, styled with Motive Intelligence aesthetic.
      - [x] **Route Protection**: Restricted all pages (`/`, `/taxonomy`, `/status`, `/admin`, etc.) to authenticated users only.
      - [x] **Admin Console**: Created `/admin` page for managing allowed users, restricted to `harsh.govil@motivepartners.com`.
      - [x] **User Management**: Implemented `allowed_users` table in Supabase and logic to add/delete/verify users.
      - [x] **Personalization**: Added "Good morning, [Name]" greeting to the main knowledge graph page.
      - [x] **Client Optimization**: Implemented Singleton pattern for Supabase client to prevent "Multiple GoTrueClient instances" warnings and ensure stable auth state.

## 2. Active Processes & Monitoring

1.  **Conversational Agent**:
    - Backend: `/api/chat` (Next.js)
    - Frontend: `ChatInterface` (React)
    - Database: `graph.conversations`, `graph.messages`
2.  **Automated Data Pipeline** (`run_pipeline.js`)
    - **Execution**: Runs hourly via GitHub Actions (Server-side) or manually via Status Page.
    - **Steps**:
        1.  `run_affinity_sync.ts`: Fetches Entities, Notes, Meetings, Files.
            - **Update**: Relaxed error handling to treat partial sync failures as warnings.
            - **Update**: Robust field mapping for critical business data (Status, Fund, Valuation).
            - **Update**: Fixed schema mismatch (`participants` column) to prevent silent sync failures.
        2.  `embed_interactions.ts`: **[NEW]** Generates vector embeddings for new interactions.
        3.  `summarize_interactions.ts`: Aggregates interaction history.
        4.  `enhanced_embedding_generator.js`: Enriches companies (Perplexity + GPT-5.1).
        5.  `generate_relationships.js`: Infers market relationships.
        6.  `migrate-to-neo4j.ts`: Syncs graph data.

## 3. Usage & Testing

### **Conversational Graph**
- **URL**: `http://localhost:3000/knowledge-graph`
- **Action**: Use the chat panel on the left.
- **Example**: "Who are the key investors in Generative AI?" -> Watch the graph highlight relevant nodes.

### **Pipeline Status**
- **Local/Server**: `http://localhost:3000/status`
- **GitHub Actions**: `https://github.com/insulartahiti/mv-intelligence-platform/actions` (Hourly Cron)
- **Features**: Real-time progress tracking, error logs, manual trigger.

## 4. Next Steps (Handoff)

1.  **Monitor Sync**: Trigger the GitHub Action now that the code is fixed and pushed.
2.  **Completion Estimate**: ~1.5 hours remaining for full completion (Entity migration -> Edge migration -> Person Enrichment -> Relationships -> Final Cleanup).
3.  **Dynamic Subgraph Retrieval**: Currently, the chat highlights nodes in the *full* graph. Ideally, the graph view should filter down to *only* the relevant subgraph for cleaner visualization.
4.  **"Explain" Feature**: Add a button to chat messages to visualize the specific path (Why is X relevant?) on the graph.
5.  **Performance Tuning**: Ensure Neo4j queries for node highlighting remain fast as graph grows.

## 5. Technical Notes

- **Affinity Files**: We now fetch file metadata and download links (valid for session or redirected) from Affinity.
- **Interaction Summarization**: Uses **GPT-5.1** to summarize the last 20 interactions per entity into a concise paragraph stored in Postgres.
- **Latency**: No local data sync required for chat; hybrid search (Postgres + Neo4j) is performant (<2s).
- **Graph Colors**:
  - **Blue**: Person
  - **Violet**: Organization
  - **Red**: Internal Team (Motive)
  - **Amber/Orange**: Highlighted Node (Cited in chat response or Search Result)
  - **Green**: Hovered Node
