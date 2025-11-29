import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ZAPIER_WEBHOOK_URL = Deno.env.get("ZAPIER_LINKEDIN_WEBHOOK_URL")!;
const WEBHOOK_SECRET = Deno.env.get("MV_WEBHOOK_SECRET");

const supabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mv-signature',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// ============================================================================
// LINKEDIN NETWORK ANALYSIS TYPES
// ============================================================================

interface LinkedInProfile {
  id: string;
  firstName: string;
  lastName: string;
  headline: string;
  industry: string;
  location: string;
  profileUrl: string;
  profilePictureUrl?: string;
  summary?: string;
  currentPosition?: {
    title: string;
    company: string;
    companyId: string;
  };
  connections?: number;
  mutualConnections?: number;
}

interface NetworkAnalysis {
  contact_id: string;
  linkedin_profile: LinkedInProfile;
  first_degree_connections: LinkedInProfile[];
  mutual_connections: LinkedInProfile[];
  affinity_matches: {
    contact_id: string;
    name: string;
    title: string;
    company: string;
    match_confidence: number;
    match_reasons: string[];
  }[];
  network_insights: {
    total_connections: number;
    mutual_connections_count: number;
    affinity_overlap: number;
    industry_distribution: Record<string, number>;
    seniority_distribution: Record<string, number>;
    company_distribution: Record<string, number>;
    warm_introduction_potential: number;
    strategic_value: number;
  };
  recommendations: {
    immediate_actions: string[];
    relationship_building: string[];
    warm_introductions: string[];
    strategic_opportunities: string[];
  };
}

// ============================================================================
// LINKEDIN DATA INTEGRATION
// ============================================================================

async function fetchLinkedInProfile(contactId: string): Promise<LinkedInProfile | null> {
  try {
    // Get contact from database
    const { data: contact } = await supabaseClient
      .from('contacts')
      .select(`
        id, name, title, email,
        companies(name, industry, domain)
      `)
      .eq('id', contactId)
      .single();

    if (!contact) {
      throw new Error('Contact not found');
    }

    // Call Zapier webhook to fetch LinkedIn profile
    const response = await fetch(ZAPIER_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'fetch_profile',
        contact: {
          id: contact.id,
          name: contact.name,
          email: contact.email,
          company: contact.companies?.name
        }
      })
    });

    if (!response.ok) {
      throw new Error(`LinkedIn API error: ${response.status}`);
    }

    const data = await response.json();
    return data.profile || null;
  } catch (error) {
    console.error('Error fetching LinkedIn profile:', error);
    return null;
  }
}

async function fetchFirstDegreeConnections(linkedinProfileId: string): Promise<LinkedInProfile[]> {
  try {
    const response = await fetch(ZAPIER_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'fetch_connections',
        profile_id: linkedinProfileId,
        connection_type: 'first_degree'
      })
    });

    if (!response.ok) {
      throw new Error(`LinkedIn connections API error: ${response.status}`);
    }

    const data = await response.json();
    return data.connections || [];
  } catch (error) {
    console.error('Error fetching LinkedIn connections:', error);
    return [];
  }
}

async function fetchMutualConnections(linkedinProfileId: string, targetProfileId: string): Promise<LinkedInProfile[]> {
  try {
    const response = await fetch(ZAPIER_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'fetch_mutual_connections',
        profile_id: linkedinProfileId,
        target_profile_id: targetProfileId
      })
    });

    if (!response.ok) {
      throw new Error(`LinkedIn mutual connections API error: ${response.status}`);
    }

    const data = await response.json();
    return data.mutual_connections || [];
  } catch (error) {
    console.error('Error fetching mutual connections:', error);
    return [];
  }
}

// ============================================================================
// AFFINITY MATCHING
// ============================================================================

