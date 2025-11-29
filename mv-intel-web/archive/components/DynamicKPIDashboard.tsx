'use client';
import { useState, useEffect, useMemo } from 'react';
import { Card, Button, MetricTile } from './ui/GlassComponents';

interface KPIData {
  id: string;
  name: string;
  value: number | string;
  unit: string;
  period: string;
  trend: 'up' | 'down' | 'neutral';
  change: number;
  changePercent: number;
  category: 'financial' | 'operational' | 'growth' | 'risk' | 'custom';
  priority: 'high' | 'medium' | 'low';
  lastUpdated: string;
  source: string;
}

interface QualitativeInsight {
  id: string;
  type: 'summary' | 'trend' | 'alert' | 'opportunity' | 'risk';
  title: string;
  content: string;
  confidence: number;
  source: string;
  actionable: boolean;
  priority: 'high' | 'medium' | 'low';
}

interface DynamicKPIDashboardProps {
  companyId: string;
  onKPIUpdate?: (kpiId: string) => void;
}

export default function DynamicKPIDashboard({ 
  companyId, 
  onKPIUpdate 
}: DynamicKPIDashboardProps) {
  const [kpis, setKpis] = useState<KPIData[]>([]);
  const [insights, setInsights] = useState<QualitativeInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadKPIs();
    loadInsights();
  }, [companyId]);

  const loadKPIs = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/companies/${companyId}/kpis`);
      const result = await response.json();

      if (response.ok) {
        const processedKPIs = result.metrics.map((metric: any) => ({
          id: metric.id || `${metric.name}-${metric.created_at}`,
          name: metric.name,
          value: metric.value,
          unit: metric.unit || '',
          period: metric.period || 'current',
          trend: calculateTrend(metric),
          change: calculateChange(metric),
          changePercent: calculateChangePercent(metric),
          category: categorizeKPI(metric.name),
          priority: determinePriority(metric),
          lastUpdated: metric.created_at,
          source: metric.source || 'manual'
        }));
        setKpis(processedKPIs);
      } else {
        setError(result.error || 'Failed to load KPIs');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadInsights = async () => {
    try {
      const response = await fetch(`/api/companies/${companyId}/insights`);
      const result = await response.json();

      if (response.ok) {
        setInsights(result.insights || []);
      }
    } catch (err: any) {
      console.warn('Failed to load insights:', err.message);
    }
  };

  const calculateTrend = (metric: any): 'up' | 'down' | 'neutral' => {
    // This would typically compare with historical data
    // For now, we'll use a simple heuristic
    if (typeof metric.value === 'number') {
      if (metric.value > 1000000) return 'up';
      if (metric.value < 100000) return 'down';
    }
    return 'neutral';
  };

  const calculateChange = (metric: any): number => {
    // This would calculate actual change from previous period
    // For now, return a mock value
    return Math.random() * 20 - 10;
  };

  const calculateChangePercent = (metric: any): number => {
    // This would calculate actual percentage change
    // For now, return a mock value
    return Math.random() * 50 - 25;
  };

  const categorizeKPI = (name: string): KPIData['category'] => {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('revenue') || nameLower.includes('arr') || nameLower.includes('mrr')) {
      return 'financial';
    }
    if (nameLower.includes('growth') || nameLower.includes('acquisition') || nameLower.includes('retention')) {
      return 'growth';
    }
    if (nameLower.includes('churn') || nameLower.includes('risk') || nameLower.includes('debt')) {
      return 'risk';
    }
    if (nameLower.includes('users') || nameLower.includes('customers') || nameLower.includes('employees')) {
      return 'operational';
    }
    return 'custom';
  };

  const determinePriority = (metric: any): KPIData['priority'] => {
    const nameLower = metric.name.toLowerCase();
    if (nameLower.includes('revenue') || nameLower.includes('arr') || nameLower.includes('growth')) {
      return 'high';
    }
    if (nameLower.includes('churn') || nameLower.includes('risk')) {
      return 'high';
    }
    return 'medium';
  };

  const groupedKPIs = useMemo(() => {
    const groups = {
      financial: kpis.filter(kpi => kpi.category === 'financial'),
      growth: kpis.filter(kpi => kpi.category === 'growth'),
      operational: kpis.filter(kpi => kpi.category === 'operational'),
      risk: kpis.filter(kpi => kpi.category === 'risk'),
      custom: kpis.filter(kpi => kpi.category === 'custom')
    };
    return groups;
  }, [kpis]);

  const priorityInsights = useMemo(() => {
    return insights
      .filter(insight => insight.priority === 'high')
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);
  }, [insights]);

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return '📈';
      case 'down': return '📉';
      default: return '➡️';
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'up': return 'text-green-400';
      case 'down': return 'text-red-400';
      default: return 'text-onGlass-secondary';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'border-red-400 bg-red-900/10';
      case 'medium': return 'border-yellow-400 bg-yellow-900/10';
      case 'low': return 'border-green-400 bg-green-900/10';
      default: return 'border-border';
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="text-center text-onGlass-secondary">
          Loading KPIs...
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="text-center text-red-400">
          Error: {error}
        </div>
        <Button 
          variant="primary" 
          onClick={loadKPIs}
          className="mt-4"
        >
          Retry
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Priority Insights */}
      {priorityInsights.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-onGlass mb-4">Key Insights</h3>
          <div className="space-y-3">
            {priorityInsights.map((insight) => (
              <div 
                key={insight.id}
                className={`p-4 rounded-lg border ${getPriorityColor(insight.priority)}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium text-onGlass">{insight.title}</h4>
                    <p className="text-sm text-onGlass-secondary mt-1">{insight.content}</p>
                    <div className="flex items-center space-x-2 mt-2">
                      <span className="text-xs text-onGlass-muted">
                        Confidence: {Math.round(insight.confidence * 100)}%
                      </span>
                      {insight.actionable && (
                        <span className="text-xs bg-blue-900/20 text-blue-400 px-2 py-1 rounded">
                          Actionable
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Dynamic KPI Sections */}
      {Object.entries(groupedKPIs).map(([category, categoryKPIs]) => {
        if (categoryKPIs.length === 0) return null;

        const categoryTitles = {
          financial: 'Financial Metrics',
          growth: 'Growth Metrics',
          operational: 'Operational Metrics',
          risk: 'Risk Metrics',
          custom: 'Custom Metrics'
        };

        return (
          <Card key={category} className="p-6">
            <h3 className="text-lg font-semibold text-onGlass mb-4">
              {categoryTitles[category as keyof typeof categoryTitles]}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categoryKPIs.map((kpi) => (
                <div 
                  key={kpi.id}
                  className={`p-4 rounded-lg border ${getPriorityColor(kpi.priority)}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-onGlass text-sm">{kpi.name}</h4>
                    <span className="text-xs text-onGlass-muted">{kpi.priority}</span>
                  </div>
                  
                  <div className="text-2xl font-bold text-onGlass mb-1">
                    {typeof kpi.value === 'number' 
                      ? kpi.value.toLocaleString() 
                      : kpi.value
                    }{kpi.unit}
                  </div>
                  
                  <div className="flex items-center space-x-2 text-sm">
                    <span className={getTrendColor(kpi.trend)}>
                      {getTrendIcon(kpi.trend)} {kpi.changePercent > 0 ? '+' : ''}{kpi.changePercent.toFixed(1)}%
                    </span>
                    <span className="text-onGlass-muted">({kpi.period})</span>
                  </div>
                  
                  <div className="text-xs text-onGlass-muted mt-2">
                    Updated: {new Date(kpi.lastUpdated).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        );
      })}

      {/* No KPIs State */}
      {kpis.length === 0 && (
        <Card className="p-6 text-center">
          <div className="text-4xl mb-4">📊</div>
          <h3 className="text-lg font-semibold text-onGlass mb-2">No KPIs Available</h3>
          <p className="text-onGlass-secondary mb-4">
            Add KPIs to see dynamic insights and metrics for this company.
          </p>
          <Button variant="primary">
            Add KPI
          </Button>
        </Card>
      )}
    </div>
  );
}






