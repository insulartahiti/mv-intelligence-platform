# Cursor Handoff Document

## 1. Current Status (As of Nov 30, 2025)

**Objective**: Convert the platform into a "Conversational Knowledge Graph" - where users can chat with the data and see the graph update dynamically.

**Progress**:
- **System**:
  - `enhanced_embedding_generator.js`: **Fixed & Running**. Refactored to use `supabase-js` client to bypass server-side DNS resolution issues. Enriches Organizations via Web Scraper -> Perplexity -> GPT-5.1.
  - `enhanced_person_embedding_generator.js`: **Fixed & Running**. Refactored to use `supabase-js` client. Enriches People via Perplexity -> GPT-5.1.
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
  - [x] **Search UI**: Added `SearchResultsList` component to display all relevant entities under the graph.
  - [x] **Graph UI**: Updated `Neo4jVisNetwork` for full Dark Mode support and optimized physics for smoother navigation.
  - [x] **Pipeline Refactor**: Migrated `enhanced_embedding_generator.js` and `enhanced_person_embedding_generator.js` to use `supabase-js` client, eliminating DNS/connection issues with `pg` in serverless environments.
  - [x] **API Refactor**: Migrated `/api/neo4j/node-details` to use `supabase-js` client to ensure rich data (AI Analysis, Files) loads reliably.
  - [x] **Bug Fix**: Fixed `fetchSubgraph` to include `business_analysis` so search result tiles show descriptions.
  - [x] **UX Feature**: Added "Entity Search" (Autocomplete) to sidebar for direct lookup.
  - [x] **UX Feature**: Implemented Navigation History (Back button) in Node Detail Panel.
  - [x] **Consolidation**: Unified Search/Chat interface (removed separate Entity Search) and implemented `SearchResultsList` for tile-based browsing.
  - [x] **Evaluation**: Conducted architectural review against "Conversational Knowledge Graph" proposal.
  - [x] **Data Integrity**: Updated pipeline scripts (`enhanced_embedding_generator.js`) to auto-sync `business_analysis` content to the legacy `ai_summary` field.
  - [x] **Migration**: Running `scripts/migrate_summaries.ts` in background to backfill `ai_summary` for 29k+ entities.
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
- [x] **Affinity Integration**:
  - [x] Backend: Updated `node-details` API.
  - [x] Frontend: Updated `NodeDetailPanel` to display Interactions and Files.

## 2. Active Processes & Monitoring

1.  **Conversational Agent**:
    - Backend: `/api/chat` (Next.js)
    - Frontend: `ChatInterface` (React)
    - Database: `graph.conversations`, `graph.messages`
2.  **Affinity Sync** (`run_affinity_sync.ts`)
    - Pulls Entities, Notes, Meetings, Emails, Reminders, **and Files**.
    - Runs in parallel batches of 5.
    - Updates `graph.history_log`.
3.  **Interaction Summarization** (`summarize_interactions.ts`)
    - Aggregates recent interactions into `graph.entity_notes_rollup`.
4.  **Enrichment & Graph Sync**
    - `enhanced_embedding_generator.js`
    - `generate_relationships.js`
    - `migrate-to-neo4j.ts`

## 3. Usage & Testing

### **Conversational Graph**
- **URL**: `http://localhost:3000/knowledge-graph`
- **Action**: Use the chat panel on the left.
- **Example**: "Who are the key investors in Generative AI?" -> Watch the graph highlight relevant nodes.

### **Pipeline Status**
- **URL**: `http://localhost:3000/status`
- **Features**: Real-time progress tracking, error logs, manual trigger.

## 4. Next Steps (Handoff)

1.  **Dynamic Subgraph Retrieval**: Currently, the chat highlights nodes in the *full* graph. Ideally, the graph view should filter down to *only* the relevant subgraph for cleaner visualization.
2.  **"Explain" Feature**: Add a button to chat messages to visualize the specific path (Why is X relevant?) on the graph.
3.  **Performance Tuning**: Ensure Neo4j queries for node highlighting remain fast as graph grows.

## 5. Technical Notes

- **Affinity Files**: We now fetch file metadata and download links (valid for session or redirected) from Affinity.
- **Interaction Summarization**: Uses **GPT-5.1** to summarize the last 20 interactions per entity into a concise paragraph stored in Postgres.
- **Latency**: No local data sync required for chat; hybrid search (Postgres + Neo4j) is performant (<2s).
