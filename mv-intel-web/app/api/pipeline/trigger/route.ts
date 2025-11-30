import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Triggering full data pipeline via API...');

    // Path to run_pipeline.js
    const scriptPath = path.resolve(process.cwd(), 'scripts/run_pipeline.js');
    
    // Check if script exists (sanity check)
    // Actually, in Next.js production build, files might be moved.
    // Assuming standard structure where scripts/ is at root alongside next.config.js or similar
    
    // Spawn detached process
    const child = spawn('npx', ['tsx', scriptPath], {
      detached: true,
      stdio: 'ignore', // Don't block
      env: process.env,
      cwd: process.cwd() // Run from root where package.json usually is
    });

    child.unref();

    return NextResponse.json({
      success: true,
      message: 'Pipeline triggered successfully in background.',
      pid: child.pid
    });

  } catch (error) {
    console.error('❌ Error triggering pipeline:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to trigger pipeline' },
      { status: 500 }
    );
  }
}

