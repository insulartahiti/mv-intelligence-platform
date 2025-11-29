import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("MV_WEBHOOK_SECRET");

const supabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mv-signature',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// ============================================================================
// ZAPIER LINKEDIN WEBHOOK HANDLER
// ============================================================================

interface LinkedInWebhookData {
  action: 'profile_update' | 'connections_update' | 'mutual_connections_update';
  contact_id: string;
  profile_data?: {
    linkedin_profile_id: string;
    first_name: string;
    last_name: string;
    headline: string;
    industry: string;
    location: string;
    profile_url: string;
    profile_picture_url?: string;
    summary?: string;
    current_position?: {
      title: string;
      company: string;
      company_id: string;
    };
    connections_count: number;
  };
  connections_data?: Array<{
    profile_id: string;
    first_name: string;
    last_name: string;
    headline: string;
    industry: string;
    location: string;
    profile_url: string;
    profile_picture_url?: string;
    current_position?: {
      title: string;
      company: string;
      company_id: string;
    };
    mutual_connections_count?: number;
  }>;
  mutual_connections_data?: Array<{
    profile_id: string;
    first_name: string;
    last_name: string;
    headline: string;
    industry: string;
    location: string;
    profile_url: string;
    profile_picture_url?: string;
    current_position?: {
      title: string;
      company: string;
      company_id: string;
    };
  }>;
}

// ============================================================================
// PROFILE UPDATE HANDLER
// ============================================================================

async function handleProfileUpdate(contactId: string, profileData: any) {
  try {
    console.log(`📝 Updating LinkedIn profile for contact: ${contactId}`);

    // Update contact with LinkedIn profile data
    const { error: contactError } = await supabaseClient
      .from('contacts')
      .update({
        linkedin_profile_id: profileData.linkedin_profile_id,
        linkedin_profile_url: profileData.profile_url,
        linkedin_connections_count: profileData.connections_count,
        linkedin_last_synced: new Date().toISOString()
      })
      .eq('id', contactId);

    if (contactError) {
      throw new Error(`Error updating contact: ${contactError.message}`);
    }

    console.log(`✅ LinkedIn profile updated for contact: ${contactId}`);
    return { success: true, message: 'Profile updated successfully' };

  } catch (error) {
    console.error('Error updating LinkedIn profile:', error);
    throw error;
  }
}

// ============================================================================
// CONNECTIONS UPDATE HANDLER
// ============================================================================

async function handleConnectionsUpdate(contactId: string, connectionsData: any[]) {
  try {
    console.log(`🔗 Updating LinkedIn connections for contact: ${contactId}`);

    // Clear existing connections
    await supabaseClient
      .from('linkedin_connections')
      .delete()
      .eq('contact_id', contactId);

    // Insert new connections
    const connectionsToInsert = connectionsData.map(connection => ({
      contact_id: contactId,
      connection_profile_id: connection.profile_id,
      connection_name: `${connection.first_name} ${connection.last_name}`,
      connection_title: connection.current_position?.title || connection.headline,
      connection_company: connection.current_position?.company,
      connection_industry: connection.industry,
      connection_location: connection.location,
      connection_profile_url: connection.profile_url,
      connection_picture_url: connection.profile_picture_url,
      mutual_connections_count: connection.mutual_connections_count || 0,
      connection_strength: 0.5, // Default strength
      is_affinity_contact: false // Will be updated by matching process
    }));

    const { error: insertError } = await supabaseClient
      .from('linkedin_connections')
      .insert(connectionsToInsert);

    if (insertError) {
      throw new Error(`Error inserting connections: ${insertError.message}`);
    }

    // Try to match with Affinity contacts
    await matchConnectionsWithAffinity(contactId, connectionsData);

    console.log(`✅ LinkedIn connections updated for contact: ${contactId}`);
    return { success: true, message: `Updated ${connectionsData.length} connections` };

  } catch (error) {
    console.error('Error updating LinkedIn connections:', error);
    throw error;
  }
}

// ============================================================================
// MUTUAL CONNECTIONS UPDATE HANDLER
// ============================================================================

async function handleMutualConnectionsUpdate(contactId: string, targetContactId: string, mutualConnectionsData: any[]) {
  try {
    console.log(`🤝 Updating mutual connections between ${contactId} and ${targetContactId}`);

    // Clear existing mutual connections
    await supabaseClient
      .from('linkedin_mutual_connections')
      .delete()
      .eq('contact_id', contactId)
      .eq('target_contact_id', targetContactId);

    // Insert new mutual connections
    const mutualConnectionsToInsert = mutualConnectionsData.map(connection => ({
      contact_id: contactId,
      target_contact_id: targetContactId,
      mutual_connection_profile_id: connection.profile_id,
      mutual_connection_name: `${connection.first_name} ${connection.last_name}`,
      mutual_connection_title: connection.current_position?.title || connection.headline,
      mutual_connection_company: connection.current_position?.company,
      mutual_connection_industry: connection.industry,
      mutual_connection_location: connection.location,
      mutual_connection_profile_url: connection.profile_url,
      mutual_connection_picture_url: connection.profile_picture_url,
      connection_strength: 0.5, // Default strength
      is_affinity_contact: false // Will be updated by matching process
    }));

    const { error: insertError } = await supabaseClient
      .from('linkedin_mutual_connections')
      .insert(mutualConnectionsToInsert);

    if (insertError) {
      throw new Error(`Error inserting mutual connections: ${insertError.message}`);
    }

    // Try to match with Affinity contacts
    await matchMutualConnectionsWithAffinity(contactId, targetContactId, mutualConnectionsData);

    console.log(`✅ Mutual connections updated between ${contactId} and ${targetContactId}`);
    return { success: true, message: `Updated ${mutualConnectionsData.length} mutual connections` };

  } catch (error) {
    console.error('Error updating mutual connections:', error);
    throw error;
  }
}

