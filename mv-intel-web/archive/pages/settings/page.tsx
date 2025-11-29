'use client';
import { useState, useEffect } from 'react';
import { DashboardLayout } from '../components/ui/DashboardLayout';
import { Button, Card, StatusBadge } from '../components/ui/GlassComponents';
import { Download, Chrome, Settings, RefreshCw, AlertCircle, CheckCircle, Shield, Smartphone, Database } from 'lucide-react';
import { EXTENSION_CONFIG, checkExtensionHealth } from '../../lib/extensionConfig';

export default function SettingsPage() {
  const [extensionStatus, setExtensionStatus] = useState<any>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [activeTab, setActiveTab] = useState('extension');

  useEffect(() => {
    checkExtensionStatus();
  }, []);

  const checkExtensionStatus = async () => {
    setIsChecking(true);
    try {
      // Try to detect extension presence
      const extensionData = localStorage.getItem('mv-extension-data');
      const extensionInfo = extensionData ? JSON.parse(extensionData) : null;
      
      const health = await checkExtensionHealth(extensionInfo);
      setExtensionStatus(health);
    } catch (error) {
      console.error('Failed to check extension status:', error);
      setExtensionStatus({ healthy: false, issues: ['Failed to check status'] });
    } finally {
      setIsChecking(false);
    }
  };

  const tabs = [
    { id: 'extension', label: 'Extension', icon: Chrome },
    { id: 'pwa', label: 'PWA', icon: Smartphone },
    { id: 'system', label: 'System', icon: Settings },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
          <p className="text-white/70">Manage your MV Intelligence Platform configuration</p>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 mb-6">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'bg-white/20 text-white border border-white/30'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Extension Tab */}
        {activeTab === 'extension' && (
          <div className="space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white">Chrome Extension</h2>
                <Button
                  onClick={checkExtensionStatus}
                  disabled={isChecking}
                  className="flex items-center space-x-2"
                >
                  <RefreshCw size={16} className={isChecking ? 'animate-spin' : ''} />
                  <span>{isChecking ? 'Checking...' : 'Check Status'}</span>
                </Button>
              </div>

              {extensionStatus && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center space-x-2 mb-2">
                      <StatusBadge 
                        status={extensionStatus.healthy ? 'success' : 'error'} 
                        text={extensionStatus.healthy ? 'Healthy' : 'Issues Found'} 
                      />
                    </div>
                    <p className="text-white/80 text-sm">
                      Extension ID: {EXTENSION_CONFIG.extensionId}
                    </p>
                    <p className="text-white/80 text-sm">
                      Version: {EXTENSION_CONFIG.currentVersion}
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <h4 className="font-medium text-white mb-2">Quick Actions</h4>
                    <div className="space-y-2">
                      <Button size="sm" className="w-full justify-start">
                        <Download size={16} />
                        <span>Download Extension</span>
                      </Button>
                      <Button size="sm" variant="outline" className="w-full justify-start">
                        <Chrome size={16} />
                        <span>Install Instructions</span>
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {extensionStatus?.issues && extensionStatus.issues.length > 0 && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                  <h4 className="font-medium text-red-400 mb-2">Issues Found</h4>
                  <ul className="space-y-1">
                    {extensionStatus.issues.map((issue: string, index: number) => (
                      <li key={index} className="text-red-300 text-sm flex items-center space-x-2">
                        <AlertCircle size={16} />
                        <span>{issue}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {extensionStatus?.recommendations && extensionStatus.recommendations.length > 0 && (
                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <h4 className="font-medium text-blue-400 mb-2">Recommendations</h4>
                  <ul className="space-y-1">
                    {extensionStatus.recommendations.map((rec: string, index: number) => (
                      <li key={index} className="text-blue-300 text-sm flex items-center space-x-2">
                        <CheckCircle size={16} />
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            <Card className="p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Extension Features</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {EXTENSION_CONFIG.features.map((feature, index) => (
                  <div key={index} className="p-3 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center space-x-2">
                      <CheckCircle size={16} className="text-green-400" />
                      <span className="text-white/90 text-sm">{feature.name}</span>
                    </div>
                    <p className="text-white/70 text-xs mt-1">{feature.description}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* PWA Tab */}
        {activeTab === 'pwa' && (
          <div className="space-y-6">
            <Card className="p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Progressive Web App</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                  <h4 className="font-medium text-white mb-2">Installation</h4>
                  <p className="text-white/70 text-sm mb-3">
                    Install MV Intelligence as a native app on your device
                  </p>
                  <Button size="sm" className="w-full">
                    <Smartphone size={16} />
                    <span>Install PWA</span>
                  </Button>
                </div>

                <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                  <h4 className="font-medium text-white mb-2">PWA Status</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-white/70 text-sm">Service Worker:</span>
                      <StatusBadge status="success" text="Active" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/70 text-sm">Offline Support:</span>
                      <StatusBadge status="success" text="Enabled" />
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* PWA Test Section */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-white mb-4">PWA Testing</h3>
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                  <h4 className="font-medium text-white mb-2">Service Worker Test</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-white/70 text-sm">Registration Status:</span>
                      <span className="text-green-400 text-sm">✓ Active</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/70 text-sm">Update Available:</span>
                      <span className="text-yellow-400 text-sm">Checking...</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                  <h4 className="font-medium text-white mb-2">Installation Test</h4>
                  <p className="text-white/70 text-sm mb-3">
                    Test PWA installation and offline functionality
                  </p>
                  <div className="flex space-x-2">
                    <Button size="sm" variant="outline">
                      Test Offline
                    </Button>
                    <Button size="sm" variant="outline">
                      Check Updates
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* System Tab */}
        {activeTab === 'system' && (
          <div className="space-y-6">
            <Card className="p-6">
              <h2 className="text-xl font-semibold text-white mb-4">System Configuration</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                  <h4 className="font-medium text-white mb-2">Database</h4>
                  <div className="flex items-center space-x-2 mb-2">
                    <Database size={16} className="text-blue-400" />
                    <span className="text-white/90">Supabase</span>
                  </div>
                  <p className="text-white/70 text-sm">PostgreSQL with real-time subscriptions</p>
                </div>

                <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                  <h4 className="font-medium text-white mb-2">Security</h4>
                  <div className="flex items-center space-x-2 mb-2">
                    <Shield size={16} className="text-green-400" />
                    <span className="text-white/90">Row Level Security</span>
                  </div>
                  <p className="text-white/70 text-sm">JWT-based authentication with RLS</p>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

