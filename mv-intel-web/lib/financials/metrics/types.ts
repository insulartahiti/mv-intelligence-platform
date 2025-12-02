export type BusinessModel = 'saas' | 'marketplace' | 'aum' | 'transactions' | 'consumer';

export interface BenchmarkBands {
  poor: string;
  good: string;
  great: string;
}

export interface MetricDefinition {
  id: string;
  name: string;
  business_models: BusinessModel[];
  category: string;
  description: string;
  formula: string;
  inputs: string[];
  unit: 'percentage' | 'multiple' | 'months' | 'currency' | 'count';
  display_format: string;
  benchmark_bands: BenchmarkBands;
  notes?: string;
}

export interface MetricsDictionary {
  metrics: MetricDefinition[];
}


