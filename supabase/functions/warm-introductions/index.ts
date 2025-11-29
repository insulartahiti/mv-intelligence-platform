import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AFFINITY_API_KEY = Deno.env.get("AFFINITY_API_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("MV_WEBHOOK_SECRET");

const supabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const AFFINITY_BASE_URL = 'https://api.affinity.co';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mv-signature',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// ============================================================================
// AFFINITY API FUNCTIONS
// ============================================================================

function basicAuthHeader() {
  if (!AFFINITY_API_KEY) {
    throw new Error('AFFINITY_API_KEY not configured')
  }
  const authString = ':' + AFFINITY_API_KEY
  const encodedAuth = btoa(authString)
  return {
    'Authorization': `Basic ${encodedAuth}`,
    'Content-Type': 'application/json'
  }
}

async function fetchAffinityData(endpoint: string) {
  const response = await fetch(`${AFFINITY_BASE_URL}${endpoint}`, {
    headers: basicAuthHeader()
  })
  
  if (!response.ok) {
    throw new Error(`Affinity API error: ${response.status} ${response.statusText}`)
  }
  
  return await response.json()
}

// ============================================================================
// WARM INTRODUCTION FUNCTIONS
// ============================================================================

interface WarmIntroduction {
  target_contact: {
    id: string;
    name: string;
    title: string;
    company: string;
    email?: string;
  };
  path: Array<{
    contact: {
      id: string;
      name: string;
      title: string;
      company: string;
      relationship_strength: number;
    };
    relationship_type: string;
    connection_strength: number;
  }>;
  total_strength: number;
  confidence_score: number;
  introduction_strategy: string;
}

async function findWarmIntroductions(
  targetContactId: string,
  maxPathLength: number = 3,
  minStrength: number = 0.3
): Promise<WarmIntroduction[]> {
  console.log(`🔍 Finding warm introductions for contact: ${targetContactId}`)
  
  // Get target contact details
  const { data: targetContact } = await supabaseClient
    .from('contacts')
    .select(`
      id, name, title, email,
      companies(name, domain)
    `)
    .eq('id', targetContactId)
    .single()

  if (!targetContact) {
    throw new Error('Target contact not found')
  }

  // Get all contacts and their relationships
  const { data: allContacts } = await supabaseClient
    .from('contacts')
    .select(`
      id, name, title, email,
      companies(name, domain),
      relationships(
        id, from_contact, to_contact, relationship_type, strength
      )
    `)

  if (!allContacts) {
    throw new Error('No contacts found')
  }

  // Build relationship graph
  const relationshipGraph = buildRelationshipGraph(allContacts)
  
  // Find paths using BFS
  const paths = findPathsBFS(
    relationshipGraph,
    targetContactId,
    maxPathLength,
    minStrength
  )

  // Generate introduction strategies using AI
  const warmIntroductions: WarmIntroduction[] = []
  
  for (const path of paths) {
    const introduction = await generateIntroductionStrategy(
      targetContact,
      path,
      allContacts
    )
    warmIntroductions.push(introduction)
  }

  // Sort by total strength
  return warmIntroductions.sort((a, b) => b.total_strength - a.total_strength)
}

function buildRelationshipGraph(contacts: any[]): Map<string, Array<{contactId: string, strength: number, type: string}>> {
  const graph = new Map<string, Array<{contactId: string, strength: number, type: string}>>()
  
  for (const contact of contacts) {
    if (!graph.has(contact.id)) {
      graph.set(contact.id, [])
    }
    
    // Add relationships
    if (contact.relationships) {
      for (const rel of contact.relationships) {
        const relatedContactId = rel.to_contact
        if (relatedContactId && relatedContactId !== contact.id) {
          graph.get(contact.id)!.push({
            contactId: relatedContactId,
            strength: rel.strength || 0.5,
            type: rel.relationship_type || 'unknown'
          })
        }
      }
    }
  }
  
  return graph
}

function findPathsBFS(
  graph: Map<string, Array<{contactId: string, strength: number, type: string}>>,
  targetId: string,
  maxLength: number,
  minStrength: number
): Array<Array<{contactId: string, strength: number, type: string}>> {
  const paths: Array<Array<{contactId: string, strength: number, type: string}>> = []
  const queue: Array<{path: Array<{contactId: string, strength: number, type: string}>, visited: Set<string>}> = []
  
  // Start from all contacts (potential introducers)
  for (const [contactId, relationships] of graph) {
    if (contactId !== targetId) {
      queue.push({
        path: [],
        visited: new Set([contactId])
      })
    }
  }
  
  while (queue.length > 0) {
    const { path, visited } = queue.shift()!
    
    if (path.length >= maxLength) continue
    
    const currentContactId = path.length === 0 ? 
      Array.from(visited)[0] : 
      path[path.length - 1].contactId
    
    const relationships = graph.get(currentContactId) || []
    
    for (const rel of relationships) {
      if (visited.has(rel.contactId)) continue
      if (rel.strength < minStrength) continue
      
      const newPath = [...path, rel]
      const newVisited = new Set(visited)
      newVisited.add(rel.contactId)
      
      if (rel.contactId === targetId) {
        paths.push(newPath)
      } else if (newPath.length < maxLength) {
        queue.push({ path: newPath, visited: newVisited })
      }
    }
  }
  
  return paths
}

async function generateIntroductionStrategy(
  targetContact: any,
  path: Array<{contactId: string, strength: number, type: string}>,
  allContacts: any[]
): Promise<WarmIntroduction> {
  // Get contact details for the path
  const pathContacts = path.map(step => {
    const contact = allContacts.find(c => c.id === step.contactId)
    return {
      contact: {
        id: contact.id,
        name: contact.name,
        title: contact.title,
        company: contact.companies?.name || 'Unknown',
        relationship_strength: step.strength
      },
      relationship_type: step.type,
      connection_strength: step.strength
    }
  })
  
  // Calculate total strength
  const totalStrength = pathContacts.reduce((sum, step) => sum + step.connection_strength, 0) / pathContacts.length
  
  // Generate AI-powered introduction strategy
  const strategy = await generateAIIntroductionStrategy(targetContact, pathContacts)
  
  return {
    target_contact: {
      id: targetContact.id,
      name: targetContact.name,
      title: targetContact.title,
      company: targetContact.companies?.name || 'Unknown',
      email: targetContact.email
    },
    path: pathContacts,
    total_strength: totalStrength,
    confidence_score: Math.min(totalStrength * 1.2, 1.0),
    introduction_strategy: strategy
  }
}

async function generateAIIntroductionStrategy(
  targetContact: any,
  pathContacts: any[]
): Promise<string> {
  if (!OPENAI_API_KEY) {
    return "Manual introduction recommended - analyze the relationship path and craft a personalized approach."
  }
  
  const prompt = `Generate a warm introduction strategy for connecting with ${targetContact.name} (${targetContact.title} at ${targetContact.companies?.name}).

Introduction Path:
${pathContacts.map((step, i) => 
  `${i + 1}. ${step.contact.name} (${step.contact.title} at ${step.contact.company}) - ${step.relationship_type} relationship (strength: ${step.connection_strength})`
).join('\n')}

Provide a specific, actionable introduction strategy including:
1. Who should make the introduction
2. How to approach the introducer
3. What to say in the introduction request
4. Key talking points for the target contact
5. Follow-up strategy

Keep it concise and professional.`

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in business networking and relationship building. Generate practical, actionable introduction strategies.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const data = await response.json()
    return data.choices[0]?.message?.content || "Manual introduction recommended."
  } catch (error) {
    console.error('Error generating AI strategy:', error)
    return "Manual introduction recommended - analyze the relationship path and craft a personalized approach."
  }
}