async function findAffinityMatches(linkedinConnections: LinkedInProfile[]): Promise<any[]> {
  try {
    // Get all contacts from Affinity
    const { data: affinityContacts } = await supabaseClient
      .from('contacts')
      .select(`
        id, name, title, email,
        companies(name, industry, domain)
      `);

    if (!affinityContacts) return [];

    const matches = [];

    for (const linkedinConnection of linkedinConnections) {
      for (const affinityContact of affinityContacts) {
        const matchConfidence = calculateMatchConfidence(linkedinConnection, affinityContact);
        
        if (matchConfidence > 0.7) { // High confidence threshold
          matches.push({
            contact_id: affinityContact.id,
            name: affinityContact.name,
            title: affinityContact.title,
            company: affinityContact.companies?.name || 'Unknown',
            match_confidence: matchConfidence,
            match_reasons: getMatchReasons(linkedinConnection, affinityContact)
          });
        }
      }
    }

    return matches.sort((a, b) => b.match_confidence - a.match_confidence);
  } catch (error) {
    console.error('Error finding Affinity matches:', error);
    return [];
  }
}

function calculateMatchConfidence(linkedinProfile: LinkedInProfile, affinityContact: any): number {
  let confidence = 0;
  const reasons = [];

  // Name matching
  const linkedinFullName = `${linkedinProfile.firstName} ${linkedinProfile.lastName}`.toLowerCase();
  const affinityName = affinityContact.name.toLowerCase();
  
  if (linkedinFullName === affinityName) {
    confidence += 0.4;
    reasons.push('Exact name match');
  } else if (linkedinFullName.includes(affinityName.split(' ')[0]) || 
             affinityName.includes(linkedinProfile.firstName.toLowerCase())) {
    confidence += 0.2;
    reasons.push('Partial name match');
  }

  // Company matching
  const linkedinCompany = linkedinProfile.currentPosition?.company?.toLowerCase() || '';
  const affinityCompany = affinityContact.companies?.name?.toLowerCase() || '';
  
  if (linkedinCompany && affinityCompany) {
    if (linkedinCompany === affinityCompany) {
      confidence += 0.3;
      reasons.push('Exact company match');
    } else if (linkedinCompany.includes(affinityCompany) || 
               affinityCompany.includes(linkedinCompany)) {
      confidence += 0.15;
      reasons.push('Partial company match');
    }
  }

  // Title matching
  const linkedinTitle = linkedinProfile.currentPosition?.title?.toLowerCase() || '';
  const affinityTitle = affinityContact.title?.toLowerCase() || '';
  
  if (linkedinTitle && affinityTitle) {
    if (linkedinTitle === affinityTitle) {
      confidence += 0.2;
      reasons.push('Exact title match');
    } else if (linkedinTitle.includes(affinityTitle) || 
               affinityTitle.includes(linkedinTitle)) {
      confidence += 0.1;
      reasons.push('Partial title match');
    }
  }

  // Industry matching
  const linkedinIndustry = linkedinProfile.industry?.toLowerCase() || '';
  const affinityIndustry = affinityContact.companies?.industry?.toLowerCase() || '';
  
  if (linkedinIndustry && affinityIndustry && linkedinIndustry === affinityIndustry) {
    confidence += 0.1;
    reasons.push('Industry match');
  }

  return Math.min(confidence, 1.0);
}

function getMatchReasons(linkedinProfile: LinkedInProfile, affinityContact: any): string[] {
  const reasons = [];
  
  // Name matching
  const linkedinFullName = `${linkedinProfile.firstName} ${linkedinProfile.lastName}`.toLowerCase();
  const affinityName = affinityContact.name.toLowerCase();
  
  if (linkedinFullName === affinityName) {
    reasons.push('Exact name match');
  } else if (linkedinFullName.includes(affinityName.split(' ')[0])) {
    reasons.push('First name match');
  }

  // Company matching
  const linkedinCompany = linkedinProfile.currentPosition?.company?.toLowerCase() || '';
  const affinityCompany = affinityContact.companies?.name?.toLowerCase() || '';
  
  if (linkedinCompany && affinityCompany && linkedinCompany === affinityCompany) {
    reasons.push('Same company');
  }

  // Title matching
  const linkedinTitle = linkedinProfile.currentPosition?.title?.toLowerCase() || '';
  const affinityTitle = affinityContact.title?.toLowerCase() || '';
  
  if (linkedinTitle && affinityTitle && linkedinTitle === affinityTitle) {
    reasons.push('Same title');
  }

  return reasons;
}

