import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  'https://uqptiychukuwixubrbat.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxcHRpeWNodWt1d2l4dWJyYmF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDY2NjI5OCwiZXhwIjoyMDcwMjQyMjk4fQ.o3yC3GpX80hK2cozCyQDv12zORe9ZQ-Ar8wAcJc1iLg',
  { auth: { persistSession: false } }
);

interface NodeDetails {
  id: string;
  name: string;
  type: string;
  domain?: string;
  industry?: string;
  pipeline_stage?: string;
  fund?: string;
  brief_description?: string;
  linkedin_url?: string;
  phone?: string;
  location?: string;
  bio?: string;
  linkedin_first_degree?: boolean;
  internal_owner?: boolean;
  strength_score?: number;
  files: any[];
  notes: any[];
  intro_paths: any[];
  enrichment_data?: any;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const nodeId = searchParams.get('id');

    if (!nodeId) {
      return NextResponse.json(
        { success: false, message: 'Node ID is required' },
        { status: 400 }
      );
    }

    console.log(`Fetching details for node: ${nodeId}`);

    // Fetch entity details using Supabase client
    const { data: entity, error: entityError } = await supabase
      .from('entities_view')
      .select('*')
      .eq('id', nodeId)
      .single();

    if (entityError || !entity) {
      return NextResponse.json(
        { success: false, message: 'Entity not found' },
        { status: 404 }
      );
    }

    // Fetch associated files
    const { data: files, error: filesError } = await supabase
      .from('affinity_files_view')
      .select('*')
      .or(`organization_id.eq.${entity.affinity_org_id || 0},person_id.eq.${entity.affinity_person_id || 0}`);

    // Fetch notes rollup
    const { data: notes, error: notesError } = await supabase
      .from('entity_notes_rollup_view')
      .select('*')
      .eq('entity_id', nodeId);

    // Calculate strength score from edges
    const { data: edges, error: edgesError } = await supabase
      .from('edges_view')
      .select('strength_score')
      .or(`source.eq.${nodeId},target.eq.${nodeId}`);

    let strength_score = 0.5; // Default
    if (edges && edges.length > 0) {
      const avgStrength = edges.reduce((sum: number, edge: any) => sum + (edge.strength_score || 0.5), 0) / edges.length;
      strength_score = Math.min(1, Math.max(0, avgStrength));
    }

    // Generate intro paths (simplified version)
    const intro_paths = await generateIntroPaths(nodeId);

    // Helper function to clean malformed person names
    const cleanPersonName = (name: string, type: string) => {
      if (type === 'person' && name.includes(';')) {
        // Extract first person's name (before semicolon)
        return name.split(';')[0].trim();
      }
      return name;
    };

    const details: NodeDetails = {
      id: entity.id,
      name: cleanPersonName(entity.name, entity.type),
      type: entity.type,
      domain: entity.domain,
      industry: entity.industry,
      pipeline_stage: entity.pipeline_stage,
      fund: entity.fund,
      brief_description: entity.brief_description,
      linkedin_url: entity.linkedin_url,
      phone: entity.phone,
      location: entity.location,
      bio: entity.bio,
      linkedin_first_degree: entity.linkedin_first_degree || false,
      internal_owner: entity.is_internal || false,
      strength_score,
      files: files || [],
      notes: notes || [],
      intro_paths: intro_paths || [],
      enrichment_data: entity.enrichment_data
    };

    console.log(`Successfully fetched details for ${entity.name}`);

    return NextResponse.json({
      success: true,
      details
    });

  } catch (error) {
    console.error('Error fetching node details:', error);
    return NextResponse.json(
      {
        success: false,
        message: `Failed to fetch node details: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: null
      },
      { status: 500 }
    );
  }
}

async function generateIntroPaths(nodeId: string): Promise<any[]> {
  try {
    // This is a simplified intro path generation
    // In a full implementation, we'd use graph traversal algorithms
    
    // For now, return some mock intro paths
    return [
      {
        path: ['Internal Owner', 'John Smith', 'Target Person'],
        strength: 0.8,
        connection_types: ['deal_team', 'contact'],
        total_hops: 2
      },
      {
        path: ['Internal Owner', 'Jane Doe', 'LinkedIn Connection', 'Target Person'],
        strength: 0.6,
        connection_types: ['linkedin', 'contact'],
        total_hops: 3
      }
    ];
  } catch (error) {
    console.error('Error generating intro paths:', error);
    return [];
  }
}