import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

export const dynamic = 'force-dynamic';

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  try {
    console.log('🔗 Starting LinkedIn data import...');

    // Check if Connections.csv exists
    const fs = require('fs');
    const csvPath = '/Users/harshgovil/mv-intelligence-platform/Connections.csv';
    
    if (!fs.existsSync(csvPath)) {
      return NextResponse.json({
        success: false,
        error: 'Connections.csv not found. Please export your LinkedIn connections and save as Connections.csv in the project root.'
      }, { status: 400 });
    }

    // Run the LinkedIn import script
    const { stdout, stderr } = await execAsync('cd /Users/harshgovil/mv-intelligence-platform && node import_linkedin_data.js');

    console.log('LinkedIn import output:', stdout);
    if (stderr) {
      console.error('LinkedIn import errors:', stderr);
    }

    return NextResponse.json({
      success: true,
      message: 'LinkedIn data import completed successfully',
      output: stdout
    });

  } catch (error) {
    console.error('Error importing LinkedIn data:', error);
    return NextResponse.json({ 
      success: false,
      error: 'Failed to import LinkedIn data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
