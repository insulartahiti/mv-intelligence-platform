'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
  TrendingUp, 
  DollarSign, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight,
  Loader2,
  Table as TableIcon
} from 'lucide-react';

interface Metric {
  id: string;
  metric_id: string;
  value: number;
  period: string; // YYYY-MM-DD
  unit?: string;
  snippet_url?: string;
}

interface FinancialsDashboardProps {
  companyId: string;
}

export function FinancialsDashboard({ companyId }: FinancialsDashboardProps) {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch(`/api/portfolio/metrics?companyId=${companyId}`);
        const data = await res.json();
        if (data.metrics) {
          setMetrics(data.metrics);
        }
      } catch (err) {
        console.error('Error fetching metrics:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchMetrics();
  }, [companyId]);

  // Group metrics by Period and ID
  const { periods, groupedMetrics, keyMetrics } = useMemo(() => {
    const dates = Array.from(new Set(metrics.map(m => m.period))).sort();
    const grouped: Record<string, Record<string, Metric>> = {};
    const latestValues: Record<string, Metric> = {};

    metrics.forEach(m => {
      if (!grouped[m.period]) grouped[m.period] = {};
      grouped[m.period][m.metric_id] = m;
      
      // Track latest (assuming sorted by period from API)
      latestValues[m.metric_id] = m;
    });

    return { 
      periods: dates, 
      groupedMetrics: grouped,
      keyMetrics: latestValues
    };
  }, [metrics]);

  const formatValue = (val: number, unit?: string) => {
    if (unit === 'percentage' || (val > -1 && val < 1 && val !== 0)) {
      return `${(val * 100).toFixed(1)}%`;
    }
    if (val > 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (val > 1000) return `$${(val / 1000).toFixed(0)}k`;
    return val.toLocaleString();
  };

  const getTrend = (metricId: string) => {
    if (periods.length < 2) return null;
    const current = groupedMetrics[periods[periods.length - 1]]?.[metricId];
    const prev = groupedMetrics[periods[periods.length - 2]]?.[metricId];
    
    if (!current || !prev || prev.value === 0) return null;
    
    const change = ((current.value - prev.value) / Math.abs(prev.value)) * 100;
    return change;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 text-white/50">
        <Loader2 className="animate-spin mr-2" /> Loading financials...
      </div>
    );
  }

  if (metrics.length === 0) {
    return (
      <div className="bg-white/5 rounded-xl p-12 text-center border border-white/10">
        <TrendingUp size={48} className="mx-auto text-white/20 mb-4" />
        <h3 className="text-xl font-medium text-white">No Financial Data</h3>
        <p className="text-white/50 mt-2">Upload financial documents to see metrics.</p>
        <Link href="/portfolio/financials" className="inline-block mt-6 text-emerald-400 hover:underline">
          Go to Import Tool →
        </Link>
      </div>
    );
  }

  // Key KPIs to display at top
  const kpis = [
    { id: 'arr', label: 'ARR' },
    { id: 'revenue', label: 'Revenue' },
    { id: 'burn_rate', label: 'Burn Rate' }, // Assuming extracted as 'burn_rate'
    { id: 'cash_balance', label: 'Cash' }
  ];

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map(kpi => {
          const metric = keyMetrics[kpi.id];
          const trend = getTrend(kpi.id);
          
          return (
            <div key={kpi.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="text-white/50 text-xs uppercase tracking-wider mb-1">{kpi.label}</div>
              <div className="text-2xl font-mono text-white font-medium">
                {metric ? formatValue(metric.value, metric.unit) : '-'}
              </div>
              {trend !== null && (
                <div className={`text-xs mt-2 flex items-center ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {trend >= 0 ? <ArrowUpRight size={12} className="mr-1" /> : <ArrowDownRight size={12} className="mr-1" />}
                  {Math.abs(trend).toFixed(1)}% vs prev
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Time Series Table */}
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-white/10 bg-white/5">
          <h3 className="font-medium text-white flex items-center gap-2">
            <Calendar size={16} className="text-blue-400" />
            Historical Performance
          </h3>
          <Link href={`/portfolio/financials?companyId=${companyId}`} className="text-xs text-emerald-400 hover:underline flex items-center gap-1">
             <TableIcon size={12} /> Detailed Ledger
          </Link>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-white/50 uppercase bg-black/20">
              <tr>
                <th className="px-4 py-3 sticky left-0 bg-[#1e1e1e] z-10">Metric</th>
                {periods.slice(-12).reverse().map(date => (
                  <th key={date} className="px-4 py-3 whitespace-nowrap">
                    {new Date(date).toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {Object.keys(keyMetrics).sort().map(metricId => (
                <tr key={metricId} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 font-medium text-white sticky left-0 bg-[#1e1e1e] border-r border-white/10">
                    {metricId.replace(/_/g, ' ').toUpperCase()}
                  </td>
                  {periods.slice(-12).reverse().map(date => {
                    const m = groupedMetrics[date]?.[metricId];
                    return (
                      <td key={date} className="px-4 py-3 text-white/80 font-mono whitespace-nowrap">
                        {m ? formatValue(m.value, m.unit) : '-'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

