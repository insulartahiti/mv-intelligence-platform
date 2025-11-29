// Extension Configuration and Version Management
export interface ExtensionVersion {
  version: string;
  date: string;
  changes: string[];
  downloadUrl: string;
  minChromeVersion?: string;
  breakingChanges?: boolean;
}

export interface ExtensionConfig {
  currentVersion: string;
  latestVersion: string;
  extensionId: string;
  versions: ExtensionVersion[];
  features: string[];
  supportedPlatforms: string[];
  permissions: string[];
}

export const EXTENSION_CONFIG: ExtensionConfig = {
  currentVersion: '1.0.0',
  latestVersion: '1.0.0',
  extensionId: 'cgbjodijdlcigiedlpnooopidjdjjfjn',
  versions: [
    {
      version: '1.0.0',
      date: '2025-01-01',
      changes: [
        'Initial release with basic slide capture',
        'Support for Figma, Google Slides, and PowerPoint Online',
        'Secure local data processing',
        'Direct upload to MV Intelligence Platform',
        'Basic OCR text extraction'
      ],
      downloadUrl: '/chrome-extension/mv-intel-extension-v1.0.0.crx',
      minChromeVersion: '88',
      breakingChanges: false
    }
  ],
  features: [
    'Capture slides from Figma, Google Slides, and PowerPoint',
    'Extract text and images automatically',
    'Upload directly to MV Intelligence Platform',
    'Secure data handling with local processing',
    'One-click deck analysis and insights',
    'Support for multiple file formats',
    'Real-time progress tracking'
  ],
  supportedPlatforms: [
    'Figma (figma.com)',
    'Google Slides (slides.google.com)',
    'PowerPoint Online (office.com)',
    'Notion (notion.so)',
    'Miro (miro.com)'
  ],
  permissions: [
    'activeTab - to capture content from current tab',
    'clipboardRead - to access copied content',
    'storage - to save user preferences',
    'downloads - to save captured files locally'
  ]
};

// Helper functions
export function getLatestVersion(): ExtensionVersion {
  return EXTENSION_CONFIG.versions[EXTENSION_CONFIG.versions.length - 1];
}

export function hasUpdate(currentVersion: string): boolean {
  return currentVersion !== EXTENSION_CONFIG.latestVersion;
}

export function getVersionInfo(version: string): ExtensionVersion | undefined {
  return EXTENSION_CONFIG.versions.find(v => v.version === version);
}

export function getChangelog(fromVersion?: string): ExtensionVersion[] {
  if (!fromVersion) return EXTENSION_CONFIG.versions;
  
  const fromIndex = EXTENSION_CONFIG.versions.findIndex(v => v.version === fromVersion);
  if (fromIndex === -1) return EXTENSION_CONFIG.versions;
  
  return EXTENSION_CONFIG.versions.slice(fromIndex + 1);
}

// Extension health check
export function checkExtensionHealth(extensionInfo?: any): {
  healthy: boolean;
  issues: string[];
  recommendations: string[];
} {
  const issues: string[] = [];
  const recommendations: string[] = [];
  
  // If no extension info provided, assume not connected
  if (!extensionInfo) {
    issues.push('Extension not detected');
    recommendations.push('Make sure the extension is installed and active');
    return {
      healthy: false,
      issues,
      recommendations
    };
  }
  
  if (!extensionInfo.version) {
    issues.push('Extension version not detected');
    recommendations.push('Reinstall the extension');
  }
  
  if (extensionInfo.version && extensionInfo.version !== EXTENSION_CONFIG.latestVersion) {
    issues.push(`Extension outdated (${extensionInfo.version} vs ${EXTENSION_CONFIG.latestVersion})`);
    recommendations.push('Update to the latest version');
  }
  
  if (!extensionInfo.permissions || extensionInfo.permissions.length === 0) {
    issues.push('Extension permissions not granted');
    recommendations.push('Grant necessary permissions in Chrome settings');
  }
  
  return {
    healthy: issues.length === 0,
    issues,
    recommendations
  };
}
