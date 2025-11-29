import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

interface EmailProcessingRequest {
  emailId: string;
  subject: string;
  content: string;
  from: string;
  to: string;
  date: string;
  attachments?: Array<{
    name: string;
    content: string;
    type: string;
  }>;
  htmlContent?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { emailId, subject, content, from, to, date, attachments = [], htmlContent }: EmailProcessingRequest = await req.json();

    if (!emailId || !subject || !content) {
      return NextResponse.json({ 
        error: 'emailId, subject, and content are required' 
      }, { status: 400 });
    }

    console.log(`📧 Processing email: ${subject}`);

    // 1. Extract entities and insights using GPT-5
    const analysis = await analyzeEmailWithGPT5({
      subject,
      content,
      from,
      to,
      attachments,
      htmlContent
    });

    // 2. Link to portfolio companies
    const companyLinks = await linkToPortfolioCompanies(analysis.entities);

    // 3. Extract KPIs and metrics
    const extractedKPIs = await extractKPIsFromEmail(analysis);

    // 4. Generate insights
    const insights = await generateEmailInsights(analysis, companyLinks, extractedKPIs);

    // 5. Store in knowledge graph
    await storeInKnowledgeGraph(emailId, analysis, companyLinks, extractedKPIs, insights);

    // 6. Update portfolio companies if linked
    if (companyLinks.length > 0) {
      await updatePortfolioCompanies(companyLinks, extractedKPIs, insights);
    }

    return NextResponse.json({
      success: true,
      emailId,
      analysis,
      companyLinks,
      extractedKPIs,
      insights,
      message: 'Email processed successfully'
    });

  } catch (error: any) {
    console.error('Error processing email:', error);
    return NextResponse.json({ 
      error: 'Failed to process email: ' + error.message 
    }, { status: 500 });
  }
}

