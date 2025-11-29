'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/app/components/ui/DashboardLayout';

export default function ExtensionTestPage() {
  const [extensionStatus, setExtensionStatus] = useState<string>('Checking...');
  const [testResults, setTestResults] = useState<any[]>([]);

  useEffect(() => {
    testExtensionConnection();
  }, []);

  const testExtensionConnection = async () => {
    const results = [];
    
    // Test 1: Check if Chrome runtime is available
    results.push({
      test: 'Chrome Runtime Available',
      result: typeof chrome !== 'undefined' && !!chrome.runtime,
      details: typeof chrome !== 'undefined' ? 'Chrome runtime found' : 'Chrome runtime not available'
    });

    // Test 2: Try to ping the extension
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ type: 'WEB_APP_PING' }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(response);
          });
        });
        
        results.push({
          test: 'Extension Ping',
          result: !!response,
          details: response ? `Response: ${JSON.stringify(response)}` : 'No response'
        });
      } catch (error) {
        results.push({
          test: 'Extension Ping',
          result: false,
          details: `Error: ${error.message}`
        });
      }
    }

    // Test 3: Check extension status
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'PING' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        });
      });
      
      results.push({
        test: 'Extension Status',
        result: !!response,
        details: response ? `Status: ${JSON.stringify(response)}` : 'No status response'
      });
    } catch (error) {
      results.push({
        test: 'Extension Status',
        result: false,
        details: `Error: ${error.message}`
      });
    }

    setTestResults(results);
    
    const connected = results.every(r => r.result);
    setExtensionStatus(connected ? 'Connected' : 'Not Connected');
  };

  return (
    <DashboardLayout title="Extension Test">
      <div className="p-6">
        <h1 className="text-2xl font-bold text-white mb-6">Extension Integration Test</h1>
        
        <div className="mb-6">
          <div className={`p-4 rounded-lg ${extensionStatus === 'Connected' ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
            <h2 className="text-lg font-semibold">Extension Status: {extensionStatus}</h2>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-white">Test Results</h2>
          {testResults.map((result, index) => (
            <div key={index} className={`p-4 rounded-lg ${result.result ? 'bg-green-900/20 border border-green-500/30' : 'bg-red-900/20 border border-red-500/30'}`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-white">{result.test}</h3>
                <span className={`px-2 py-1 rounded text-sm ${result.result ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                  {result.result ? 'PASS' : 'FAIL'}
                </span>
              </div>
              <p className="text-sm text-gray-300">{result.details}</p>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <button 
            onClick={testExtensionConnection}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Run Tests Again
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}