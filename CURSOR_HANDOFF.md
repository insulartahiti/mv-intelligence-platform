
# Cursor Handoff Document

**Last Updated:** 2025-12-07
**Status:** Staging / Production-Ready

## 1. Project Overview
**Motive Intelligence Platform** is a Next.js application designed to provide intelligence on portfolio companies, deal flow, and network relationships. It integrates a Knowledge Graph (Neo4j/Supabase), Financial Data Ingestion (PDF/Excel), and Legal Document Analysis.

## 2. Key Architecture
- **Frontend:** Next.js 14 (App Router), Tailwind CSS, Lucide Icons.
- **Backend:** Supabase (PostgreSQL), Edge Functions (Deno), Neo4j (Graph DB).
- **AI/ML:** OpenAI GPT-5.1 (Reasoning/Generation), GPT-4o (Vision/Extraction), Perplexity (Live Enrichment).
- **Ingestion Pipeline:**
  - **Financials:** PDF/Excel -> Vision/Edge Functions -> Resolution -> Standardized Schema (Fact/Dimension).
  - **Legal:** PDF -> OCR/Text -> LLM Analysis -> Structured Output -> Vector/Graph Storage.
- **Navigation:**
  - `CollapsibleMenu` (z-index: 100): Floating persistent menu for global navigation.
  - `PortfolioLayout`: Sticky header for portfolio-specific context.

## 3. Recent Features Added
- **Portfolio Dashboard Categorization:**
  - Companies grouped by standardized fund names (MVF1, MVF2, Motive AAV, Motive Create).
  - Expandable/Collapsible fund sections.
  - Search functionality across companies, funds, and industries.
- **Navigation Improvements:**
  - Added "Portfolio" to the main global navigation.
  - Fixed z-index layering issues to ensure the navigation pill (`CollapsibleMenu`) appears on all pages, including those with sticky headers.
- **Portfolio Detail Page:**
  - Tabbed interface (Overview, Financials, Legal, Config).
  - Dynamic "Guide Editor" for financial extraction rules.
  - Integrated "Financials Dashboard" with metrics and charts.
  - Legal Analysis history grouped by deal/round.
- **Financial Ingestion:**
  - Reconciliation Engine: Handles conflicting data points with priority and changelogs.
  - Dynamic Guide Loading: Uses database-stored YAML configs instead of static files.
- **Legal Analysis:**
  - "Legal Config" editor for global rules and semantic normalization.
  - Inline snippets for auditability in analysis results.
  - Merged "Nelly" entities to single "Nelly Solutions" record.

## 4. Key File Locations
- `app/portfolio/page.tsx`: Main dashboard with fund grouping logic.
- `app/components/CollapsibleMenu.tsx`: Global navigation component.
- `app/api/portfolio/companies/route.ts`: API for fetching portfolio companies.
- `app/api/portfolio/guide/route.ts`: API for dynamic guide management.
- `supabase/migrations/`: Database schema changes (ensure `DROP POLICY IF EXISTS` is used).

## 5. Deployment Instructions
- **Database:** Run pending migrations in `supabase/migrations/`.
- **Edge Functions:** Deploy `extract-excel-assistant` and `render-pdf-snippet`.
- **Environment:** Ensure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, `NEO4J_URI` are set.
- **Build:** Standard Next.js build (`npm run build`).

## 6. Known Issues / To-Dos
- **Ingestion:** Verify handling of non-standard fiscal years in Excel ingestion.
- **Neo4j:** Ensure periodic sync scripts (`npm run sync:architecture`) are scheduled.
- **Testing:** Add end-to-end tests for the full ingestion flow.