async function analyzeEmailWithGPT5(emailData: any) {
  try {
    console.log('🧠 Analyzing email with GPT-5...');

    const prompt = `Analyze this email for portfolio intelligence:

Subject: ${emailData.subject}
From: ${emailData.from}
To: ${emailData.to}
Date: ${emailData.date}

Content:
${emailData.content}

${emailData.attachments.length > 0 ? `
Attachments:
${emailData.attachments.map((att: any) => `- ${att.name} (${att.type})`).join('\n')}
` : ''}

Please provide a comprehensive analysis in JSON format with the following structure:
{
  "summary": "Brief summary of the email content",
  "entities": [
    {
      "type": "company|person|metric|topic|action",
      "name": "entity name",
      "confidence": 0.0-1.0,
      "context": "relevant context",
      "importance": 0.0-1.0
    }
  ],
  "sentiment": {
    "overall": "positive|negative|neutral",
    "confidence": 0.0-1.0,
    "aspects": {
      "business": "positive|negative|neutral",
      "financial": "positive|negative|neutral",
      "operational": "positive|negative|neutral"
    }
  },
  "topics": [
    {
      "name": "topic name",
      "relevance": 0.0-1.0,
      "category": "financial|operational|strategic|risk"
    }
  ],
  "insights": [
    {
      "type": "opportunity|risk|action|trend",
      "content": "insight description",
      "confidence": 0.0-1.0,
      "priority": "high|medium|low"
    }
  ],
  "financial_data": {
    "metrics": [
      {
        "name": "metric name",
        "value": "metric value",
        "unit": "unit",
        "period": "time period",
        "confidence": 0.0-1.0
      }
    ],
    "trends": [
      {
        "metric": "metric name",
        "direction": "up|down|stable",
        "magnitude": 0.0-1.0,
        "confidence": 0.0-1.0
      }
    ]
  },
  "action_items": [
    {
      "action": "action description",
      "priority": "high|medium|low",
      "due_date": "suggested due date",
      "assignee": "suggested assignee"
    }
  ]
}

Focus on extracting actionable business intelligence, financial metrics, and portfolio-relevant insights.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o', // Using GPT-4o instead of GPT-5 (not yet available)
        messages: [
          {
            role: 'system',
            content: 'You are an expert portfolio analyst and business intelligence specialist. Extract maximum value from email content for investment decision-making.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 4000,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const analysis = JSON.parse(data.choices[0].message.content);

    console.log('✅ Email analysis completed');
    return analysis;

  } catch (error) {
    console.error('Error analyzing email with GPT-5:', error);
    throw error;
  }
}

async function linkToPortfolioCompanies(entities: any[]) {
  try {
    console.log('🔗 Linking entities to portfolio companies...');

    const companyEntities = entities.filter(e => e.type === 'company');
    const links = [];

    for (const entity of companyEntities) {
      // Search for matching companies in portfolio
      const { data: companies, error } = await supabase
        .from('companies')
        .select('id, name, domain, affinity_org_id')
        .or(`name.ilike.%${entity.name}%,domain.ilike.%${entity.name}%`);

      if (error) {
        console.warn(`Error searching for company ${entity.name}:`, error);
        continue;
      }

      if (companies && companies.length > 0) {
        // Find best match
        const bestMatch = companies.find(c => 
          c.name.toLowerCase().includes(entity.name.toLowerCase()) ||
          c.domain?.toLowerCase().includes(entity.name.toLowerCase())
        ) || companies[0];

        links.push({
          entity,
          company: bestMatch,
          confidence: entity.confidence,
          matchType: 'name' // or 'domain'
        });
      }
    }

    console.log(`✅ Linked ${links.length} entities to portfolio companies`);
    return links;

  } catch (error) {
    console.error('Error linking to portfolio companies:', error);
    return [];
  }
}

async function extractKPIsFromEmail(analysis: any) {
  try {
    console.log('📊 Extracting KPIs from email...');

    const kpis = analysis.financial_data?.metrics || [];
    const extractedKPIs = [];

    for (const kpi of kpis) {
      if (kpi.confidence > 0.7) { // Only high-confidence KPIs
        extractedKPIs.push({
          name: kpi.name,
          value: kpi.value,
          unit: kpi.unit || '',
          period: kpi.period || 'current',
          confidence: kpi.confidence,
          source: 'email_analysis'
        });
      }
    }

    console.log(`✅ Extracted ${extractedKPIs.length} KPIs`);
    return extractedKPIs;

  } catch (error) {
    console.error('Error extracting KPIs:', error);
    return [];
  }
}

async function generateEmailInsights(analysis: any, companyLinks: any[], extractedKPIs: any[]) {
  try {
    console.log('💡 Generating email insights...');

    const insights = [];

    // High-priority insights
    const highPriorityInsights = analysis.insights?.filter((i: any) => i.priority === 'high') || [];
    for (const insight of highPriorityInsights) {
      insights.push({
        type: insight.type,
        title: `${insight.type.charAt(0).toUpperCase() + insight.type.slice(1)} Alert`,
        content: insight.content,
        confidence: insight.confidence,
        priority: 'high',
        source: 'email_analysis',
        actionable: true
      });
    }

    // Financial insights
    if (extractedKPIs.length > 0) {
      insights.push({
        type: 'financial',
        title: 'Financial Metrics Update',
        content: `Email contains ${extractedKPIs.length} financial metrics: ${extractedKPIs.map(k => k.name).join(', ')}`,
        confidence: 0.9,
        priority: 'medium',
        source: 'email_analysis',
        actionable: true
      });
    }

    // Company-specific insights
    if (companyLinks.length > 0) {
      const companyNames = companyLinks.map(l => l.company.name).join(', ');
      insights.push({
        type: 'company',
        title: 'Portfolio Company Update',
        content: `Email relates to portfolio companies: ${companyNames}`,
        confidence: 0.8,
        priority: 'high',
        source: 'email_analysis',
        actionable: true
      });
    }

    console.log(`✅ Generated ${insights.length} insights`);
    return insights;

  } catch (error) {
    console.error('Error generating insights:', error);
    return [];
  }
}

async function storeInKnowledgeGraph(emailId: string, analysis: any, companyLinks: any[], extractedKPIs: any[], insights: any[]) {
  try {
    console.log('🗄️ Storing in knowledge graph...');

    // Store email in knowledge graph
    const { error: emailError } = await supabase
      .from('email_analysis')
      .insert({
        email_id: emailId,
        analysis_data: analysis,
        company_links: companyLinks,
        extracted_kpis: extractedKPIs,
        insights: insights,
        processed_at: new Date().toISOString()
      });

    if (emailError) {
      console.warn('Error storing email analysis:', emailError);
    }

    // Store entities in knowledge graph
    for (const entity of analysis.entities || []) {
      const { error: entityError } = await supabase
        .from('entities')
        .upsert({
          kind: entity.type,
          name: entity.name,
          aliases: [entity.name],
          importance: entity.importance,
          last_seen_at: new Date().toISOString(),
          source: 'email_analysis'
        });

      if (entityError) {
        console.warn('Error storing entity:', entityError);
      }
    }

    console.log('✅ Stored in knowledge graph');

  } catch (error) {
    console.error('Error storing in knowledge graph:', error);
  }
}

async function updatePortfolioCompanies(companyLinks: any[], extractedKPIs: any[], insights: any[]) {
  try {
    console.log('📈 Updating portfolio companies...');

    for (const link of companyLinks) {
      const companyId = link.company.id;

      // Update company with new insights
      const { error: updateError } = await supabase
        .from('companies')
        .update({
          last_email_update: new Date().toISOString(),
          email_insights_count: (link.company.email_insights_count || 0) + insights.length
        })
        .eq('id', companyId);

      if (updateError) {
        console.warn(`Error updating company ${companyId}:`, updateError);
      }

      // Store KPIs for the company
      for (const kpi of extractedKPIs) {
        const { error: kpiError } = await supabase
          .from('metrics')
          .insert({
            company_id: companyId,
            name: kpi.name,
            value: kpi.value,
            unit: kpi.unit,
            period: kpi.period,
            source: 'email_analysis',
            confidence: kpi.confidence
          });

        if (kpiError) {
          console.warn(`Error storing KPI for company ${companyId}:`, kpiError);
        }
      }
    }

    console.log('✅ Updated portfolio companies');

  } catch (error) {
    console.error('Error updating portfolio companies:', error);
  }
}