// ============================================================================
// AFFINITY MATCHING
// ============================================================================

async function matchConnectionsWithAffinity(contactId: string, connectionsData: any[]) {
  try {
    // Get all Affinity contacts
    const { data: affinityContacts } = await supabaseClient
      .from('contacts')
      .select('id, name, title, email, companies(name, industry)');

    if (!affinityContacts) return;

    // Match LinkedIn connections with Affinity contacts
    for (const connection of connectionsData) {
      const linkedinName = `${connection.first_name} ${connection.last_name}`.toLowerCase();
      const linkedinCompany = connection.current_position?.company?.toLowerCase() || '';
      const linkedinTitle = connection.current_position?.title?.toLowerCase() || '';

      for (const affinityContact of affinityContacts) {
        const affinityName = affinityContact.name.toLowerCase();
        const affinityCompany = affinityContact.companies?.name?.toLowerCase() || '';
        const affinityTitle = affinityContact.title?.toLowerCase() || '';

        // Calculate match confidence
        let matchConfidence = 0;
        
        // Name matching
        if (linkedinName === affinityName) {
          matchConfidence += 0.4;
        } else if (linkedinName.includes(affinityName.split(' ')[0])) {
          matchConfidence += 0.2;
        }

        // Company matching
        if (linkedinCompany && affinityCompany && linkedinCompany === affinityCompany) {
          matchConfidence += 0.3;
        }

        // Title matching
        if (linkedinTitle && affinityTitle && linkedinTitle === affinityTitle) {
          matchConfidence += 0.3;
        }

        // If high confidence match, update the connection
        if (matchConfidence > 0.7) {
          await supabaseClient
            .from('linkedin_connections')
            .update({
              is_affinity_contact: true,
              affinity_contact_id: affinityContact.id,
              connection_strength: matchConfidence
            })
            .eq('contact_id', contactId)
            .eq('connection_profile_id', connection.profile_id);

          console.log(`🎯 Matched LinkedIn connection ${linkedinName} with Affinity contact ${affinityContact.name}`);
        }
      }
    }
  } catch (error) {
    console.error('Error matching connections with Affinity:', error);
  }
}

async function matchMutualConnectionsWithAffinity(contactId: string, targetContactId: string, mutualConnectionsData: any[]) {
  try {
    // Get all Affinity contacts
    const { data: affinityContacts } = await supabaseClient
      .from('contacts')
      .select('id, name, title, email, companies(name, industry)');

    if (!affinityContacts) return;

    // Match mutual connections with Affinity contacts
    for (const connection of mutualConnectionsData) {
      const linkedinName = `${connection.first_name} ${connection.last_name}`.toLowerCase();
      const linkedinCompany = connection.current_position?.company?.toLowerCase() || '';
      const linkedinTitle = connection.current_position?.title?.toLowerCase() || '';

      for (const affinityContact of affinityContacts) {
        const affinityName = affinityContact.name.toLowerCase();
        const affinityCompany = affinityContact.companies?.name?.toLowerCase() || '';
        const affinityTitle = affinityContact.title?.toLowerCase() || '';

        // Calculate match confidence
        let matchConfidence = 0;
        
        // Name matching
        if (linkedinName === affinityName) {
          matchConfidence += 0.4;
        } else if (linkedinName.includes(affinityName.split(' ')[0])) {
          matchConfidence += 0.2;
        }

        // Company matching
        if (linkedinCompany && affinityCompany && linkedinCompany === affinityCompany) {
          matchConfidence += 0.3;
        }

        // Title matching
        if (linkedinTitle && affinityTitle && linkedinTitle === affinityTitle) {
          matchConfidence += 0.3;
        }

        // If high confidence match, update the mutual connection
        if (matchConfidence > 0.7) {
          await supabaseClient
            .from('linkedin_mutual_connections')
            .update({
              is_affinity_contact: true,
              affinity_contact_id: affinityContact.id,
              connection_strength: matchConfidence
            })
            .eq('contact_id', contactId)
            .eq('target_contact_id', targetContactId)
            .eq('mutual_connection_profile_id', connection.profile_id);

          console.log(`🎯 Matched mutual connection ${linkedinName} with Affinity contact ${affinityContact.name}`);
        }
      }
    }
  } catch (error) {
    console.error('Error matching mutual connections with Affinity:', error);
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

    const webhookData: LinkedInWebhookData = await req.json();

    console.log(`📨 LinkedIn webhook received: ${webhookData.action} for contact ${webhookData.contact_id}`);

    let result;

    switch (webhookData.action) {
      case 'profile_update':
        if (!webhookData.profile_data) {
          throw new Error('Profile data is required for profile_update action');
        }
        result = await handleProfileUpdate(webhookData.contact_id, webhookData.profile_data);
        break;

      case 'connections_update':
        if (!webhookData.connections_data) {
          throw new Error('Connections data is required for connections_update action');
        }
        result = await handleConnectionsUpdate(webhookData.contact_id, webhookData.connections_data);
        break;

      case 'mutual_connections_update':
        if (!webhookData.mutual_connections_data || !webhookData.target_contact_id) {
          throw new Error('Mutual connections data and target contact ID are required for mutual_connections_update action');
        }
        result = await handleMutualConnectionsUpdate(
          webhookData.contact_id, 
          webhookData.target_contact_id, 
          webhookData.mutual_connections_data
        );
        break;

      default:
        throw new Error(`Unknown action: ${webhookData.action}`);
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        message: 'Webhook processed successfully',
        result,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing LinkedIn webhook:', error);
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
