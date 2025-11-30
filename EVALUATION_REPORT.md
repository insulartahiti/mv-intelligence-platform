# Product & Architecture Evaluation: Conversational Knowledge Graph

## 1. High Level Assessment

The **Current Implementation** aligns well with the core **Proposal** vision of a "universal conversational semantic / RAG search," specifically in establishing the foundational data and retrieval architecture. However, the conversational experience is currently "search-centric" rather than a true "assistant" that guides exploration.

*   **Strong Retrieval Foundation**: The implementation successfully combines **Semantic Vector Search** (Postgres) with **Graph Context** (Neo4j/Postgres Relations) to feed the RAG pipeline. This directly supports the "Combined ranked results and graph view" requirement.
*   **Emerging Conversational Patterns**: The system supports basic multi-turn context (via query rewriting) and entity highlighting (`relevantNodeIds`). However, it lacks the advanced "drill-down" and "graph manipulation" commands (e.g., "show only Europe", "explain this path") as first-class UI interactions.
*   **Visual-Verbal Disconnect**: While the Chat and Graph coexist, they are loosely coupled. The Chat highlights nodes, but does not yet drive the *view state* (zooming, filtering subgraphs) or allow the user to "pivot" purely through conversation beyond simple search refinement.
*   **Data Richness**: The underlying enrichment pipeline (GPT-5.1 based) provides the deep data needed for "Answer Cards," but the UI currently splits this between the Chat response and the Node Detail panel, rather than a unified "Answer Card" pattern.

## 2. Gap Analysis

| Proposal Element | Current Support | Gap | Notes |
| :--- | :--- | :--- | :--- |
| **Answer Card + Knowledge Map** | **Partial**. Chat returns text; `SearchResultsList` shows tiles; Graph highlights nodes. | Missing a unified "Answer Card" UI component that synthesizes text + key entities + stats in the chat stream. | Current chat response is Markdown text. Ideally, it should render structured components. |
| **Combined Ranked Results & Graph** | **Supported**. Search results appear as list and highlighted nodes in graph. | Graph rendering is currently "Global Graph with Highlights" or "Local Subgraph". | Need to refine the "Dynamic Subgraph" logic to act more like a "Concept Neighborhood" based on the query. |
| **"Explain this result" (Paths)** | **Partial**. `NodeDetailPanel` shows connection paths. | No direct "Why?" button in the search list or chat. | Explanation is currently hidden in the detail panel rather than being a conversational follow-up ("Why is Tink relevant?"). |
| **Concept Neighborhoods** | **Implicit**. Search results + 1-hop neighbors are fetched. | UI does not explicitly frame these as "neighborhoods" or allow browsing adjacent concepts easily. | |
| **Time Slider** | **Not Supported**. | No temporal filtering or visualization. | Data (updated_at, founding_date) exists but is not exposed in filters. |
| **Workspaces / Saved Slices** | **Not Supported**. | State is transient (per session). | |
| **Multi-hop Reasoning** | **Partial**. RAG uses graph neighbors. | Retrieval is limited to 1-hop neighbors. Complex 2-3 hop paths (A -> B -> C) are not fully traversed for context. | Requires recursive graph queries in the RAG pipeline. |
| **Conversational Refinement** | **Supported**. Query rewriting handles "focus on X". | "Drill down" and "Filter" commands rely on LLM rewriting, which can be flaky. | Need explicit "Tool Use" (Function Calling) for the LLM to manipulate UI state (filters, zoom). |

## 3. Recommended Conversational V1 Design

**Philosophy**: Move from "Search -> Result" to "Conversational Exploration". The Chat is the controller; the Graph is the view.

**Architecture**:
*   **Chat Interface as Command Center**: The search bar IS the chat. Users can type "Search for X" or "Show me X".
*   **Unified "Result Block"**: Instead of just text, the Assistant returns a **Compound Message**:
    1.  **Synthesis**: "Here are the payment companies..." (Text).
    2.  **Entity Tiles**: Interactive cards for top results (Visual).
    3.  **Graph Actions**: Auto-zoom the graph to the result set.
*   **Interactive Refinement**:
    *   User: "Filter to UK only."
    *   System: Updates `subgraph` filter, updates Tiles, responds "Filtered to United Kingdom." (Uses LLM Function Calling).

**V1 Scope**:
*   **Included**: Unified Search/Chat, Compound Responses (Text + Tiles), Dynamic Subgraph (Query-based), Basic Refinement (Filters via Rewrite).
*   **Deferred**: Time Slider, Workspaces, complex multi-hop reasoning (beyond 2 degrees), custom "Explain" UI paths (rely on Detail Panel for now).

## 4. Implementation Plan

### Phase 1: Core Conversational V1 (Immediate)
**Goal**: Make the chat "drive" the application state robustly.

1.  **Refine `fetchSubgraph`**: Ensure it returns a tightly connected cluster (Query Hits + Paths between them) rather than just isolated nodes + 1-hop.
2.  **LLM Function Calling**: Upgrade `ChatService` to use OpenAI Tools. Instead of just "Rewriting", the LLM should output structured commands: `setFilters({ country: 'UK' })`, `selectNode(id)`, `explainConnection(id1, id2)`.
3.  **Responsive Graph**: Ensure `Neo4jVisNetwork` reacts smoothly to these commands (Zoom to fit, Filter visibility).
4.  **Structured Chat Responses**: Allow the Chat UI to render "Tiles" *inside* the message stream (or immediately below the relevant message) to tighten the context loop.

### Phase 2: Rich Exploration (Next)
**Goal**: Allow deeper analysis of *relationships*.

1.  **"Why?" Actions**: Add a "Why?" button to every entity tile. Clicking it triggers a specific RAG workflow: "Find paths between [User Context] and [Entity]".
2.  **Temporal Context**: Add `founded_year` or `last_funding` to the graph visualization (e.g., node color/size) and allow filtering.
3.  **Saved Views**: Persist `conversationId` + `graphState` to allow revisiting insights.

## 5. Open Questions & Spikes

1.  **Graph Layout Stability**: Does `vis-network` handle dynamic subgraph updates smoothly enough?
    *   *Spike*: Test updating the dataset with 50% overlap. Does it jitter? (Current physics tuning improved this, but needs verification with large datasets).
2.  **Hallucination Control**: Does the LLM invent relationships?
    *   *Mitigation*: We already enforce strict extraction. We should add a "Citations" step where every claim is linked to a Node ID.
3.  **Latency**: Can we run `fetchSubgraph` (Postgres + Neo4j) < 500ms?
    *   *Observation*: Currently fast. As graph grows, we may need to cache subgraphs or use Neo4j GDS for faster traversal.

**Conclusion**: The current system is a solid "Beta". It parses data well and visualizes it. The leap to "Product" requires tighter coupling between the Chat intent and the UI state (Filters, Zoom, Selection) via LLM Function Calling.

