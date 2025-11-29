'use client';

import React, { useState, useEffect } from 'react';

interface ImportProgress {
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  current_step: string;
  progress_percentage: number;
  organizations_processed: number;
  contacts_processed: number;
  errors: string[];
  results?: {
    organizations: any[];
    contacts: any[];
    total_organizations: number;
    total_contacts: number;
  };
}

interface EntityImportWidgetProps {
  onImportComplete?: (results: any) => void;
}

export default function EntityImportWidget({ onImportComplete }: EntityImportWidgetProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [importId, setImportId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [settings, setSettings] = useState({
    list_name: 'Motive Ventures Pipeline',
    limit: 25,
    batch_size: 5,
    include_contacts: true,
    intelligent_filtering: true
  });

  // Poll for progress updates
  useEffect(() => {
    if (!importId || !isImporting) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/affinity/import-entities?import_id=${importId}`);
        const data = await response.json();
        
        if (data.status === 'success') {
          setProgress(data.progress);
          
          if (data.progress.status === 'completed' || data.progress.status === 'failed') {
            setIsImporting(false);
            if (data.progress.status === 'completed' && onImportComplete) {
              onImportComplete(data.progress.results);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching progress:', error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [importId, isImporting, onImportComplete]);

  const startImport = async () => {
    try {
      setIsImporting(true);
      setProgress(null);
      
      const response = await fetch('/api/affinity/import-entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      
      const data = await response.json();
      
      if (data.status === 'success') {
        setImportId(data.import_id);
      } else {
        throw new Error(data.message || 'Failed to start import');
      }
    } catch (error) {
      console.error('Error starting import:', error);
      setIsImporting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-400';
      case 'failed': return 'text-red-400';
      case 'in_progress': return 'text-blue-400';
      default: return 'text-yellow-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return '✅';
      case 'failed': return '❌';
      case 'in_progress': return '🔄';
      default: return '⏳';
    }
  };

  return (
    <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-6">
      <h2 className="text-xl font-semibold mb-4">Entity Import from Affinity</h2>
      
      {/* Settings */}
      <div className="mb-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              List Name
            </label>
            <input
              type="text"
              value={settings.list_name}
              onChange={(e) => setSettings({...settings, list_name: e.target.value})}
              className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white"
              disabled={isImporting}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Limit
            </label>
            <input
              type="number"
              value={settings.limit}
              onChange={(e) => setSettings({...settings, limit: parseInt(e.target.value)})}
              className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white"
              disabled={isImporting}
              min="1"
              max="100"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Batch Size
            </label>
            <input
              type="number"
              value={settings.batch_size}
              onChange={(e) => setSettings({...settings, batch_size: parseInt(e.target.value)})}
              className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white"
              disabled={isImporting}
              min="1"
              max="20"
            />
          </div>
          
          <div className="flex items-center space-x-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={settings.include_contacts}
                onChange={(e) => setSettings({...settings, include_contacts: e.target.checked})}
                className="mr-2"
                disabled={isImporting}
              />
              <span className="text-sm text-neutral-300">Include Contacts</span>
            </label>
            
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={settings.intelligent_filtering}
                onChange={(e) => setSettings({...settings, intelligent_filtering: e.target.checked})}
                className="mr-2"
                disabled={isImporting}
              />
              <span className="text-sm text-neutral-300">Intelligent Filtering</span>
            </label>
          </div>
        </div>
      </div>

      {/* Import Button */}
      <div className="mb-6">
        <button
          onClick={startImport}
          disabled={isImporting}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-700 rounded-lg font-medium text-white transition-colors"
        >
          {isImporting ? 'Importing...' : 'Start Import'}
        </button>
      </div>

      {/* Progress Display */}
      {progress && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-lg">{getStatusIcon(progress.status)}</span>
              <span className={`font-medium ${getStatusColor(progress.status)}`}>
                {progress.current_step}
              </span>
            </div>
            <span className="text-sm text-neutral-400">
              {progress.progress_percentage}%
            </span>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-neutral-800 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress.progress_percentage}%` }}
            />
          </div>
          
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="bg-neutral-800 p-3 rounded-lg">
              <div className="text-neutral-400">Organizations</div>
              <div className="text-white font-medium">
                {progress.organizations_processed}
                {progress.results && ` / ${progress.results.total_organizations}`}
              </div>
            </div>
            
            <div className="bg-neutral-800 p-3 rounded-lg">
              <div className="text-neutral-400">Contacts</div>
              <div className="text-white font-medium">
                {progress.contacts_processed}
                {progress.results && ` / ${progress.results.total_contacts}`}
              </div>
            </div>
            
            <div className="bg-neutral-800 p-3 rounded-lg">
              <div className="text-neutral-400">Status</div>
              <div className={`font-medium ${getStatusColor(progress.status)}`}>
                {progress.status}
              </div>
            </div>
            
            <div className="bg-neutral-800 p-3 rounded-lg">
              <div className="text-neutral-400">Errors</div>
              <div className="text-white font-medium">
                {progress.errors.length}
              </div>
            </div>
          </div>
          
          {/* Errors */}
          {progress.errors.length > 0 && (
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
              <h4 className="text-red-400 font-medium mb-2">Errors ({progress.errors.length})</h4>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {progress.errors.map((error, index) => (
                  <div key={index} className="text-sm text-red-300">
                    {error}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Results Summary */}
          {progress.status === 'completed' && progress.results && (
            <div className="bg-green-900/20 border border-green-800 rounded-lg p-4">
              <h4 className="text-green-400 font-medium mb-2">Import Completed Successfully!</h4>
              <div className="text-sm text-green-300">
                <p>✅ {progress.results.organizations.length} organizations imported</p>
                <p>✅ {progress.results.contacts.length} contacts imported</p>
                <p>✅ {progress.errors.length} errors encountered</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


