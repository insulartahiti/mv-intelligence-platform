import { ArchitectureData } from './types';

export const architectureData: ArchitectureData = {
  lastUpdated: new Date().toISOString(),
  version: "1.0.0",
  views: {
    overview: {
      id: "overview",
      label: "System Overview",
      description: "High-level architecture of the Motive Intelligence Platform",
      nodes: [
        {
          id: 'frontend',
          label: 'Frontend App',
          type: 'frontend',
          iconName: 'Layout',
          description: 'Next.js 14 App Router application with Tailwind CSS and React.',
          details: [
            'App Router Architecture',
            'Tailwind CSS Styling',
            'Radix UI Primitives',
            'Vis.js & React Sigma Graph Viz',
            'Vercel Hosting'
          ],
          x: 10,
          y: 50
        },
        {
          id: 'api',
          label: 'API Layer',
          type: 'backend',
          iconName: 'Server',
          description: 'Next.js API Routes and Supabase Edge Functions.',
          details: [
            '/api/chat - AI Agent',
            '/api/ingest - File Processing',
            '/api/universal-search - Hybrid Search',
            'Edge Functions for Long-running Tasks'
          ],
          x: 35,
          y: 50
        },
        {
          id: 'supabase',
          label: 'Supabase (Postgres)',
          type: 'database',
          iconName: 'Database',
          description: 'Primary relational database and vector store.',
          details: [
            'Structured Entity Data',
            'pgvector Embeddings',
            'Interaction Logs',
            'Row Level Security (RLS)',
            'Financial Data Facts'
          ],
          x: 60,
          y: 30
        },
        {
          id: 'neo4j',
          label: 'Neo4j (Graph)',
          type: 'database',
          iconName: 'Share2',
          description: 'Graph database for relationship traversal and visualization.',
          details: [
            'Entity Nodes & Edges',
            'Graph Algorithms',
            'Network Visualization Source',
            'Synced from Postgres'
          ],
          x: 60,
          y: 70
        },
        {
          id: 'ai_services',
          label: 'AI Services',
          type: 'ai',
          iconName: 'Brain',
          description: 'External AI models for reasoning and enrichment.',
          details: [
            'OpenAI GPT-5.1 (Reasoning)',
            'Perplexity Sonar Pro (Enrichment)',
            'Embedding Models (text-embedding-3)',
            'Vision API (PDF/Image Analysis)'
          ],
          x: 85,
          y: 50
        }
      ],
      connections: [
        { from: 'frontend', to: 'api', label: 'HTTP/REST' },
        { from: 'api', to: 'supabase', label: 'Read/Write' },
        { from: 'api', to: 'neo4j', label: 'Cypher Queries' },
        { from: 'api', to: 'ai_services', label: 'Inference' },
        { from: 'supabase', to: 'neo4j', label: 'Sync Pipeline' }
      ]
    },
    pipeline: {
      id: "pipeline",
      label: "Data Pipeline",
      description: "Data ingestion and enrichment flow",
      nodes: [
        {
          id: 'affinity',
          label: 'Affinity CRM',
          type: 'external',
          iconName: 'Users',
          description: 'Source of truth for relationship data.',
          details: [
            'People & Organizations',
            'Interaction History',
            'Notes & Files',
            'API v1 Sync'
          ],
          x: 10,
          y: 50
        },
        {
          id: 'sync',
          label: 'Ingestion Script',
          type: 'backend',
          iconName: 'Zap',
          description: 'Raw data fetching and normalization.',
          details: [
            'run_affinity_sync.ts',
            'Incremental Fetching',
            'Raw Data Storage',
            'No AI Processing (Speed)'
          ],
          x: 30,
          y: 50
        },
        {
          id: 'enrichment',
          label: 'Parallel Enrichment',
          type: 'ai',
          iconName: 'Cpu',
          description: 'Concurrent AI processing block.',
          details: [
            'Embed Interactions (Vector)',
            'Summarize History (GPT-4o)',
            'Enrich Entities (Perplexity)',
            'Taxonomy Classification'
          ],
          x: 55,
          y: 50
        },
        {
          id: 'graph_sync',
          label: 'Graph Sync',
          type: 'database',
          iconName: 'Share2',
          description: 'Migration to Graph Database.',
          details: [
            'migrate-to-neo4j.ts',
            'Deduplication',
            'Edge Creation',
            'Relationship Inference'
          ],
          x: 80,
          y: 50
        }
      ],
      connections: [
        { from: 'affinity', to: 'sync', label: 'API Sync' },
        { from: 'sync', to: 'enrichment', label: 'Raw Data' },
        { from: 'enrichment', to: 'graph_sync', label: 'Enriched Data' }
      ]
    },
    ingestion: {
      id: "ingestion",
      label: "Financial Ingestion",
      description: "Unified PDF & Excel extraction pipeline",
      nodes: [
        {
          id: 'files',
          label: 'PDF / Excel',
          type: 'external',
          iconName: 'FileText',
          description: 'Source financial documents.',
          details: ['Board Decks', 'P&Ls', 'Budget Files'],
          x: 15,
          y: 50
        },
        {
          id: 'extractor',
          label: 'Unified Extractor',
          type: 'ai',
          iconName: 'Brain',
          description: 'Multi-model extraction engine.',
          details: [
            'GPT-5.1 (Vision + Reasoning)',
            'XLSX Parser (Deterministic)',
            'Perplexity (Benchmarks)',
            'Reconciliation Engine'
          ],
          x: 45,
          y: 50
        },
        {
          id: 'fact_financials',
          label: 'Fact Financials',
          type: 'database',
          iconName: 'Box',
          description: 'Normalized financial line items.',
          details: ['Line Item ID', 'Amount', 'Date', 'Source Snippet'],
          x: 75,
          y: 35
        },
        {
          id: 'fact_metrics',
          label: 'Fact Metrics',
          type: 'database',
          iconName: 'Box',
          description: 'Computed KPIs and metrics.',
          details: ['Metric ID', 'Value', 'Unit', 'Period'],
          x: 75,
          y: 65
        }
      ],
      connections: [
        { from: 'files', to: 'extractor', label: 'Upload' },
        { from: 'extractor', to: 'fact_financials', label: 'Extracted Data' },
        { from: 'extractor', to: 'fact_metrics', label: 'Computed KPIs' }
      ]
    },
    legal: {
      id: "legal",
      label: "Legal Analysis",
      description: "Investor document analysis pipeline",
      nodes: [
        {
          id: 'legal_docs',
          label: 'Legal Docs',
          type: 'external',
          iconName: 'FileText',
          description: 'Investment agreements.',
          details: ['Term Sheets', 'SPAs', 'SHAs', 'SAFEs'],
          x: 15,
          y: 50
        },
        {
          id: 'phase1',
          label: 'Phase 1',
          type: 'ai',
          iconName: 'Zap',
          description: 'Individual Extraction',
          details: ['Parallel processing', 'Term extraction'],
          x: 35,
          y: 50
        },
        {
          id: 'phase2',
          label: 'Phase 2',
          type: 'ai',
          iconName: 'Layers',
          description: 'Category Analysis',
          details: ['Economics', 'Control', 'Governance'],
          x: 55,
          y: 50
        },
        {
          id: 'phase3',
          label: 'Phase 3',
          type: 'ai',
          iconName: 'Brain',
          description: 'Deal Synthesis',
          details: ['Cross-document checks', 'Risk flagging'],
          x: 75,
          y: 50
        },
        {
          id: 'db',
          label: 'Legal DB',
          type: 'database',
          iconName: 'ShieldCheck',
          description: 'Structured analysis storage.',
          details: ['legal_analyses', 'legal_term_sources', 'Audit Snippets'],
          x: 95,
          y: 50
        }
      ],
      connections: [
        { from: 'legal_docs', to: 'phase1', label: 'Upload' },
        { from: 'phase1', to: 'phase2', label: 'Extracted Terms' },
        { from: 'phase2', to: 'phase3', label: 'Categorized Data' },
        { from: 'phase3', to: 'db', label: 'Final Analysis' }
      ]
    }
  }
};
