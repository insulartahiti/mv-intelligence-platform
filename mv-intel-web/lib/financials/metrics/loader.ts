import fs from 'fs';
import path from 'path';
import { MetricsDictionary, MetricDefinition } from './types';

const METRICS_FILE_PATH = path.join(process.cwd(), 'lib/financials/metrics/common_metrics.json');

export function loadCommonMetrics(): MetricDefinition[] {
  try {
    const fileContent = fs.readFileSync(METRICS_FILE_PATH, 'utf-8');
    const dictionary: MetricsDictionary = JSON.parse(fileContent);
    return dictionary.metrics;
  } catch (error) {
    console.error('Failed to load common metrics:', error);
    throw new Error('Could not load common metrics dictionary.');
  }
}

export function getMetricById(id: string): MetricDefinition | undefined {
  const metrics = loadCommonMetrics();
  return metrics.find((m) => m.id === id);
}

export function getMetricsByBusinessModel(model: string): MetricDefinition[] {
  const metrics = loadCommonMetrics();
  // @ts-ignore - simplistic check
  return metrics.filter((m) => m.business_models.includes(model));
}


