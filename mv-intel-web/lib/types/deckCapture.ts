// ============================================================================
// DECK CAPTURE PIPELINE TYPES
// ============================================================================
// TypeScript types matching the database schema

export type SourcePlatform = 'figma' | 'google_slides' | 'powerpoint' | 'notion' | 'miro';
export type DeckStatus = 'captured' | 'processing' | 'processed' | 'failed';
export type SlideType = 'title' | 'content' | 'image' | 'chart' | 'table' | 'mixed';
export type AnalysisType = 'text_extraction' | 'chart_analysis' | 'table_data' | 'image_description';
export type InsightType = 'company_mention' | 'financial_data' | 'market_trend' | 'competitive_analysis';

// ============================================================================
// CORE ENTITIES
// ============================================================================

export interface Deck {
  id: string;
  title: string;
  description?: string;
  source_url?: string;
  source_platform: SourcePlatform;
  affinity_deal_id?: string;
  affinity_org_id?: string;
  total_slides: number;
  capture_date: string;
  processed_at?: string;
  status: DeckStatus;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Slide {
  id: string;
  deck_id: string;
  slide_number: number;
  title?: string;
  content_text?: string;
  content_summary?: string;
  slide_type?: SlideType;
  visual_elements: any[];
  layout_analysis: Record<string, any>;
  confidence_score: number;
  affinity_file_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ContentAnalysis {
  id: string;
  slide_id: string;
  analysis_type: AnalysisType;
  content_data: Record<string, any>;
  extracted_entities: string[];
  sentiment_score?: number;
  topics: string[];
  keywords: string[];
  confidence_score: number;
  processing_time_ms?: number;
  created_at: string;
}

export interface IntelligenceInsight {
  id: string;
  deck_id?: string;
  slide_id?: string;
  insight_type: InsightType;
  insight_data: Record<string, any>;
  relevance_score: number;
  source_slide?: number;
  extracted_at: string;
  verified: boolean;
  tags: string[];
  created_at: string;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface CaptureDeckRequest {
  title: string;
  description?: string;
  source_url: string;
  source_platform: SourcePlatform;
  affinity_deal_id?: string;
  slides: CaptureSlideRequest[];
}

export interface CaptureSlideRequest {
  slide_number: number;
  html_content: string; // HTML content from the page
  screenshot_data?: string; // Optional base64 screenshot for visual context
  title?: string;
  metadata?: Record<string, any>;
  url: string; // Source URL of the slide
  user_org_id?: string; // User's organization ID for routing
}

export interface ProcessDeckRequest {
  deck_id: string;
  force_reprocess?: boolean;
}

export interface DeckUploadResponse {
  deck_id: string;
  status: 'uploaded' | 'processing' | 'error';
  message?: string;
  affinity_files?: string[]; // Affinity file IDs
}

// ============================================================================
// ANALYSIS RESULT TYPES
// ============================================================================

export interface TextExtractionResult {
  text: string;
  confidence: number;
  word_count: number;
  sentence_count: number;
  paragraphs: string[];
}

export interface ChartAnalysisResult {
  chart_type: 'bar' | 'line' | 'pie' | 'scatter' | 'unknown';
  data_points: Array<{
    label: string;
    value: number;
    unit?: string;
  }>;
  trends: string[];
  insights: string[];
}

export interface TableDataResult {
  headers: string[];
  rows: string[][];
  summary: Record<string, any>;
}

export interface ImageDescriptionResult {
  description: string;
  objects_detected: string[];
  text_overlay?: string;
  confidence: number;
}

// OpenAI Vision Analysis Results
export interface OpenAIVisionAnalysis {
  slide_number: number;
  text_content: string;
  visual_elements: {
    charts: ChartAnalysisResult[];
    tables: TableDataResult[];
    images: ImageDescriptionResult[];
    diagrams: any[];
  };
  layout_structure: {
    sections: string[];
    hierarchy: Record<string, any>;
    positioning: Record<string, any>;
  };
  extracted_insights: {
    companies: string[];
    financial_data: FinancialDataInsight[];
    market_trends: MarketTrendInsight[];
    key_metrics: string[];
    action_items: string[];
  };
  confidence_score: number;
  processing_time_ms: number;
}

// ============================================================================
// INTELLIGENCE INSIGHT TYPES
// ============================================================================

export interface CompanyMentionInsight {
  company_name: string;
  context: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  mentioned_in: string[];
}

export interface FinancialDataInsight {
  metric: string;
  value: number;
  unit: string;
  period?: string;
  trend?: 'increasing' | 'decreasing' | 'stable';
}

export interface MarketTrendInsight {
  trend: string;
  market_size?: string;
  growth_rate?: string;
  timeframe?: string;
  confidence: number;
}

export interface CompetitiveAnalysisInsight {
  competitor: string;
  strengths: string[];
  weaknesses: string[];
  market_position: string;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface DeckStats {
  total_slides: number;
  processed_slides: number;
  avg_confidence: number;
  insight_count: number;
}

export interface ProcessingProgress {
  deck_id: string;
  current_slide: number;
  total_slides: number;
  status: 'processing' | 'completed' | 'failed';
  progress_percentage: number;
  current_operation: string;
}

export interface SearchFilters {
  source_platform?: SourcePlatform;
  date_range?: {
    start: string;
    end: string;
  };
  insight_types?: InsightType[];
  confidence_threshold?: number;
  tags?: string[];
}

// ============================================================================
// AFFINITY INTEGRATION TYPES
// ============================================================================

export interface AffinityFileUpload {
  file_name: string;
  file_data: string; // Base64 encoded
  mime_type: string;
  deal_id?: string;
  organization_id: string;
  tags?: string[];
}

export interface AffinityFileResponse {
  file_id: string;
  url: string;
  status: 'uploaded' | 'processing' | 'ready';
}

// HTML to PDF Conversion
export interface HTMLToPDFRequest {
  html_content: string;
  slide_number: number;
  title?: string;
  metadata?: Record<string, any>;
}

export interface HTMLToPDFResponse {
  pdf_data: string; // Base64 encoded PDF
  file_size: number;
  page_count: number;
  conversion_time_ms: number;
  success: boolean;
  error?: string;
}

// Organization Management (Target Companies) - Based on Affinity API
export interface AffinityOrganization {
  id: string;
  name: string;
  domain?: string;
  website?: string;
  industry?: string;
  company_type?: 'startup' | 'scaleup' | 'enterprise' | 'public' | 'private';
  created_at: string;
  status: 'active' | 'inactive';
  
  // Affinity-specific fields
  affinity_id?: string;
  list_ids?: string[];
  person_ids?: string[];
  deal_ids?: string[];
  
  // Company metadata
  metadata?: {
    employees?: string;
    funding_stage?: string;
    revenue_range?: string;
    location?: string;
    description?: string;
    tags?: string[];
  };
}

export interface CreateOrganizationRequest {
  name: string; // Required by Affinity
  domain?: string;
  website?: string;
  industry?: string;
  company_type?: 'startup' | 'scaleup' | 'enterprise' | 'public' | 'private';
  
  // Affinity-specific fields
  list_ids?: string[]; // Lists to add company to
  person_ids?: string[]; // Associated people
  deal_ids?: string[]; // Associated deals
  tags?: string[]; // Tags for categorization
  description?: string; // Company description
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export interface ProcessingError {
  code: string;
  message: string;
  details?: Record<string, any>;
  slide_number?: number;
  recoverable: boolean;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}
