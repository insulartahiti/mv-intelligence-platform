import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = 'force-dynamic';

const supabase = createClient(
  'https://uqptiychukuwixubrbat.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxcHRpeWNodWt1d2l4dWJyYmF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDY2NjI5OCwiZXhwIjoyMDcwMjQyMjk4fQ.o3yC3GpX80hK2cozCyQDv12zORe9ZQ-Ar8wAcJc1iLg',
  { auth: { persistSession: false } }
);

type RowEntity = {
  id: string;
  type: "person" | "organization" | "opportunity" | string;
  name: string;
  domain: string | null;
  industry: string | null;
  is_internal: boolean | null;
  pipeline_stage: string | null;
  fund: string | null;
  taxonomy: string | null;
  is_portfolio: boolean | null;
  is_pipeline: boolean | null;
};

type RowEdge = {
  id: string;
  source: string;
  target: string;
  kind: string | null;
  weight: number | null;
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const maxNodes = Math.min(Number(url.searchParams.get("maxNodes") ?? 1000), 5000); // Reduced default
    const maxEdges = Math.min(Number(url.searchParams.get("maxEdges") ?? 500), 2000); // Reduced default

    // Access graph schema tables using schema method
    // 1) First fetch edges to get all connected node IDs
    const { data: edgesData, error: edgesErr } = await supabase
      .from('edges_view')
      .select('id,source,target,kind,strength_score')
      .limit(maxEdges);

    if (edgesErr) {
      console.error("Error fetching edges:", edgesErr);
      return NextResponse.json({ error: "Failed to fetch edges from graph schema" }, { status: 500 });
    }

    // Extract all unique node IDs from edges
    const edgeNodeIds = new Set<string>();
    if (edgesData) {
      edgesData.forEach(edge => {
        edgeNodeIds.add(edge.source);
        edgeNodeIds.add(edge.target);
      });
    }

    // 2) Fetch entities in batches to get all connected nodes
    let allEntities: any[] = [];
    let offset = 0;
    const batchSize = 1000;
    
    // First, try to get all entities in batches
    while (offset < 20000) { // Safety limit
      const { data: batchEntities, error: batchErr } = await supabase
        .from('entities_view')
        .select('id,type,name,domain,industry,is_internal,pipeline_stage,fund,taxonomy,is_portfolio,is_pipeline')
        .range(offset, offset + batchSize - 1);

      if (batchErr) {
        console.error("Error fetching entities batch:", batchErr);
        break;
      }

      if (!batchEntities || batchEntities.length === 0) {
        break; // No more entities
      }

      allEntities = [...allEntities, ...batchEntities];
      
      // If we got fewer entities than requested, we've reached the end
      if (batchEntities.length < batchSize) {
        break;
      }
      
      offset += batchSize;
    }


    if (allEntities.length === 0) {
      return NextResponse.json({ error: "No entities found" }, { status: 404 });
    }

    // Filter and prioritize entities
    const connectedEntities = allEntities.filter(e => edgeNodeIds.has(e.id));
    const otherEntities = allEntities.filter(e => !edgeNodeIds.has(e.id));
    
    
    // Combine: connected entities first, then others up to maxNodes
    const entities = [
      ...connectedEntities,
      ...otherEntities.slice(0, maxNodes - connectedEntities.length)
    ];

    // 4) Fetch company names from companies table for mapping
    const { data: companies, error: compErr } = await supabase
      .from('companies')
      .select('id,name,domain');

    if (compErr) {
      console.error("Error fetching companies:", compErr);
      // Continue without company names if this fails
    }

    // Create domain to company name mapping
    const domainToName = new Map<string, string>();
    if (companies) {
      companies.forEach(company => {
        if (company.domain) {
          domainToName.set(company.domain, company.name);
        }
      });
    }

    // Map entities to graph format
    const ents = entities.map(e => ({
      id: e.id,
      type: e.type === "person" ? "person" : "company", // Use standard Sigma types
      name: e.name,
      domain: e.domain,
      industry: e.industry,
      is_internal: e.is_internal,
      pipeline_stage: e.pipeline_stage,
      fund: e.fund,
      taxonomy: e.taxonomy,
      is_portfolio: e.is_portfolio,
      is_pipeline: e.is_pipeline
    }));

    // Create a set of available node IDs for filtering
    const availableNodeIds = new Set(entities.map(e => e.id));

    // Map edges to graph format - only include edges where both nodes exist
    const eds = (edgesData || [])
      .filter(e => availableNodeIds.has(e.source) && availableNodeIds.has(e.target))
      .map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        kind: e.kind || "relationship",
        weight: e.strength_score || 0.5
      }));

    // Calculate degree for node sizing
    const deg: Record<string, number> = {};
    for (const e of eds) {
      deg[e.source] = (deg[e.source] ?? 0) + 1;
      deg[e.target] = (deg[e.target] ?? 0) + 1;
    }
    const sizeFor = (id: string) => {
      const d = deg[id] ?? 0;
      return Math.max(6, Math.min(20, 6 + Math.log(1 + d) * 4));
    };

    const nodes = ents.map((e) => {
      // Use actual company name if available, otherwise fall back to domain or numeric ID
      let displayName = e.name;
      
      if (e.type === 'person') {
        // For person nodes, use the actual name if it's meaningful
        if (e.name && e.name.includes('@') && e.name.includes('<')) {
          // Extract name from "Name <email@domain.com>" format
          const nameMatch = e.name.match(/^([^<]+)\s*<[^>]+>$/);
          if (nameMatch) {
            displayName = nameMatch[1].trim();
          } else {
            displayName = e.name;
          }
        } else if (e.name && /^\d{2}\/\d{2}\/\d{4}$/.test(e.name)) {
          // For date names, use a generic name
          displayName = `Person ${e.id.slice(-4)}`;
        } else if (e.name && e.name.length < 3) {
          displayName = `Person ${e.id.slice(-4)}`;
        } else {
          displayName = e.name || `Person ${e.id.slice(-4)}`;
        }
      } else if (e.domain && domainToName.has(e.domain)) {
        displayName = domainToName.get(e.domain)!;
      } else if (e.domain) {
        displayName = e.domain.replace('.com', '').replace('.ai', '').replace('.io', '');
      }
      
      return {
        id: e.id,
        label: e.is_internal ? `⭐ ${displayName}` : displayName,
        type: e.type || "person",
        domain: e.domain ?? undefined,
        industry: e.industry ?? undefined,
        pipeline_stage: e.pipeline_stage ?? undefined,
        fund: e.fund ?? undefined,
        taxonomy: e.taxonomy ?? undefined,
        is_internal: !!e.is_internal,
        is_portfolio: !!e.is_portfolio,
        is_pipeline: !!e.is_pipeline,
        size: sizeFor(e.id),
      };
    });

    const edges = eds.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      kind: e.kind ?? "rel",
      weight: e.weight ?? 0.5,
    }));

    return NextResponse.json({ nodes, edges });
  } catch (err: any) {
    console.error("/api/graph/network error", err);
    return NextResponse.json({ error: err.message ?? "failed" }, { status: 500 });
  }
}
