import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LINKEDIN_CLIENT_ID = Deno.env.get("LINKEDIN_CLIENT_ID");
const LINKEDIN_CLIENT_SECRET = Deno.env.get("LINKEDIN_CLIENT_SECRET");
const LINKEDIN_REDIRECT_URI = Deno.env.get("LINKEDIN_REDIRECT_URI") || "http://localhost:3000/api/knowledge-graph/linkedin-callback";
const WEBHOOK_SECRET = Deno.env.get("MV_WEBHOOK_SECRET");

const supabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mv-signature',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// ============================================================================
// LINKEDIN API TYPES
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
  profilePicture?: {
    displayImage: string;
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
  educations?: {
    elements: Array<{
      id: number;
      schoolName: string;
      degreeName?: string;
      fieldOfStudy?: string;
      startDate?: {
        year: number;
      };
      endDate?: {
        year: number;
      };
    }>;
  };
}

interface LinkedInConnections {
  elements: Array<{
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
    profilePicture?: {
      displayImage: string;
    };
  }>;
}

// ============================================================================
// LINKEDIN API FUNCTIONS
// ============================================================================

async function getLinkedInAccessToken(code: string): Promise<string> {
  if (!LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET) {
    throw new Error("LinkedIn credentials not configured");
  }

  const tokenUrl = "https://www.linkedin.com/oauth/v2/accessToken";
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: LINKEDIN_REDIRECT_URI,
    client_id: LINKEDIN_CLIENT_ID,
    client_secret: LINKEDIN_CLIENT_SECRET,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function getLinkedInProfile(accessToken: string): Promise<LinkedInProfile> {
  const profileUrl = "https://api.linkedin.com/v2/people/~:(id,firstName,lastName,profilePicture(displayImage~:playableStreams),headline,summary,positions,educations)";
  
  const response = await fetch(profileUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get LinkedIn profile: ${error}`);
  }

  return await response.json();
}

async function getLinkedInConnections(accessToken: string): Promise<LinkedInConnections> {
  const connectionsUrl = "https://api.linkedin.com/v2/people/~/connections?count=500";
  
  const response = await fetch(connectionsUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get LinkedIn connections: ${error}`);
  }

  return await response.json();
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, code, accessToken } = await req.json();

    if (action === "get_token" && code) {
      const token = await getLinkedInAccessToken(code);
      return new Response(JSON.stringify({ accessToken: token }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_profile" && accessToken) {
      const profile = await getLinkedInProfile(accessToken);
      return new Response(JSON.stringify({ profile }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_connections" && accessToken) {
      const connections = await getLinkedInConnections(accessToken);
      return new Response(JSON.stringify({ connections }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action or missing parameters" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("LinkedIn API error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
