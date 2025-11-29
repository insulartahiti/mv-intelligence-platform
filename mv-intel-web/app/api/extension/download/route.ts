import { NextRequest, NextResponse } from 'next/server';
import { EXTENSION_CONFIG } from '../../../../lib/extensionConfig';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const version = searchParams.get('version') || EXTENSION_CONFIG.latestVersion;
    const format = searchParams.get('format') || 'crx'; // crx, zip, or folder
    
    // Get version info
    const versionInfo = EXTENSION_CONFIG.versions.find(v => v.version === version);
    if (!versionInfo) {
      return NextResponse.json({
        error: 'Version not found'
      }, { status: 404 });
    }
    
    // In a real implementation, you would:
    // 1. Check if the user has permission to download
    // 2. Serve the actual extension file from your storage
    // 3. Track download analytics
    
    // For now, we'll return a redirect to the public extension files
    const downloadUrl = `/chrome-extension/mv-intel-extension-v${version}.${format}`;
    
    // Check if file exists (in production, this would check your storage)
    try {
      const publicDir = path.join(process.cwd(), 'public', 'chrome-extension');
      const filePath = path.join(publicDir, `mv-intel-extension-v${version}.${format}`);
      await fs.access(filePath);
    } catch (error) {
      // File doesn't exist, return error
      return NextResponse.json({
        error: 'Extension file not found',
        availableVersions: EXTENSION_CONFIG.versions.map(v => v.version)
      }, { status: 404 });
    }
    
    // Return download info
    return NextResponse.json({
      version: version,
      downloadUrl: downloadUrl,
      filename: `mv-intel-extension-v${version}.${format}`,
      size: 'Unknown', // Would be actual file size in production
      checksum: 'Unknown', // Would be actual checksum in production
      instructions: [
        'Download the extension file',
        'Open Chrome and go to chrome://extensions/',
        'Enable "Developer mode" in the top right',
        'Click "Load unpacked" and select the extension folder',
        'Pin the extension to your toolbar for easy access'
      ]
    });
    
  } catch (error) {
    console.error('Extension download failed:', error);
    return NextResponse.json({
      error: 'Failed to process download request'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { version, userId, userAgent } = body;
    
    // Log download request for analytics
    console.log('Extension download request:', {
      version,
      userId,
      userAgent,
      timestamp: new Date().toISOString()
    });
    
    // In production, you would:
    // 1. Validate the user has permission
    // 2. Track download metrics
    // 3. Potentially rate limit downloads
    // 4. Generate signed download URLs
    
    const versionInfo = EXTENSION_CONFIG.versions.find(v => v.version === version);
    if (!versionInfo) {
      return NextResponse.json({
        error: 'Version not found'
      }, { status: 404 });
    }
    
    // Return download URL and metadata
    return NextResponse.json({
      success: true,
      downloadUrl: versionInfo.downloadUrl,
      version: version,
      timestamp: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
    });
    
  } catch (error) {
    console.error('Extension download POST failed:', error);
    return NextResponse.json({
      error: 'Failed to process download request'
    }, { status: 500 });
  }
}

