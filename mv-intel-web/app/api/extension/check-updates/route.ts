import { NextRequest, NextResponse } from 'next/server';

// Extension version management
const EXTENSION_VERSIONS = {
  current: '1.0.0',
  latest: '1.0.0',
  changelog: [
    {
      version: '1.0.0',
      date: '2025-01-01',
      changes: [
        'Initial release',
        'Basic slide capture functionality',
        'Support for Figma, Google Slides, and PowerPoint',
        'Secure data handling'
      ]
    }
  ]
};

export async function GET(request: NextRequest) {
  try {
    // In a real implementation, this would check against a database
    // or external service for the latest version
    const userAgent = request.headers.get('user-agent') || '';
    const isChrome = userAgent.includes('Chrome');
    
    if (!isChrome) {
      return NextResponse.json({
        error: 'Extension only available for Chrome browsers'
      }, { status: 400 });
    }

    return NextResponse.json({
      currentVersion: EXTENSION_VERSIONS.current,
      latestVersion: EXTENSION_VERSIONS.latest,
      hasUpdate: false, // Will be true when there's a newer version
      changelog: EXTENSION_VERSIONS.changelog,
      downloadUrl: '/chrome-extension/mv-intel-extension.crx',
      lastChecked: new Date().toISOString()
    });
  } catch (error) {
    console.error('Extension update check failed:', error);
    return NextResponse.json({
      error: 'Failed to check for updates'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { currentVersion, extensionId } = body;

    // Log extension version check for analytics
    console.log('Extension version check:', { currentVersion, extensionId });

    // Check if update is available
    const hasUpdate = currentVersion !== EXTENSION_VERSIONS.latest;
    
    return NextResponse.json({
      hasUpdate,
      currentVersion,
      latestVersion: EXTENSION_VERSIONS.latest,
      downloadUrl: hasUpdate ? '/chrome-extension/mv-intel-extension.crx' : null,
      changelog: hasUpdate ? EXTENSION_VERSIONS.changelog : []
    });
  } catch (error) {
    console.error('Extension update check failed:', error);
    return NextResponse.json({
      error: 'Failed to check for updates'
    }, { status: 500 });
  }
}

