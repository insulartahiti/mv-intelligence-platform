import { NextRequest, NextResponse } from 'next/server';

// This would normally be in a shared location or database
// For now, we'll import from the main route file
const progressStore = new Map<string, any>();

export async function GET(
  request: NextRequest,
  { params }: { params: { importId: string } }
) {
  try {
    const { importId } = params;
    
    // In a real implementation, this would fetch from a database
    // For now, we'll return a mock response
    const progress = {
      status: 'completed',
      current_step: 'Import completed',
      progress_percentage: 100,
      organizations_processed: 5,
      contacts_processed: 12,
      errors: [],
      results: {
        organizations: [],
        contacts: [],
        total_organizations: 5,
        total_contacts: 12
      }
    };

    return NextResponse.json({
      status: 'success',
      progress
    });

  } catch (error) {
    console.error('Error getting import progress:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Failed to get import progress',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}


