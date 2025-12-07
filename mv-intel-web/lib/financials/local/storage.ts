/**
 * Local Development Storage
 * 
 * File-based storage for extraction results, facts, and metrics.
 * Enables fast iteration without hitting Supabase or OpenAI APIs.
 * 
 * Storage structure:
 * .local-data/
 *   extractions/
 *     {company}/{filename}_{timestamp}.json  - Raw extraction results
 *   facts/
 *     {company}/{period}.json                - Fact financials by period
 *   metrics/
 *     {company}/{period}.json                - Computed metrics by period
 *   cache/
 *     {file_hash}.json                       - Cached API responses
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

// Determine storage directory
// If running on Vercel (SERVERLESS), use /tmp as fallback (ephemeral)
// If running locally, use .local-data for persistence
const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
const LOCAL_DATA_DIR = isServerless 
  ? path.join(os.tmpdir(), 'mv-intel-local-data')
  : path.join(process.cwd(), '.local-data');

if (isServerless) {
  console.log(`[Local Mode] Running in serverless environment. Using ephemeral storage: ${LOCAL_DATA_DIR}`);
}

// Ensure directory exists
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
    } catch (error) {
      console.error(`[Local Mode] Failed to create directory ${dirPath}:`, error);
      // Attempt to use /tmp if not already
      if (!dirPath.startsWith(os.tmpdir())) {
         // Last resort fallback
         const tmpPath = path.join(os.tmpdir(), 'mv-intel-fallback');
         if (!fs.existsSync(tmpPath)) fs.mkdirSync(tmpPath, { recursive: true });
      }
    }
  }
}

// Generate hash for file content (for caching)
export function hashFileContent(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
}

// ============================================================================
// Extraction Results Storage
// ============================================================================

export interface LocalExtractionResult {
  filename: string;
  companySlug: string;
  extractedAt: string;
  fileHash: string;
  result: any; // UnifiedExtractionResult
  lineItems: any[];
  computedMetrics: any[];
}

export function saveExtractionResult(
  companySlug: string,
  filename: string,
  fileHash: string,
  result: any,
  lineItems: any[],
  computedMetrics: any[]
): string {
  const dir = path.join(LOCAL_DATA_DIR, 'extractions', companySlug);
  ensureDir(dir);
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filePath = path.join(dir, `${safeName}_${timestamp}.json`);
  
  const data: LocalExtractionResult = {
    filename,
    companySlug,
    extractedAt: new Date().toISOString(),
    fileHash,
    result,
    lineItems,
    computedMetrics
  };
  
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`[Local] Saved extraction: ${filePath}`);
  
  return filePath;
}

export function loadLatestExtraction(companySlug: string, filename: string): LocalExtractionResult | null {
  const dir = path.join(LOCAL_DATA_DIR, 'extractions', companySlug);
  if (!fs.existsSync(dir)) return null;
  
  const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith(safeName) && f.endsWith('.json'))
    .sort()
    .reverse();
  
  if (files.length === 0) return null;
  
  const filePath = path.join(dir, files[0]);
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

export function listExtractions(companySlug?: string): { company: string; filename: string; extractedAt: string; path: string }[] {
  const baseDir = path.join(LOCAL_DATA_DIR, 'extractions');
  if (!fs.existsSync(baseDir)) return [];
  
  const results: { company: string; filename: string; extractedAt: string; path: string }[] = [];
  
  const companies = companySlug ? [companySlug] : fs.readdirSync(baseDir);
  
  for (const company of companies) {
    const companyDir = path.join(baseDir, company);
    if (!fs.existsSync(companyDir) || !fs.statSync(companyDir).isDirectory()) continue;
    
    const files = fs.readdirSync(companyDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const filePath = path.join(companyDir, file);
        const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        results.push({
          company,
          filename: content.filename,
          extractedAt: content.extractedAt,
          path: filePath
        });
      } catch {
        // Skip invalid files
      }
    }
  }
  
  return results.sort((a, b) => b.extractedAt.localeCompare(a.extractedAt));
}

// ============================================================================
// Facts Storage (by period)
// ============================================================================

export interface LocalFactRecord {
  line_item_id: string;
  amount: number;
  scenario: string;
  date: string;
  source_file: string;
  source_location: any;
  extractedAt: string;
  // Reconciliation fields
  priority?: number;
  explanation?: string;           // Contextual explanation from source doc
  snippet_url?: string;           // Link to visual source
  changelog?: ChangeLogEntry[];   // History of changes to this fact
}

export interface ChangeLogEntry {
  timestamp: string;
  oldValue: number | null;
  newValue: number;
  reason: string;
  source_file: string;
  explanation?: string;
  view_source_url?: string;
}

export function saveFacts(companySlug: string, period: string, facts: LocalFactRecord[]): void {
  const dir = path.join(LOCAL_DATA_DIR, 'facts', companySlug);
  ensureDir(dir);
  
  const filePath = path.join(dir, `${period}.json`);
  
  // Load existing facts and merge (dedupe by line_item_id + scenario)
  let existing: LocalFactRecord[] = [];
  if (fs.existsSync(filePath)) {
    existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  
  // Merge: new facts override existing with same key
  const factMap = new Map<string, LocalFactRecord>();
  for (const fact of existing) {
    factMap.set(`${fact.line_item_id}:${fact.scenario}`, fact);
  }
  for (const fact of facts) {
    factMap.set(`${fact.line_item_id}:${fact.scenario}`, fact);
  }
  
  const merged = Array.from(factMap.values());
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2));
  console.log(`[Local] Saved ${merged.length} facts for ${companySlug}/${period}`);
}

export function loadFacts(companySlug: string, period: string): LocalFactRecord[] {
  const filePath = path.join(LOCAL_DATA_DIR, 'facts', companySlug, `${period}.json`);
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function listFactPeriods(companySlug: string): string[] {
  const dir = path.join(LOCAL_DATA_DIR, 'facts', companySlug);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''))
    .sort();
}

// ============================================================================
// Metrics Storage (by period)
// ============================================================================

export interface LocalMetricRecord {
  metric_id: string;
  value: number;
  unit: string;
  period: string;
  inputs: Record<string, number>;
  calculatedAt: string;
}

export function saveMetrics(companySlug: string, period: string, metrics: LocalMetricRecord[]): void {
  const dir = path.join(LOCAL_DATA_DIR, 'metrics', companySlug);
  ensureDir(dir);
  
  const filePath = path.join(dir, `${period}.json`);
  fs.writeFileSync(filePath, JSON.stringify(metrics, null, 2));
  console.log(`[Local] Saved ${metrics.length} metrics for ${companySlug}/${period}`);
}

export function loadMetrics(companySlug: string, period: string): LocalMetricRecord[] {
  const filePath = path.join(LOCAL_DATA_DIR, 'metrics', companySlug, `${period}.json`);
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// ============================================================================
// API Response Cache (to avoid repeated OpenAI calls)
// ============================================================================

export interface CachedResponse {
  fileHash: string;
  filename: string;
  cachedAt: string;
  response: any;
}

export function getCachedExtraction(fileHash: string): CachedResponse | null {
  const filePath = path.join(LOCAL_DATA_DIR, 'cache', `${fileHash}.json`);
  if (!fs.existsSync(filePath)) return null;
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function setCachedExtraction(fileHash: string, filename: string, response: any): void {
  const dir = path.join(LOCAL_DATA_DIR, 'cache');
  ensureDir(dir);
  
  const filePath = path.join(dir, `${fileHash}.json`);
  const data: CachedResponse = {
    fileHash,
    filename,
    cachedAt: new Date().toISOString(),
    response
  };
  
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`[Local] Cached extraction for ${filename} (hash: ${fileHash})`);
}

// ============================================================================
// Comparison / Diff Utilities
// ============================================================================

export interface ExtractionDiff {
  added: { metric: string; value: number }[];
  removed: { metric: string; value: number }[];
  changed: { metric: string; oldValue: number; newValue: number; delta: number }[];
}

export function compareExtractions(
  oldResult: LocalExtractionResult,
  newResult: LocalExtractionResult
): ExtractionDiff {
  const oldMetrics = new Map<string, number>();
  const newMetrics = new Map<string, number>();
  
  for (const item of oldResult.lineItems) {
    if (item.scenario === 'actual' || !item.scenario) {
      oldMetrics.set(item.line_item_id, item.amount);
    }
  }
  
  for (const item of newResult.lineItems) {
    if (item.scenario === 'actual' || !item.scenario) {
      newMetrics.set(item.line_item_id, item.amount);
    }
  }
  
  const diff: ExtractionDiff = { added: [], removed: [], changed: [] };
  
  // Find added and changed
  for (const [metric, newValue] of newMetrics) {
    if (!oldMetrics.has(metric)) {
      diff.added.push({ metric, value: newValue });
    } else {
      const oldValue = oldMetrics.get(metric)!;
      if (oldValue !== newValue) {
        diff.changed.push({
          metric,
          oldValue,
          newValue,
          delta: newValue - oldValue
        });
      }
    }
  }
  
  // Find removed
  for (const [metric, oldValue] of oldMetrics) {
    if (!newMetrics.has(metric)) {
      diff.removed.push({ metric, value: oldValue });
    }
  }
  
  return diff;
}

// ============================================================================
// Cleanup Utilities
// ============================================================================

export function clearLocalData(): void {
  if (fs.existsSync(LOCAL_DATA_DIR)) {
    fs.rmSync(LOCAL_DATA_DIR, { recursive: true });
    console.log(`[Local] Cleared all local data`);
  }
}

export function clearCache(): void {
  const cacheDir = path.join(LOCAL_DATA_DIR, 'cache');
  if (fs.existsSync(cacheDir)) {
    fs.rmSync(cacheDir, { recursive: true });
    console.log(`[Local] Cleared cache`);
  }
}

// ============================================================================
// Snippet Storage
// ============================================================================

export function saveSnippet(companySlug: string, filename: string, buffer: Buffer): string {
  const dir = path.join(LOCAL_DATA_DIR, 'snippets', companySlug);
  ensureDir(dir);
  
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buffer);
  console.log(`[Local] Saved snippet: ${filePath}`);
  
  // Return relative path for API
  return `/api/local-snippet?company=${encodeURIComponent(companySlug)}&file=${encodeURIComponent(filename)}`;
}

export function getSnippetPath(companySlug: string, filename: string): string | null {
  const filePath = path.join(LOCAL_DATA_DIR, 'snippets', companySlug, filename);
  if (fs.existsSync(filePath)) return filePath;
  return null;
}

// ============================================================================
// Status / Summary
// ============================================================================

export function getLocalDataSummary(): {
  extractions: number;
  facts: number;
  metrics: number;
  cacheEntries: number;
  companies: string[];
} {
  const summary = {
    extractions: 0,
    facts: 0,
    metrics: 0,
    cacheEntries: 0,
    companies: [] as string[]
  };
  
  const extractionsDir = path.join(LOCAL_DATA_DIR, 'extractions');
  const factsDir = path.join(LOCAL_DATA_DIR, 'facts');
  const metricsDir = path.join(LOCAL_DATA_DIR, 'metrics');
  const cacheDir = path.join(LOCAL_DATA_DIR, 'cache');
  
  if (fs.existsSync(extractionsDir)) {
    const companies = fs.readdirSync(extractionsDir);
    summary.companies = companies;
    for (const company of companies) {
      const companyDir = path.join(extractionsDir, company);
      if (fs.statSync(companyDir).isDirectory()) {
        summary.extractions += fs.readdirSync(companyDir).filter(f => f.endsWith('.json')).length;
      }
    }
  }
  
  if (fs.existsSync(factsDir)) {
    for (const company of fs.readdirSync(factsDir)) {
      const companyDir = path.join(factsDir, company);
      if (fs.statSync(companyDir).isDirectory()) {
        summary.facts += fs.readdirSync(companyDir).filter(f => f.endsWith('.json')).length;
      }
    }
  }
  
  if (fs.existsSync(metricsDir)) {
    for (const company of fs.readdirSync(metricsDir)) {
      const companyDir = path.join(metricsDir, company);
      if (fs.statSync(companyDir).isDirectory()) {
        summary.metrics += fs.readdirSync(companyDir).filter(f => f.endsWith('.json')).length;
      }
    }
  }
  
  if (fs.existsSync(cacheDir)) {
    summary.cacheEntries = fs.readdirSync(cacheDir).filter(f => f.endsWith('.json')).length;
  }
  
  return summary;
}

