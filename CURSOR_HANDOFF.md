# Cursor Handoff Document

## 1. Current Status (As of Nov 30, 2025)

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
- [x] **Affinity Integration**:
  - [x] Backend: Updated `node-details` API.
  - [x] Frontend: Updated `NodeDetailPanel` to display Interactions and Files.
- [x] **Deep RAG (Notes)**:
  - [x] Confirmed `graph.interactions` table exists.
  - [x] Created `api/cron/embed-interactions` to generate embeddings for notes/meetings.
  - [x] Updated Chat Agent with `search_notes` tool.
  - [x] **Schema Mismatch Fix**: Created `supabase/migrations/20251130_fix_interactions_schema.sql` to resolve missing columns blocking sync.

## 2. Active Processes & Monitoring

1.  **Conversational Agent**:
    - Backend: `/api/chat` (Next.js)
    - Frontend: `ChatInterface` (React)
    - Database: `graph.conversations`, `graph.messages`
2.  **Automated Data Pipeline** (`run_pipeline.js`)
    - **Execution**: Runs hourly via GitHub Actions (Server-side) or manually via Status Page.
    - **Steps**:
        1.  `run_affinity_sync.ts`: Fetches Entities, Notes, Meetings, Files.
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
- **URL**: `http://localhost:3000/status`
- **Features**: Real-time progress tracking, error logs, manual trigger.

## 4. Next Steps (Handoff)

1.  **Monitor Sync**: The pipeline is running (PID 68564). Interactions (notes/meetings) should start populating in `graph.interactions`.
2.  **Embed Notes**: Once data appears, run `curl http://localhost:3000/api/cron/embed-interactions` to generate vector embeddings.
3.  **Dynamic Subgraph Retrieval**: Currently, the chat highlights nodes in the *full* graph. Ideally, the graph view should filter down to *only* the relevant subgraph for cleaner visualization.
3.  **"Explain" Feature**: Add a button to chat messages to visualize the specific path (Why is X relevant?) on the graph.
4.  **Performance Tuning**: Ensure Neo4j queries for node highlighting remain fast as graph grows.

## 5. Technical Notes

- **Affinity Files**: We now fetch file metadata and download links (valid for session or redirected) from Affinity.
- **Interaction Summarization**: Uses **GPT-5.1** to summarize the last 20 interactions per entity into a concise paragraph stored in Postgres.
- **Latency**: No local data sync required for chat; hybrid search (Postgres + Neo4j) is performant (<2s).
