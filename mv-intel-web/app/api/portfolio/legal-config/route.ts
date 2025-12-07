
import { NextRequest, NextResponse } from 'next/server';
import { getLegalConfig, updateLegalConfig, LegalConfigKey } from '@/lib/legal/config';
import { DEFAULT_LEGAL_ANALYSIS_SYSTEM_PROMPT, DEFAULT_SEMANTIC_NORMALIZATION } from '@/lib/legal/prompts/investor_doc_analyzer';
import { DEFAULT_ECONOMICS_PROMPT, DEFAULT_GOVERNANCE_PROMPT, DEFAULT_LEGAL_GC_PROMPT, DEFAULT_STANDALONE_PROMPT } from '@/lib/legal/pipeline/phase2';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key') as LegalConfigKey;

  if (!key) {
    return NextResponse.json({ error: 'Missing key' }, { status: 400 });
  }

  let content = await getLegalConfig(key);

  // Fallback to defaults if not in DB
  if (!content) {
    switch (key) {
      case 'legal_analysis_system_prompt':
        content = DEFAULT_LEGAL_ANALYSIS_SYSTEM_PROMPT;
        break;
      case 'semantic_normalization':
        content = DEFAULT_SEMANTIC_NORMALIZATION;
        break;
      case 'economics_prompt':
        content = DEFAULT_ECONOMICS_PROMPT;
        break;
      case 'governance_prompt':
        content = DEFAULT_GOVERNANCE_PROMPT;
        break;
      case 'legal_gc_prompt':
        content = DEFAULT_LEGAL_GC_PROMPT;
        break;
      case 'standalone_prompt':
        content = DEFAULT_STANDALONE_PROMPT;
        break;
    }
  }

  return NextResponse.json({ content });
}

export async function POST(req: NextRequest) {
  try {
    const { key, content, description } = await req.json();

    if (!key || !content) {
      return NextResponse.json({ error: 'Missing key or content' }, { status: 400 });
    }

    const success = await updateLegalConfig(key as LegalConfigKey, content, description);
    
    if (!success) {
      return NextResponse.json({ error: 'Failed to update config' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

