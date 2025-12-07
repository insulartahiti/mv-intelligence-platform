import { ArchitectureData } from './types';

export const architectureData: ArchitectureData = {
  "lastUpdated": "2025-12-07T06:23:52.293Z",
  "version": "1.2.0",
  "views": {
    "overview": {
      "id": "overview",
      "label": "System Overview",
      "description": "The Motive Intelligence Platform aggregates proprietary CRM data, external enrichment signals, and AI-derived insights into a unified Conversational Knowledge Graph.",
      "nodes": [
        {
          "id": "frontend",
          "label": "Frontend App",
          "type": "frontend",
          "iconName": "Layout",
          "description": "A modern React application built on Next.js 14 (App Router), serving as the primary interface for portfolio management, graph exploration, and data ingestion.",
          "details": [
            "Next.js 14 App Router",
            "Tailwind CSS & Radix UI",
            "Vis.js & React Sigma (Graph Viz)",
            "Hosted on Vercel (Edge Network)"
          ],
          "x": 10,
          "y": 50
        },
        {
          "id": "api",
          "label": "API Layer",
          "type": "backend",
          "iconName": "Server",
          "description": "Serverless API routes and Edge Functions that orchestrate data flow between the frontend, databases, and AI services.",
          "details": [
            "/api/chat (AI Agent & Tool Calling)",
            "/api/ingest (Parallel File Processing)",
            "/api/universal-search (Hybrid Retrieval)",
            "Supabase Edge Functions (Long-running tasks)"
          ],
          "x": 35,
          "y": 50
        },
        {
          "id": "supabase",
          "label": "Supabase (Postgres)",
          "type": "database",
          "iconName": "Database",
          "description": "The primary relational source of truth, storing structured entity data, vector embeddings, financial facts, and interaction logs.",
          "details": [
            "pgvector (1536d embeddings)",
            "Row Level Security (RLS)",
            "Real-time Subscriptions",
            "Financial & Legal Fact Tables"
          ],
          "x": 60,
          "y": 30
        },
        {
          "id": "neo4j",
          "label": "Neo4j (Graph)",
          "type": "database",
          "iconName": "Share2",
          "description": "A high-performance graph database optimized for traversing complex relationship networks and visualizing connections.",
          "details": [
            "AuraDB Managed Instance",
            "Cypher Query Language",
            "Entity Resolution & Deduping",
            "Synced from Postgres via Pipeline"
          ],
          "x": 60,
          "y": 70
        },
        {
          "id": "ai_services",
          "label": "AI Services",
          "type": "ai",
          "iconName": "Brain",
          "description": "A suite of external LLMs and cognitive services providing reasoning, enrichment, and vision capabilities.",
          "details": [
            "GPT-5.1 (Reasoning & Extraction)",
            "GPT-4o (Vision & Analysis)",
            "Perplexity Sonar Pro (Live Enrichment)",
            "OpenAI Embeddings (text-embedding-3)"
          ],
          "x": 85,
          "y": 50
        }
      ],
      "connections": [
        {
          "from": "frontend",
          "to": "api",
          "label": "HTTP/REST"
        },
        {
          "from": "api",
          "to": "supabase",
          "label": "Read/Write"
        },
        {
          "from": "api",
          "to": "neo4j",
          "label": "Cypher Queries"
        },
        {
          "from": "api",
          "to": "ai_services",
          "label": "Inference"
        },
        {
          "from": "supabase",
          "to": "neo4j",
          "label": "Sync Pipeline"
        }
      ]
    },
    "pipeline": {
      "id": "pipeline",
      "label": "Data Pipeline",
      "description": "An automated, self-healing ETL pipeline that synchronizes CRM data, enriches it with AI, and maintains graph consistency.",
      "nodes": [
        {
          "id": "affinity",
          "label": "Affinity CRM",
          "type": "external",
          "iconName": "Users",
          "description": "The authoritative source for relationship data, providing raw organization and person records via API v1.",
          "details": [
            "Incremental Sync Strategy",
            "Organizations & People",
            "Interaction History (Email/Cal)",
            "Note & File Attachments"
          ],
          "x": 10,
          "y": 50
        },
        {
          "id": "sync",
          "label": "Ingestion Orchestrator",
          "type": "backend",
          "iconName": "Zap",
          "description": "A set of resilient Node.js scripts that fetch raw data, handle rate limits, and normalize inputs before processing.",
          "details": [
            "run_affinity_sync.ts",
            "Fault-tolerant Batching",
            "Raw Data Staging (No AI)",
            "Orphan Detection & Cleanup"
          ],
          "x": 30,
          "y": 50
        },
        {
          "id": "enrichment",
          "label": "Parallel AI Enrichment",
          "type": "ai",
          "iconName": "Cpu",
          "description": "A concurrent processing block that enhances raw entities with embeddings, summaries, and external intelligence.",
          "details": [
            "Vectorization (embed_interactions.ts)",
            "Summarization (GPT-4o-mini)",
            "Entity Enrichment (Perplexity)",
            "Taxonomy Classification (GPT-5.1)"
          ],
          "x": 55,
          "y": 50
        },
        {
          "id": "graph_sync",
          "label": "Graph Synchronization",
          "type": "database",
          "iconName": "Share2",
          "description": "The final pipeline stage that pushes enriched, deduplicated entities and relationships into the Neo4j graph.",
          "details": [
            "migrate-to-neo4j.ts",
            "Relationship Inference",
            "Edge Creation (Invested, Advisor)",
            "Stale Data Pruning"
          ],
          "x": 80,
          "y": 50
        }
      ],
      "connections": [
        {
          "from": "affinity",
          "to": "sync",
          "label": "API Sync"
        },
        {
          "from": "sync",
          "to": "enrichment",
          "label": "Raw Data Stream"
        },
        {
          "from": "enrichment",
          "to": "graph_sync",
          "label": "Enriched Entities"
        }
      ]
    },
    "ingestion": {
      "id": "ingestion",
      "label": "Financial Ingestion",
      "description": "A specialized pipeline for extracting structured financial data from unstructured PDF and Excel documents with 100% auditability.",
      "nodes": [
        {
          "id": "files",
          "label": "Source Documents",
          "type": "external",
          "iconName": "FileText",
          "description": "Financial reporting documents uploaded by portfolio companies, often in varying formats.",
          "details": [
            "Board Decks (PDF)",
            "Monthly Reporting Packages (Excel)",
            "Financial Models",
            "Budget Files"
          ],
          "x": 10,
          "y": 50
        },
        {
          "id": "guide",
          "label": "Portfolio Guide",
          "type": "database",
          "iconName": "BookOpen",
          "description": "Company-specific YAML configuration that defines how to map the unique layout of a company's reports to standard metrics.",
          "details": [
            "Stored in portfolio_guides table",
            "Row/Cell Mappings",
            "Dynamic Updates via AI",
            "Defines \"Revenue\" vs \"Total Income\""
          ],
          "x": 25,
          "y": 20
        },
        {
          "id": "extractor",
          "label": "Unified Extraction Engine",
          "type": "ai",
          "iconName": "Brain",
          "description": "A multi-model system combining vision capabilities with deterministic parsing to extract accurate financial time-series.",
          "details": [
            "GPT-5.1 (Vision + Reasoning)",
            "XLSX Deterministic Parser",
            "Coordinate-First Row Labeling",
            "Cross-File Reconciliation"
          ],
          "x": 45,
          "y": 50
        },
        {
          "id": "fact_financials",
          "label": "Fact Financials",
          "type": "database",
          "iconName": "Box",
          "description": "A normalized storage layer for raw line-items, maintaining full lineage to the source file and page.",
          "details": [
            "fact_financials table",
            "Audit Snippets (Pixel-perfect)",
            "Scenario Management (Actual/Budget)",
            "Currency Normalization"
          ],
          "x": 75,
          "y": 35
        },
        {
          "id": "fact_metrics",
          "label": "Computed Metrics",
          "type": "database",
          "iconName": "TrendingUp",
          "description": "Derived KPIs calculated from raw facts, serving as the \"Answer Key\" for the AI Agent.",
          "details": [
            "Standardized KPIs (ARR, Burn)",
            "Period-over-Period Growth",
            "Variance Analysis",
            "Agent-Accessible Tooling"
          ],
          "x": 75,
          "y": 65
        }
      ],
      "connections": [
        {
          "from": "files",
          "to": "extractor",
          "label": "Secure Upload"
        },
        {
          "from": "guide",
          "to": "extractor",
          "label": "Mapping Rules"
        },
        {
          "from": "extractor",
          "to": "fact_financials",
          "label": "Raw Extraction"
        },
        {
          "from": "extractor",
          "to": "fact_metrics",
          "label": "Compute & Normalize"
        }
      ]
    },
    "legal": {
      "id": "legal",
      "label": "Legal Analysis",
      "description": "An intelligent pipeline for analyzing investor agreements, extracting terms, and flagging risks across complex deal structures.",
      "nodes": [
        {
          "id": "legal_docs",
          "label": "Legal Deal Room",
          "type": "external",
          "iconName": "FileText",
          "description": "Sets of investment documents uploaded for analysis, often containing multiple related agreements.",
          "details": [
            "Term Sheets & SPAs",
            "Shareholders Agreements (SHA)",
            "Convertible Notes / SAFEs",
            "Side Letters"
          ],
          "x": 15,
          "y": 50
        },
        {
          "id": "phase1",
          "label": "Phase 1: Extraction",
          "type": "ai",
          "iconName": "Zap",
          "description": "High-speed parallel processing of individual documents to extract raw terms and clauses.",
          "details": [
            "Parallel GPT-4o-mini Calls",
            "OCR & Text Extraction",
            "Key Term Identification",
            "Jurisdiction Detection"
          ],
          "x": 35,
          "y": 50
        },
        {
          "id": "phase2",
          "label": "Phase 2: Categorization",
          "type": "ai",
          "iconName": "Layers",
          "description": "Deep analysis of specific risk vectors using specialized legal reasoning prompts.",
          "details": [
            "Economics & Liquidation",
            "Control & Governance",
            "Investor Rights",
            "Visual Snippet Generation"
          ],
          "x": 55,
          "y": 50
        },
        {
          "id": "phase3",
          "label": "Phase 3: Synthesis",
          "type": "ai",
          "iconName": "Brain",
          "description": "Cross-document reasoning to detect conflicts and generate a unified deal summary.",
          "details": [
            "Deal Package Synthesis",
            "Conflict Detection",
            "Risk Flagging (Red/Amber/Green)",
            "Executive Summary Generation"
          ],
          "x": 75,
          "y": 50
        },
        {
          "id": "db",
          "label": "Legal Knowledge Base",
          "type": "database",
          "iconName": "ShieldCheck",
          "description": "Structured storage for legal intelligence, enabling semantic search and agent retrieval.",
          "details": [
            "legal_analyses table",
            "Clause-level Attribution",
            "Dynamic Configuration",
            "Agent Tool Integration"
          ],
          "x": 95,
          "y": 50
        }
      ],
      "connections": [
        {
          "from": "legal_docs",
          "to": "phase1",
          "label": "Batch Upload"
        },
        {
          "from": "phase1",
          "to": "phase2",
          "label": "Extracted Terms"
        },
        {
          "from": "phase2",
          "to": "phase3",
          "label": "Risk Vectors"
        },
        {
          "from": "phase3",
          "to": "db",
          "label": "Persist Analysis"
        }
      ]
    }
  }
};
