'use client';

export default function TestDeckCapture() {
  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text-primary">Deck Capture Testing</h1>
        <p className="text-text-secondary">Test the Chrome extension integration with real deck platforms</p>
      </header>

      {/* Chrome Extension Instructions */}
      <div className="card">
        <h2 className="text-lg font-medium text-text-primary mb-4">Chrome Extension Setup</h2>
        
        <div className="space-y-3 text-sm text-text-secondary">
          <div className="flex items-start gap-2">
            <span className="text-intent-positive">1.</span>
            <span>Go to <code className="bg-surface px-2 py-1 rounded">chrome://extensions/</code></span>
          </div>
          
          <div className="flex items-start gap-2">
            <span className="text-intent-positive">2.</span>
            <span>Enable "Developer mode" (toggle in top right)</span>
          </div>
          
          <div className="flex items-start gap-2">
            <span className="text-intent-positive">3.</span>
            <span>Click "Load unpacked" and select the <code className="bg-surface px-2 py-1 rounded">mv-intel-extension</code> folder</span>
          </div>
          
          <div className="flex items-start gap-2">
            <span className="text-intent-positive">4.</span>
            <span>Navigate to a supported platform (DocSend, Figma, Pitch, Notion)</span>
          </div>
          
          <div className="flex items-start gap-2">
            <span className="text-intent-positive">5.</span>
            <span>Use <code className="bg-surface px-2 py-1 rounded">Ctrl+Shift+Y</code> or click the extension icon to capture</span>
          </div>
        </div>
      </div>

      {/* Real Testing Steps */}
      <div className="card">
        <h2 className="text-lg font-medium text-text-primary mb-4">Real Testing Steps</h2>
        
        <div className="space-y-4">
          <div className="bg-surface border border-border rounded-md p-4">
            <h3 className="font-medium text-text-primary mb-2">1. Load Extension</h3>
            <p className="text-sm text-text-secondary">Load the Chrome extension from the mv-intel-extension folder</p>
          </div>
          
          <div className="bg-surface border border-border rounded-md p-4">
            <h3 className="font-medium text-text-primary mb-2">2. Test with Real Platform</h3>
            <p className="text-sm text-text-secondary">Navigate to an actual DocSend, Figma, Pitch, or Notion presentation</p>
          </div>
          
          <div className="bg-surface border border-border rounded-md p-4">
            <h3 className="font-medium text-text-primary mb-2">3. Execute Capture</h3>
            <p className="text-sm text-text-secondary">Use the extension to capture slides and test the real pipeline</p>
          </div>
          
          <div className="bg-surface border border-border rounded-md p-4">
            <h3 className="font-medium text-text-primary mb-2">4. Check Console</h3>
            <p className="text-sm text-text-secondary">Monitor browser console and network tab for real API calls</p>
          </div>
        </div>
      </div>

      {/* Supported Platforms */}
      <div className="card">
        <h2 className="text-lg font-medium text-text-primary mb-4">Supported Platforms</h2>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { name: 'DocSend', url: 'https://docsend.com', icon: '📄', description: 'Document sharing platform' },
            { name: 'Figma', url: 'https://figma.com', icon: '🎨', description: 'Design and prototyping' },
            { name: 'Pitch', url: 'https://pitch.com', icon: '📊', description: 'Presentation software' },
            { name: 'Notion', url: 'https://notion.so', icon: '📝', description: 'Workspace and docs' }
          ].map((platform) => (
            <a
              key={platform.name}
              href={platform.url}
              target="_blank"
              rel="noopener noreferrer"
              className="card hover:shadow-lg transition-shadow duration-fast text-center"
            >
              <div className="text-2xl mb-2">{platform.icon}</div>
              <div className="font-medium text-text-primary">{platform.name}</div>
              <div className="text-xs text-text-muted mt-1">{platform.description}</div>
            </a>
          ))}
        </div>
      </div>

      {/* Extension Features */}
      <div className="card">
        <h2 className="text-lg font-medium text-text-primary mb-4">Extension Features</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h3 className="font-medium text-text-primary">Capture Pipeline</h3>
            <ul className="text-sm text-text-secondary space-y-1">
              <li>• Automatic slide detection</li>
              <li>• Image capture and processing</li>
              <li>• PDF compilation</li>
              <li>• Supabase storage integration</li>
            </ul>
          </div>
          
          <div className="space-y-2">
            <h3 className="font-medium text-text-primary">Platform Support</h3>
            <ul className="text-sm text-text-secondary space-y-1">
              <li>• DocSend: Passcode/email gates</li>
              <li>• Figma: Arrow key navigation</li>
              <li>• Pitch: Next button detection</li>
              <li>• Notion: Scroll-based navigation</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
