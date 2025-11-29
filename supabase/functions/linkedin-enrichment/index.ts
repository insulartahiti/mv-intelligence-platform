import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const LINKEDIN_CLIENT_ID = Deno.env.get("LINKEDIN_CLIENT_ID");
const LINKEDIN_CLIENT_SECRET = Deno.env.get("LINKEDIN_CLIENT_SECRET");
const LINKEDIN_ACCESS_TOKEN = Deno.env.get("LINKEDIN_ACCESS_TOKEN") || '';
const WEBHOOK_SECRET = Deno.env.get("MV_WEBHOOK_SECRET");

const supabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mv-signature',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// ============================================================================
// LINKEDIN ENRICHMENT TYPES
// ============================================================================

interface LinkedInProfile {
  id: string;
  firstName: {
    localized: { [key: string]: string };
    preferredLocale: { country: string; language: string };
  };
  lastName: {
    localized: { [key: string]: string };
    preferredLocale: { country: string; language: string };
  };
  headline?: {
    localized: { [key: string]: string };
    preferredLocale: { country: string; language: string };
  };
  summary?: {
    localized: { [key: string]: string };
    preferredLocale: { country: string; language: string };
  };
  positions?: {
    elements: Array<{
      id: number;
      title: string;
      description?: string;
      companyName: string;
      location?: string;
      startDate?: {
        month: number;
        year: number;
      };
      endDate?: {
        month: number;
        year: number;
      };
      isCurrent: boolean;
    }>;
  };
}

interface EnrichedContact {
  id: string;
  name: string;
  headline?: string;
  summary?: string;
  currentPosition?: string;
  currentCompany?: string;
  location?: string;
  profileUrl: string;
  profilePicture?: string;
  enrichedAt: string;
}

// ============================================================================
// ENRICHMENT FUNCTIONS
// ============================================================================

async function enrichLinkedInProfile(profile: LinkedInProfile): Promise<EnrichedContact> {
  const name = `${profile.firstName.localized[profile.firstName.preferredLocale.language]} ${profile.lastName.localized[profile.lastName.preferredLocale.language]}`;
  
  const headline = profile.headline?.localized[profile.headline.preferredLocale.language];
  const summary = profile.summary?.localized[profile.summary.preferredLocale.language];
  
  const currentPosition = profile.positions?.elements.find(pos => pos.isCurrent);
  const currentCompany = currentPosition?.companyName;
  const location = currentPosition?.location;
  
  const profileUrl = `https://www.linkedin.com/in/${profile.id}`;
  const profilePicture = profile.profilePicture?.displayImage;

  return {
    id: profile.id,
    name,
    headline,
    summary,
    currentPosition: currentPosition?.title,
    currentCompany,
    location,
    profileUrl,
    profilePicture,
    enrichedAt: new Date().toISOString(),
  };
}

async function generateContactInsights(contact: EnrichedContact): Promise<string> {
  if (!OPENAI_API_KEY) {
    return "AI insights not available - OpenAI API key not configured";
  }

  const prompt = `Analyze this LinkedIn contact and provide key insights:

Name: ${contact.name}
Headline: ${contact.headline || 'N/A'}
Current Position: ${contact.currentPosition || 'N/A'}
Current Company: ${contact.currentCompany || 'N/A'}
Location: ${contact.location || 'N/A'}
Summary: ${contact.summary || 'N/A'}

Provide 2-3 key insights about this person's professional background, potential value for business development, and any notable characteristics.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || "No insights generated";
  } catch (error) {
    console.error("OpenAI API error:", error);
    return "AI insights generation failed";
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { profile, generateInsights = false } = await req.json();

    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile data is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const enrichedContact = await enrichLinkedInProfile(profile);
    
    let insights = null;
    if (generateInsights) {
      insights = await generateContactInsights(enrichedContact);
    }

    return new Response(JSON.stringify({ 
      contact: enrichedContact,
      insights 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("LinkedIn enrichment error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
