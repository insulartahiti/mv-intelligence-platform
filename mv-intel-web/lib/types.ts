// Core entity and graph types for the Enhanced Knowledge Graph Intelligence System

export interface Entity {
  id: string;
  name: string;
  type: string;
  domain?: string;
  industry?: string;
  pipeline_stage?: string;
  fund?: string;
  taxonomy?: string;
  is_internal?: boolean;
  is_portfolio?: boolean;
  is_pipeline?: boolean;
  importance?: number;
  linkedin_url?: string;
  enrichment_data?: any;
  computed_expertise?: string[];
  computed_skills?: string[];
  computed_company?: string;
  embedding?: number[];
  embedding_3072?: number[];
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  kind: string;
  strength_score?: number;
  weight?: number;
}

export interface GraphData {
  entities: Entity[];
  edges: Edge[];
}

export interface SearchResult {
  id: string;
  name: string;
  type: string;
  similarity?: number;
  semantic_score?: number;
  graph_centrality?: number;
  final_score?: number;
  pagerank?: number;
  centrality?: number;
  intro_paths?: any[];
  metadata?: {
    domain?: string;
    industry?: string;
    pipeline_stage?: string;
    is_internal?: boolean;
    is_portfolio?: boolean;
    is_pipeline?: boolean;
    linkedin_first_degree?: boolean;
  };
}

export interface ClusterData {
  id: string;
  label: string;
  color: string;
  entities: Entity[];
}

export interface LayoutConfig {
  type: 'forceatlas2' | 'circular' | 'fruchterman' | 'noverlap';
  iterations: number;
  settings: Record<string, any>;
}

export interface CentralityMetrics {
  entityId: string;
  degree: number;
  betweenness: number;
  influence: number;
}

export interface Path {
  path: string[];
  edges: Array<{
    from: string;
    to: string;
    strength: number;
  }>;
  score: number;
  avgStrength: number;
  length: number;
}

export interface QueryIntent {
  type: 'ENTITY_SEARCH' | 'RELATIONSHIP_DISCOVERY' | 'INTRO_PATH' | 'COMPETITIVE_ANALYSIS' | 'MARKET_INTELLIGENCE' | 'DUE_DILIGENCE' | 'SIMILARITY_SEARCH';
  confidence: number;
  extractedEntities?: string[];
  targetEntity?: string;
  companies?: string[];
  filters?: Record<string, any>;
}

export interface EnrichmentData {
  perplexity?: {
    bio?: string;
    key_achievements?: string[];
    expertise_areas?: string[];
    recent_news?: any;
    company_overview?: string;
    competitive_landscape?: any;
  };
  linkedin?: {
    current_title?: string;
    current_company?: string;
    location?: string;
    connections_count?: number;
    mutual_connections?: string[];
    skills?: string[];
    endorsements?: any;
  };
  web_research?: {
    company_info?: any;
    market_data?: any;
    news_mentions?: any;
    social_media?: any;
  };
}
