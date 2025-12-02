import { NextRequest, NextResponse } from 'next/server';
import { listConfiguredPortcos } from '@/lib/financials/portcos/loader';

// Force dynamic rendering - prevents edge caching issues
export const dynamic = 'force-dynamic';

/**
 * GET: Detect company slug from filename
 * Query params: ?filename=Nelly_Board_Q3.pdf
 * Returns: { detected_slug: "nelly" } or { detected_slug: null }
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filename = searchParams.get('filename');

  if (!filename) {
    return NextResponse.json({ error: 'Missing filename' }, { status: 400 });
  }

  const portcos = listConfiguredPortcos();
  let detected = null;
  let longestMatch = 0;

  // Sort by slug length descending to prefer longer matches (e.g., 'nelly-test' over 'nelly')
  const sortedPortcos = [...portcos].sort((a, b) => b.length - a.length);
  
  const filenameLower = filename.toLowerCase();
  
  for (const slug of sortedPortcos) {
    const slugLower = slug.toLowerCase();
    
    // Escape regex meta-characters in slug to prevent injection
    // e.g., "acme.corp" should match literally, not "acmexcorp" where dot is any char
    const escapedSlug = slugLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Check for slug match with word boundaries to avoid partial matches
    // Match: "Nelly_Board_Q3.pdf", "nelly-financials.xlsx", "NELLY report.pdf"
    // Reject: "nellyland_report.pdf" matching "nelly" (no boundary after)
    const boundaryRegex = new RegExp(`(^|[^a-z0-9])${escapedSlug.replace(/-/g, '[-_\\s]?')}([^a-z0-9]|$)`, 'i');
    
    if (boundaryRegex.test(filenameLower) && slug.length > longestMatch) {
        detected = slug;
        longestMatch = slug.length;
        // Since sorted by length desc, first match is longest - can break
        break;
    }
  }

  return NextResponse.json({ detected_slug: detected });
}

