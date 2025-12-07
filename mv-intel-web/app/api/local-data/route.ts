import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export const dynamic = 'force-dynamic';

const LOCAL_DATA_DIR = path.join(process.cwd(), '.local-data');

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const company = searchParams.get('company');
  const type = searchParams.get('type') || 'facts'; // facts, extractions, metrics

  try {
    if (!company) {
      // List all companies
      const factsDir = path.join(LOCAL_DATA_DIR, 'facts');
      if (!fs.existsSync(factsDir)) {
        return NextResponse.json({ companies: [] });
      }
      const companies = fs.readdirSync(factsDir).filter(f => 
        fs.statSync(path.join(factsDir, f)).isDirectory()
      );
      return NextResponse.json({ companies });
    }

    // Get data for specific company
    const companyDir = path.join(LOCAL_DATA_DIR, type, company);
    
    if (!fs.existsSync(companyDir)) {
      return NextResponse.json({ error: `No ${type} data found for ${company}` }, { status: 404 });
    }

    const files = fs.readdirSync(companyDir).filter(f => f.endsWith('.json'));
    const data: any[] = [];

    for (const file of files) {
      const filePath = path.join(companyDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      try {
        const parsed = JSON.parse(content);
        // Facts files are arrays, wrap them in a facts property
        const facts = Array.isArray(parsed) ? parsed : (parsed.facts || [parsed]);
        data.push({
          file,
          period: file.replace('.json', ''),
          facts
        });
      } catch (e) {
        console.error(`Failed to parse ${file}:`, e);
      }
    }

    // Sort by period
    data.sort((a, b) => a.period.localeCompare(b.period));

    return NextResponse.json({
      company,
      type,
      count: data.length,
      data
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