// ============================================================================
// CONNECTIVITY ANALYSIS FUNCTIONS
// ============================================================================

interface ConnectivityAnalysis {
  contact_id: string;
  contact_name: string;
  company: string;
  network_size: number;
  influence_score: number;
  connection_density: number;
  key_relationships: Array<{
    contact_id: string;
    contact_name: string;
    relationship_type: string;
    strength: number;
  }>;
  network_clusters: Array<{
    name: string;
    contacts: string[];
    strength: number;
  }>;
  connectivity_insights: string;
}

async function analyzeConnectivity(contactId: string): Promise<ConnectivityAnalysis> {
  console.log(`🔍 Analyzing connectivity for contact: ${contactId}`)
  
  // Get contact and all relationships
  const { data: contact } = await supabaseClient
    .from('contacts')
    .select(`
      id, name, title, email,
      companies(name, domain),
      relationships(
        id, to_contact, relationship_type, strength,
        related_contact:contacts!relationships_to_contact_fkey(
          id, name, title, companies(name)
        )
      )
    `)
    .eq('id', contactId)
    .single()

  if (!contact) {
    throw new Error('Contact not found')
  }

  const relationships = contact.relationships || []
  const networkSize = relationships.length
  
  // Calculate influence score based on relationship strength and diversity
  const influenceScore = calculateInfluenceScore(relationships)
  
  // Calculate connection density
  const connectionDensity = calculateConnectionDensity(relationships)
  
  // Identify key relationships
  const keyRelationships = relationships
    .filter(rel => rel.strength > 0.7)
    .map(rel => ({
      contact_id: rel.to_contact,
      contact_name: rel.related_contact?.name || 'Unknown',
      relationship_type: rel.relationship_type,
      strength: rel.strength
    }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 10)

  // Identify network clusters
  const networkClusters = identifyNetworkClusters(relationships)
  
  // Generate AI insights
  const insights = await generateConnectivityInsights(contact, relationships, networkClusters)

  return {
    contact_id: contact.id,
    contact_name: contact.name,
    company: contact.companies?.name || 'Unknown',
    network_size: networkSize,
    influence_score: influenceScore,
    connection_density: connectionDensity,
    key_relationships: keyRelationships,
    network_clusters: networkClusters,
    connectivity_insights: insights
  }
}

function calculateInfluenceScore(relationships: any[]): number {
  if (relationships.length === 0) return 0
  
  const avgStrength = relationships.reduce((sum, rel) => sum + (rel.strength || 0.5), 0) / relationships.length
  const diversityScore = new Set(relationships.map(rel => rel.relationship_type)).size / 10 // Normalize to 0-1
  const sizeScore = Math.min(relationships.length / 50, 1) // Normalize to 0-1
  
  return (avgStrength * 0.4 + diversityScore * 0.3 + sizeScore * 0.3)
}

function calculateConnectionDensity(relationships: any[]): number {
  if (relationships.length === 0) return 0
  
  // Simple density calculation - in a real implementation, you'd analyze actual connections between contacts
  const strongConnections = relationships.filter(rel => rel.strength > 0.7).length
  return strongConnections / relationships.length
}

function identifyNetworkClusters(relationships: any[]): Array<{name: string, contacts: string[], strength: number}> {
  // Group by relationship type to identify clusters
  const clusters = new Map<string, Array<{contactId: string, strength: number}>>()
  
  for (const rel of relationships) {
    const type = rel.relationship_type || 'other'
    if (!clusters.has(type)) {
      clusters.set(type, [])
    }
    clusters.get(type)!.push({
      contactId: rel.to_contact,
      strength: rel.strength || 0.5
    })
  }
  
  return Array.from(clusters.entries()).map(([type, contacts]) => ({
    name: type.charAt(0).toUpperCase() + type.slice(1),
    contacts: contacts.map(c => c.contactId),
    strength: contacts.reduce((sum, c) => sum + c.strength, 0) / contacts.length
  }))
}

async function generateConnectivityInsights(
  contact: any,
  relationships: any[],
  clusters: any[]
): Promise<string> {
  if (!OPENAI_API_KEY) {
    return "Manual analysis recommended - review the relationship data and network clusters."
  }
  
  const prompt = `Analyze the network connectivity for ${contact.name} (${contact.title} at ${contact.companies?.name}).

Network Statistics:
- Total connections: ${relationships.length}
- Key relationship types: ${clusters.map(c => c.name).join(', ')}
- Network clusters: ${clusters.length}

Provide insights on:
1. Network strength and influence
2. Key relationship opportunities
3. Network gaps and expansion potential
4. Strategic networking recommendations

Keep it concise and actionable.`

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in network analysis and relationship intelligence. Provide actionable insights on professional networks.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 400
      })
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const data = await response.json()
    return data.choices[0]?.message?.content || "Manual analysis recommended."
  } catch (error) {
    console.error('Error generating connectivity insights:', error)
    return "Manual analysis recommended - review the relationship data and network clusters."
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
      target_contact_id,
      max_path_length = 3,
      min_strength = 0.3
    } = await req.json();

    console.log(`🚀 Warm introductions request: ${action}`)

    switch (action) {
      case 'find_warm_introductions':
        if (!target_contact_id) {
          return new Response(
            JSON.stringify({ error: 'target_contact_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const introductions = await findWarmIntroductions(target_contact_id, max_path_length, min_strength)
        
        return new Response(
          JSON.stringify({ 
            ok: true, 
            action: 'find_warm_introductions',
            target_contact_id,
            introductions,
            count: introductions.length,
            timestamp: new Date().toISOString()
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

      case 'analyze_connectivity':
        if (!target_contact_id) {
          return new Response(
            JSON.stringify({ error: 'target_contact_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const analysis = await analyzeConnectivity(target_contact_id)
        
        return new Response(
          JSON.stringify({ 
            ok: true, 
            action: 'analyze_connectivity',
            analysis,
            timestamp: new Date().toISOString()
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action. Use: find_warm_introductions, analyze_connectivity' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

  } catch (error) {
    console.error('Error in warm introductions:', error)
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