// ============================================================================
// NETWORK ANALYSIS
// ============================================================================

function analyzeNetwork(linkedinProfile: LinkedInProfile, connections: LinkedInProfile[], mutualConnections: LinkedInProfile[], affinityMatches: any[]): any {
  const industryDistribution: Record<string, number> = {};
  const seniorityDistribution: Record<string, number> = {};
  const companyDistribution: Record<string, number> = {};

  // Analyze connections
  for (const connection of connections) {
    // Industry distribution
    if (connection.industry) {
      industryDistribution[connection.industry] = (industryDistribution[connection.industry] || 0) + 1;
    }

    // Seniority distribution (based on title keywords)
    const title = connection.currentPosition?.title?.toLowerCase() || '';
    if (title.includes('ceo') || title.includes('founder') || title.includes('president')) {
      seniorityDistribution['C-Level'] = (seniorityDistribution['C-Level'] || 0) + 1;
    } else if (title.includes('vp') || title.includes('vice president') || title.includes('director')) {
      seniorityDistribution['VP/Director'] = (seniorityDistribution['VP/Director'] || 0) + 1;
    } else if (title.includes('manager') || title.includes('head of')) {
      seniorityDistribution['Manager'] = (seniorityDistribution['Manager'] || 0) + 1;
    } else {
      seniorityDistribution['Other'] = (seniorityDistribution['Other'] || 0) + 1;
    }

    // Company distribution
    if (connection.currentPosition?.company) {
      companyDistribution[connection.currentPosition.company] = (companyDistribution[connection.currentPosition.company] || 0) + 1;
    }
  }

  // Calculate metrics
  const totalConnections = connections.length;
  const mutualConnectionsCount = mutualConnections.length;
  const affinityOverlap = affinityMatches.length / totalConnections;
  const warmIntroductionPotential = Math.min(mutualConnectionsCount / 10, 1.0); // Scale to 0-1
  const strategicValue = (affinityOverlap * 0.4) + (warmIntroductionPotential * 0.6);

  return {
    total_connections: totalConnections,
    mutual_connections_count: mutualConnectionsCount,
    affinity_overlap: affinityOverlap,
    industry_distribution: industryDistribution,
    seniority_distribution: seniorityDistribution,
    company_distribution: companyDistribution,
    warm_introduction_potential: warmIntroductionPotential,
    strategic_value: strategicValue
  };
}

function generateRecommendations(networkInsights: any, affinityMatches: any[]): any {
  const recommendations = {
    immediate_actions: [],
    relationship_building: [],
    warm_introductions: [],
    strategic_opportunities: []
  };

  // Immediate actions
  if (affinityMatches.length > 0) {
    recommendations.immediate_actions.push(`Reach out to ${affinityMatches.length} identified Affinity contacts`);
  }
  if (networkInsights.mutual_connections_count > 0) {
    recommendations.immediate_actions.push(`Leverage ${networkInsights.mutual_connections_count} mutual connections`);
  }

  // Relationship building
  if (networkInsights.affinity_overlap < 0.3) {
    recommendations.relationship_building.push('Focus on building relationships with Affinity contacts');
  }
  if (networkInsights.warm_introduction_potential > 0.7) {
    recommendations.relationship_building.push('High warm introduction potential - prioritize relationship building');
  }

  // Warm introductions
  if (affinityMatches.length > 0) {
    recommendations.warm_introductions.push(`Request introductions through ${affinityMatches[0].name} and other matches`);
  }
  if (networkInsights.mutual_connections_count > 5) {
    recommendations.warm_introductions.push('Multiple mutual connections available for warm introductions');
  }

  // Strategic opportunities
  if (networkInsights.strategic_value > 0.7) {
    recommendations.strategic_opportunities.push('High strategic value - prioritize for investment opportunities');
  }
  if (Object.keys(networkInsights.industry_distribution).length > 3) {
    recommendations.strategic_opportunities.push('Diverse industry network - explore cross-industry opportunities');
  }

  return recommendations;
}

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

