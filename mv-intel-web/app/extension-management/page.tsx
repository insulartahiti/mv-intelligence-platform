'use client';

import React from 'react';
import { Download, Chrome, CheckCircle, ArrowRight, ExternalLink } from 'lucide-react';
import { Button, Card } from '../components/ui/GlassComponents';

export default function ExtensionManagementPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 flex flex-col items-center justify-center">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center">
          <div className="inline-block p-4 rounded-full bg-blue-500/10 mb-4">
            <Chrome className="w-12 h-12 text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
            Install MV Intelligence Extension
          </h1>
          <p className="mt-2 text-gray-400 text-lg">
            Enable deck capture, AI analysis, and seamless Supabase integration.
          </p>
        </div>

        <Card className="p-8 space-y-8 border-white/10 bg-white/5 backdrop-blur-xl">
          
          {/* Step 1 */}
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Download className="w-6 h-6 text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-medium text-white mb-2">1. Download Extension Source</h3>
              <p className="text-gray-400 leading-relaxed">
                Download the latest version of the extension source code.
              </p>
              <div className="mt-4">
                <a 
                  href="/mv-intel-extension.zip" 
                  download="mv-intel-extension.zip"
                  className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Latest ZIP (v1.0.3)
                </a>
              </div>
              <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded text-xs text-yellow-200">
                <strong>Update Note:</strong> If you've already installed the extension via ZIP, you must download this new file, replace your existing files, and then click "Reload" in Chrome.
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <Chrome className="w-6 h-6 text-purple-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-medium text-white mb-2">2. Load in Chrome</h3>
              <ol className="space-y-3 text-gray-400">
                <li className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs">1</span>
                  <span>Go to <code className="bg-slate-800 px-1.5 py-0.5 rounded text-gray-300">chrome://extensions</code></span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs">2</span>
                  <span>Enable <strong>Developer mode</strong> (top right toggle)</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs">3</span>
                  <span>Click <strong>Load unpacked</strong></span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs">4</span>
                  <span>Select the <code className="text-blue-300">chrome-extension</code> folder</span>
                </li>
              </ol>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-medium text-white mb-2">3. Connect & Approve</h3>
              <p className="text-gray-400 leading-relaxed mb-4">
                Return to the dashboard. The status should change to "Active".
                <br />
                Then click the <strong>"Connect & Approve"</strong> button to sync your session.
              </p>
              
              <div className="flex items-center gap-3">
                <Button variant="primary" onClick={() => window.location.href = '/'}>
                  Return to Dashboard <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <Button 
                  variant="secondary" 
                  onClick={() => {
                    navigator.clipboard.writeText('chrome://extensions');
                    alert('Copied "chrome://extensions" to clipboard! Paste it in a new tab to manage extensions.');
                  }}
                >
                  Copy chrome://extensions <ExternalLink className="w-3 h-3 ml-2" />
                </Button>
              </div>
            </div>
          </div>

        </Card>
      </div>
    </div>
  );
}

