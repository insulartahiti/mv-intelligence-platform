import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient(URL, ANON, { auth: { persistSession: false } });
  
  try {
    const companyId = params.id;

    // Get intelligence overlays for the company
    const { data: intelligence, error: intelError } = await supabase
      .from('intelligence_overlays')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (intelError) {
      console.warn('Failed to fetch intelligence overlays:', intelError.message);
    }

    // Get recent metrics for trend analysis
    const { data: metrics, error: metricsError } = await supabase
      .from('metrics')
      .select('name, value, unit, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (metricsError) {
      console.warn('Failed to fetch metrics:', metricsError.message);
    }

    // Get recent news for sentiment analysis
    const { data: news, error: newsError } = await supabase
      .from('company_news_links')
      .select(`
        news_items (
          title,
          sentiment,
          published_at
        )
      `)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (newsError) {
      console.warn('Failed to fetch news:', newsError.message);
    }

    // Generate qualitative insights from the data
    const insights = generateQualitativeInsights(
      intelligence || [],
      metrics || [],
      news || []
    );

    return NextResponse.json({ insights });

  } catch (error: any) {
    console.error('Error generating insights:', error);
    return NextResponse.json({ 
      error: 'Failed to generate insights: ' + error.message 
    }, { status: 500 });
  }
}

function generateQualitativeInsights(
  intelligence: any[],
  metrics: any[],
  news: any[]
): any[] {
  const insights: any[] = [];

  // Generate insights from intelligence overlays
  intelligence.forEach((intel, index) => {
    if (intel.insights) {
      try {
        const parsedInsights = typeof intel.insights === 'string' 
          ? JSON.parse(intel.insights) 
          : intel.insights;

        // Extract opportunities
        if (parsedInsights.opportunities && Array.isArray(parsedInsights.opportunities)) {
          parsedInsights.opportunities.forEach((opp: string) => {
            insights.push({
              id: `opportunity-${intel.id}-${Date.now()}`,
              type: 'opportunity',
              title: 'Growth Opportunity',
              content: opp,
              confidence: 0.8,
              source: 'AI Analysis',
              actionable: true,
              priority: 'high'
            });
          });
        }

        // Extract risk factors
        if (parsedInsights.risk_factors && Array.isArray(parsedInsights.risk_factors)) {
          parsedInsights.risk_factors.forEach((risk: string) => {
            insights.push({
              id: `risk-${intel.id}-${Date.now()}`,
              type: 'risk',
              title: 'Risk Factor',
              content: risk,
              confidence: 0.7,
              source: 'AI Analysis',
              actionable: true,
              priority: 'high'
            });
          });
        }

        // Extract next best actions
        if (parsedInsights.next_best_action) {
          insights.push({
            id: `action-${intel.id}-${Date.now()}`,
            type: 'summary',
            title: 'Recommended Action',
            content: parsedInsights.next_best_action,
            confidence: 0.9,
            source: 'AI Analysis',
            actionable: true,
            priority: 'high'
          });
        }
      } catch (error) {
        console.warn('Failed to parse intelligence insights:', error);
      }
    }
  });

  // Generate insights from metrics trends
  if (metrics.length > 0) {
    const metricGroups = groupMetricsByName(metrics);
    
    Object.entries(metricGroups).forEach(([metricName, metricData]) => {
      if (metricData.length >= 2) {
        const trend = calculateTrend(metricData);
        if (trend.significant) {
          insights.push({
            id: `trend-${metricName}-${Date.now()}`,
            type: 'trend',
            title: `${metricName} Trend`,
            content: `${metricName} has ${trend.direction} by ${trend.percentage}% over the last ${metricData.length} periods`,
            confidence: trend.confidence,
            source: 'Metric Analysis',
            actionable: trend.actionable,
            priority: trend.priority
          });
        }
      }
    });
  }

  // Generate insights from news sentiment
  if (news.length > 0) {
    const sentimentAnalysis = analyzeNewsSentiment(news);
    
    if (sentimentAnalysis.overallSentiment !== 'neutral') {
      insights.push({
        id: `sentiment-${Date.now()}`,
        type: sentimentAnalysis.overallSentiment === 'positive' ? 'opportunity' : 'risk',
        title: 'Media Sentiment',
        content: `Recent news coverage shows ${sentimentAnalysis.overallSentiment} sentiment with ${sentimentAnalysis.confidence}% confidence`,
        confidence: sentimentAnalysis.confidence / 100,
        source: 'News Analysis',
        actionable: true,
        priority: sentimentAnalysis.overallSentiment === 'positive' ? 'medium' : 'high'
      });
    }
  }

  // Sort by priority and confidence
  return insights.sort((a, b) => {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder];
    const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder];
    
    if (aPriority !== bPriority) {
      return bPriority - aPriority;
    }
    
    return b.confidence - a.confidence;
  });
}

function groupMetricsByName(metrics: any[]): { [key: string]: any[] } {
  return metrics.reduce((groups, metric) => {
    const name = metric.name;
    if (!groups[name]) {
      groups[name] = [];
    }
    groups[name].push(metric);
    return groups;
  }, {});
}

function calculateTrend(metricData: any[]): {
  significant: boolean;
  direction: string;
  percentage: number;
  confidence: number;
  actionable: boolean;
  priority: 'high' | 'medium' | 'low';
} {
  if (metricData.length < 2) {
    return {
      significant: false,
      direction: 'stable',
      percentage: 0,
      confidence: 0,
      actionable: false,
      priority: 'low'
    };
  }

  const sortedData = metricData.sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const firstValue = parseFloat(sortedData[0].value) || 0;
  const lastValue = parseFloat(sortedData[sortedData.length - 1].value) || 0;
  
  if (firstValue === 0) {
    return {
      significant: false,
      direction: 'stable',
      percentage: 0,
      confidence: 0,
      actionable: false,
      priority: 'low'
    };
  }

  const percentage = ((lastValue - firstValue) / firstValue) * 100;
  const significant = Math.abs(percentage) > 10; // 10% threshold
  const direction = percentage > 0 ? 'increased' : 'decreased';
  const confidence = Math.min(95, Math.max(60, 100 - Math.abs(percentage) / 2));
  const actionable = significant && Math.abs(percentage) > 20;
  const priority = significant && Math.abs(percentage) > 30 ? 'high' : 
                  significant ? 'medium' : 'low';

  return {
    significant,
    direction,
    percentage: Math.abs(percentage),
    confidence,
    actionable,
    priority
  };
}

function analyzeNewsSentiment(news: any[]): {
  overallSentiment: 'positive' | 'negative' | 'neutral';
  confidence: number;
} {
  const sentiments = news
    .map(item => item.news_items?.sentiment)
    .filter(sentiment => sentiment !== null && sentiment !== undefined);

  if (sentiments.length === 0) {
    return { overallSentiment: 'neutral', confidence: 0 };
  }

  const positiveCount = sentiments.filter(s => s === 'positive' || s > 0.5).length;
  const negativeCount = sentiments.filter(s => s === 'negative' || s < -0.5).length;
  const totalCount = sentiments.length;

  const positiveRatio = positiveCount / totalCount;
  const negativeRatio = negativeCount / totalCount;

  if (positiveRatio > 0.6) {
    return { overallSentiment: 'positive', confidence: positiveRatio * 100 };
  } else if (negativeRatio > 0.6) {
    return { overallSentiment: 'negative', confidence: negativeRatio * 100 };
  } else {
    return { overallSentiment: 'neutral', confidence: 50 };
  }
}