async function performNetworkAnalysis(contactId: string, targetContactId?: string): Promise<NetworkAnalysis | null> {
  try {
    console.log(`🔍 Starting LinkedIn network analysis for contact: ${contactId}`);

    // Fetch LinkedIn profile
    const linkedinProfile = await fetchLinkedInProfile(contactId);
    if (!linkedinProfile) {
      throw new Error('Could not fetch LinkedIn profile');
    }

    // Fetch first-degree connections
    const firstDegreeConnections = await fetchFirstDegreeConnections(linkedinProfile.id);
    console.log(`📊 Found ${firstDegreeConnections.length} first-degree connections`);

    // Fetch mutual connections if target contact provided
    let mutualConnections: LinkedInProfile[] = [];
    if (targetContactId) {
      const targetLinkedinProfile = await fetchLinkedInProfile(targetContactId);
      if (targetLinkedinProfile) {
        mutualConnections = await fetchMutualConnections(linkedinProfile.id, targetLinkedinProfile.id);
        console.log(`🤝 Found ${mutualConnections.length} mutual connections`);
      }
    }

    // Find Affinity matches
    const affinityMatches = await findAffinityMatches(firstDegreeConnections);
    console.log(`🎯 Found ${affinityMatches.length} Affinity matches`);

    // Analyze network
    const networkInsights = analyzeNetwork(linkedinProfile, firstDegreeConnections, mutualConnections, affinityMatches);

    // Generate recommendations
    const recommendations = generateRecommendations(networkInsights, affinityMatches);

    // Store analysis results
    const analysisResult: NetworkAnalysis = {
      contact_id: contactId,
      linkedin_profile: linkedinProfile,
      first_degree_connections: firstDegreeConnections,
      mutual_connections: mutualConnections,
      affinity_matches: affinityMatches,
      network_insights: networkInsights,
      recommendations: recommendations
    };

    // Save to database
    await supabaseClient
      .from('linkedin_network_analysis')
      .upsert({
        contact_id: contactId,
        analysis_data: analysisResult,
        created_at: new Date().toISOString()
      }, {
        onConflict: 'contact_id'
      });

    console.log(`✅ LinkedIn network analysis completed for ${contactId}`);
    return analysisResult;

  } catch (error) {
    console.error('Error in LinkedIn network analysis:', error);
    throw error;
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  try {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    // Security check
    if (WEBHOOK_SECRET && req.headers.get("x-mv-signature") !== WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { 
      action,
      contact_id,
      target_contact_id
    } = await req.json();

    if (!contact_id) {
      return new Response(
        JSON.stringify({ error: 'Contact ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🚀 LinkedIn network analysis request: ${action} for contact ${contact_id}`);

    if (action === 'analyze_network') {
      const analysis = await performNetworkAnalysis(contact_id, target_contact_id);
      
      return new Response(
        JSON.stringify({ 
          ok: true, 
          analysis,
          timestamp: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'get_analysis') {
      const { data: analysis } = await supabaseClient
        .from('linkedin_network_analysis')
        .select('*')
        .eq('contact_id', contact_id)
        .single();

      return new Response(
        JSON.stringify({ 
          ok: true, 
          analysis: analysis?.analysis_data || null,
          timestamp: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in LinkedIn network analysis:', error);
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
})
