import { NextRequest, NextResponse } from 'next/server';
import { loadPortcoGuide, listConfiguredPortcos } from '@/lib/financials/portcos/loader';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const companySlug = formData.get('company') as string;
    const files = formData.getAll('files') as File[];

    if (!companySlug || files.length === 0) {
      return NextResponse.json({ error: 'Missing company or files' }, { status: 400 });
    }

    // In a real implementation, we would:
    // 1. Save file to blob storage
    // 2. Load the guide for the company
    // 3. Trigger the ingestion pipeline (load -> parse -> map -> compute)
    
    // Mock Response for "Staging Test"
    const results = {
      status: 'success',
      company: companySlug,
      processed_files: files.map(f => ({
        name: f.name,
        size: f.size,
        status: 'ingested'
      })),
      metrics_count: 12, // Fake count
      audit_snippets: 3
    };

    return NextResponse.json(results);
  } catch (error) {
    console.error('Ingestion error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// Endpoint to detect company from filename
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filename = searchParams.get('filename');

  if (!filename) {
    return NextResponse.json({ error: 'Missing filename' }, { status: 400 });
  }

  const portcos = listConfiguredPortcos();
  let detected = null;

  // Simple heuristic: does the filename contain the portco slug/name?
  // In production, load the guides and check 'source_docs' patterns.
  for (const slug of portcos) {
    if (filename.toLowerCase().includes(slug.toLowerCase())) {
        detected = slug;
        break;
    }
    // Check "acme" in "Acme_Board_Deck..."
    if (slug === 'acme-corp' && filename.toLowerCase().includes('acme')) detected = 'acme-corp';
    if (slug === 'nelly' && filename.toLowerCase().includes('nelly')) detected = 'nelly';
  }

  return NextResponse.json({ detected_slug: detected });
}


