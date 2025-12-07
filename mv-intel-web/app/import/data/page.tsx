'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Database, Calendar, TrendingUp, TrendingDown, DollarSign, FileSpreadsheet, ChevronRight } from 'lucide-react';

interface Fact {
  line_item_id: string;
  amount: number;
  scenario: 'actual' | 'budget';
  source_location?: {
    sheet?: string;
    cell?: string;
    context?: string;
  };
}

interface PeriodData {
  file: string;
  period: string;
  facts?: Fact[];
  [key: string]: any;
}

function DataContent() {
  const searchParams = useSearchParams();
  const company = searchParams.get('company') || 'nelly';
  const [data, setData] = useState<PeriodData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/local-data?company=${company}&type=facts`)
      .then(res => res.json())
      .then(result => {
        if (result.error) throw new Error(result.error);
        setData(result.data || []);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [company]);

  // Build time series view
  const metrics = new Map<string, Map<string, { actual?: number; budget?: number; source?: any }>>();
  
  for (const period of data) {
    const facts = period.facts || [];
    for (const fact of facts) {
      if (!metrics.has(fact.line_item_id)) {
        metrics.set(fact.line_item_id, new Map());
      }
      const metricMap = metrics.get(fact.line_item_id)!;
      if (!metricMap.has(period.period)) {
        metricMap.set(period.period, {});
      }
      const cell = metricMap.get(period.period)!;
      if (fact.scenario === 'actual') {
        cell.actual = fact.amount;
      } else {
        cell.budget = fact.amount;
      }
      cell.source = fact.source_location;
    }
  }

  const periods = [...new Set(data.map(d => d.period))].sort();
  const metricIds = [...metrics.keys()].sort();

  const formatValue = (val: number | undefined) => {
    if (val === undefined) return '-';
    if (Math.abs(val) >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (Math.abs(val) >= 1000) return `${(val / 1000).toFixed(0)}K`;
    if (val < 1 && val > 0) return `${(val * 100).toFixed(1)}%`;
    return val.toLocaleString();
  };

  const formatPeriod = (p: string) => {
    // Parse as UTC to avoid timezone shift (e.g., 2024-09-01 becoming Aug 31 in local time)
    const date = new Date(p + 'T12:00:00Z'); // Add noon UTC to avoid date boundary issues
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 text-white p-8">
      <div className="max-w-[95vw] mx-auto">
        <Link href="/import" className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 w-fit transition-colors">
          <ArrowLeft size={16} /> Back to Import
        </Link>
        
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-xl border border-green-500/30">
              <Database className="text-green-400" size={28} />
            </div>
            <div>
              <div className="text-white">Local Extraction Data</div>
              <div className="text-lg text-green-400 font-normal">{company}</div>
            </div>
          </h1>
          
          <div className="flex items-center gap-4 text-sm">
            <div className="bg-white/5 rounded-lg px-4 py-2 border border-white/10">
              <span className="text-gray-400">Periods:</span>{' '}
              <span className="text-white font-medium">{periods.length}</span>
            </div>
            <div className="bg-white/5 rounded-lg px-4 py-2 border border-white/10">
              <span className="text-gray-400">Metrics:</span>{' '}
              <span className="text-white font-medium">{metricIds.length}</span>
            </div>
            <Link 
              href={`/import/guide?company=${company}`}
              className="bg-blue-500/20 hover:bg-blue-500/30 rounded-lg px-4 py-2 border border-blue-500/30 text-blue-300 transition-colors"
            >
              View Guide →
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-500">
            <div className="animate-pulse flex items-center gap-3">
              <div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin"></div>
              Loading extraction data...
            </div>
          </div>
        ) : error ? (
          <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
            <div className="font-semibold mb-2">Error Loading Data</div>
            <div className="text-sm">{error}</div>
          </div>
        ) : data.length === 0 ? (
          <div className="p-6 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-400">
            No extraction data found for {company}. Run an extraction first.
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <div className="text-gray-400 text-xs mb-1">Date Range</div>
                <div className="text-white font-medium">
                  {formatPeriod(periods[0])} → {formatPeriod(periods[periods.length - 1])}
                </div>
              </div>
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <div className="text-gray-400 text-xs mb-1">Total Data Points</div>
                <div className="text-white font-medium">
                  {data.reduce((sum, d) => sum + (d.facts?.length || 0), 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-green-500/10 rounded-xl p-4 border border-green-500/20">
                <div className="text-green-400 text-xs mb-1">Actuals</div>
                <div className="text-white font-medium">
                  {data.reduce((sum, d) => sum + (d.facts?.filter((f: Fact) => f.scenario === 'actual').length || 0), 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-blue-500/10 rounded-xl p-4 border border-blue-500/20">
                <div className="text-blue-400 text-xs mb-1">Budget/Forecast</div>
                <div className="text-white font-medium">
                  {data.reduce((sum, d) => sum + (d.facts?.filter((f: Fact) => f.scenario === 'budget').length || 0), 0).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Time Series Table */}
            <div className="bg-white/5 backdrop-blur rounded-xl border border-white/10 overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 bg-white/5 flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-blue-400" />
                <h2 className="font-semibold text-white">Time Series Data</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-black/30 sticky top-0">
                    <tr className="border-b border-white/10">
                      <th className="text-left px-4 py-3 text-gray-400 font-medium sticky left-0 bg-gray-900 z-10 min-w-[180px]">
                        Metric
                      </th>
                      {periods.map(period => (
                        <th key={period} className="text-center px-3 py-3 text-gray-400 font-medium whitespace-nowrap min-w-[100px]">
                          <div>{formatPeriod(period)}</div>
                          <div className="text-[10px] text-gray-600">{period}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {metricIds.map(metricId => {
                      const metricData = metrics.get(metricId)!;
                      return (
                        <tr key={metricId} className="hover:bg-white/5 transition-colors">
                          <td className="px-4 py-2 font-mono text-blue-300 sticky left-0 bg-gray-900 z-10 border-r border-white/10">
                            {metricId.replace(/_/g, ' ')}
                          </td>
                          {periods.map(period => {
                            const cell = metricData.get(period);
                            const hasActual = cell?.actual !== undefined;
                            const hasBudget = cell?.budget !== undefined;
                            
                            return (
                              <td key={period} className="px-3 py-2 text-center">
                                {hasActual && (
                                  <div className="text-green-400 font-mono text-xs">
                                    {formatValue(cell?.actual)}
                                  </div>
                                )}
                                {hasBudget && (
                                  <div className="text-blue-400 font-mono text-xs">
                                    {formatValue(cell?.budget)}
                                    <span className="text-[10px] text-gray-500 ml-1">B</span>
                                  </div>
                                )}
                                {!hasActual && !hasBudget && (
                                  <span className="text-gray-600">-</span>
                                )}
                                {cell?.source?.cell && (
                                  <div className="text-[9px] text-gray-600 mt-0.5">
                                    {cell.source.sheet}!{cell.source.cell}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Period Details */}
            <details className="bg-white/5 backdrop-blur rounded-xl border border-white/10 overflow-hidden group">
              <summary className="px-6 py-4 cursor-pointer bg-white/5 flex items-center gap-2 hover:bg-white/10 transition-colors">
                <ChevronRight size={18} className="text-gray-400 group-open:rotate-90 transition-transform" />
                <span className="font-semibold text-gray-300">Raw Period Data</span>
              </summary>
              <div className="p-6 border-t border-white/10 max-h-96 overflow-y-auto">
                <pre className="font-mono text-xs text-gray-400 leading-relaxed">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LocalDataViewer() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    }>
      <DataContent />
    </Suspense>
  );
}

