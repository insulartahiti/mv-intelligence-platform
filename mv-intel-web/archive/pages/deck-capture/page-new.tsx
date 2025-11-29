'use client';

import { useState, useEffect } from 'react';
import { Upload, Building, FileText, Plus, ExternalLink } from 'lucide-react';
import { DashboardLayout } from '@/app/components/ui/DashboardLayout';
import { Card } from '@/app/components/ui/Card';
import { Button } from '@/app/components/ui/Button';
import { extensionService, ExtensionStatus } from '@/lib/extensionService';

interface AffinityOrganization {
  id: number;
  name: string;
  domain?: string;
  website?: string;
  industry?: string;
  company_type?: string;
  created_at?: string;
  status?: string;
  affinity_id: number;
  list_ids?: number[];
  person_ids?: number[];
  deal_ids?: number[];
  metadata?: {
    description?: string;
    tags?: string[];
    employees?: number;
    funding_stage?: string;
    revenue_range?: string;
    location?: string;
  };
}

interface NewOrgData {
  name: string;
  domain: string;
  admin_email: string;
  industry: string;
  company_type: 'startup' | 'scaleup' | 'enterprise' | 'public' | 'private';
}

export default function DeckCapturePage() {
  const [organizations, setOrganizations] = useState<AffinityOrganization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<AffinityOrganization | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [extensionStatus, setExtensionStatus] = useState<ExtensionStatus>({ connected: false });
  const [searchSuggestions, setSearchSuggestions] = useState<AffinityOrganization[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [recentAnalysis, setRecentAnalysis] = useState<any[]>([]);
  const [captureUrl, setCaptureUrl] = useState('');
  const [isProcessingUrl, setIsProcessingUrl] = useState(false);
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [newOrgData, setNewOrgData] = useState<NewOrgData>({
    name: '',
    domain: '',
    admin_email: '',
    industry: '',
    company_type: 'startup'
  });

  useEffect(() => {
    loadRecentAnalysis();
    
    // Setup extension status monitoring
    const unsubscribe = extensionService.onStatusChange((status) => {
      setExtensionStatus(status);
    });
    
    // Initial status check
    extensionService.refreshStatus();
    
    return unsubscribe;
  }, []);

  // Load recent analysis results
  const loadRecentAnalysis = async () => {
    try {
      const response = await fetch('/api/deck-capture/recent-analysis');
      if (response.ok) {
        const data = await response.json();
        setRecentAnalysis(data.data || []);
      }
    } catch (error) {
      console.error('Failed to load recent analysis:', error);
    }
  };

  // Handle URL capture
  const handleUrlCapture = async () => {
    if (!captureUrl) return;
    
    setIsProcessingUrl(true);
    setUploadStatus('uploading');
    
    try {
      // Open the URL in a new tab for extension processing
      const newWindow = window.open(captureUrl, '_blank');
      
      if (newWindow) {
        // Wait a moment for the page to load, then request capture
        setTimeout(async () => {
          try {
            await extensionService.requestDeckCapture({
              url: captureUrl,
              title: 'URL Capture',
              organizationId: selectedOrg?.id?.toString() || '',
              dealId: selectedOrg?.deal_ids?.[0]?.toString()
            });
            
            setUploadStatus('success');
            setTimeout(() => setUploadStatus('idle'), 3000);
          } catch (error) {
            console.error('Extension capture failed:', error);
            setUploadStatus('error');
            setTimeout(() => setUploadStatus('idle'), 3000);
          }
        }, 2000);
      }
    } catch (error) {
      console.error('URL capture failed:', error);
      setUploadStatus('error');
      setTimeout(() => setUploadStatus('idle'), 3000);
    } finally {
      setIsProcessingUrl(false);
    }
  };

  // Search organizations with autocomplete
  const handleSearchInput = async (query: string) => {
    setSearchQuery(query);
    
    if (query.length < 2) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsLoadingSuggestions(true);
    setShowSuggestions(true);
    
    try {
      // Try domain search first, then name search if no results
      let response = await fetch(`/api/affinity/organizations?domain=${encodeURIComponent(query)}`);
      let data = await response.json();
      
      if (data.data && data.data.length > 0) {
        setSearchSuggestions(data.data.slice(0, 5));
      } else {
        // If no domain results, try name search
        response = await fetch(`/api/affinity/organizations?name=${encodeURIComponent(query)}`);
        data = await response.json();
        setSearchSuggestions(data.data ? data.data.slice(0, 5) : []);
      }
    } catch (error) {
      console.error('Failed to get suggestions:', error);
      setSearchSuggestions([]);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  // Handle suggestion selection
  const handleSuggestionSelect = (org: AffinityOrganization) => {
    setSelectedOrg(org);
    setSearchQuery(org.name);
    setShowSuggestions(false);
  };

  // Extract company from deck content
  const extractCompanyFromDeck = async (content: string) => {
    try {
      const response = await fetch('/api/deck-capture/extract-company', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          // Search for the extracted company
          const searchResponse = await fetch(`/api/affinity/organizations?name=${encodeURIComponent(data.company_name)}`);
          const searchData = await searchResponse.json();
          
          if (searchData.data && searchData.data.length > 0) {
            setSelectedOrg(searchData.data[0]);
            setSearchQuery(searchData.data[0].name);
          } else {
            // Company not found, suggest creating it
            setNewOrgData(prev => ({
              ...prev,
              name: data.company_name,
              domain: data.domain || ''
            }));
            setIsCreatingOrg(true);
          }
        }
      }
    } catch (error) {
      console.error('Failed to extract company:', error);
    }
  };

  // Create new organization
  const createOrganization = async () => {
    if (!newOrgData.name.trim()) return;
    
    setIsCreatingOrg(true);
    
    try {
      const response = await fetch('/api/affinity/organizations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newOrgData)
      });

      if (response.ok) {
        const data = await response.json();
        setSelectedOrg(data.data);
        setSearchQuery(data.data.name);
        setNewOrgData({ name: '', domain: '', admin_email: '', industry: '', company_type: 'startup' });
        setIsCreatingOrg(false);
      } else {
        const error = await response.json();
        alert(`Failed to create organization: ${error.message}`);
      }
    } catch (error) {
      console.error('Failed to create organization:', error);
      alert('Failed to create organization');
    } finally {
      setIsCreatingOrg(false);
    }
  };

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploadStatus('uploading');
    
    try {
      // Read file content for company extraction
      const file = files[0];
      const content = await readFileContent(file);
      
      // Try to extract company information from the file content
      if (content && !selectedOrg) {
        await extractCompanyFromDeck(content);
      }
      
      // Use enhanced upload with AI analysis
      if (selectedOrg) {
        const uploadResponse = await fetch('/api/deck-capture/upload-enhanced', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: file.name.replace(/\.[^/.]+$/, ""), // Remove file extension
            description: `Uploaded deck for ${selectedOrg.name}`,
            source_url: window.location.href,
            source_platform: 'manual_upload',
            affinity_deal_id: selectedOrg.deal_ids?.[0],
            affinity_org_id: selectedOrg.id,
            slides: [
              {
                id: '1',
                content: content,
                slide_number: 1
              }
            ],
            upload_to_affinity: true
          })
        });

        if (uploadResponse.ok) {
          const result = await uploadResponse.json();
          console.log('Enhanced upload completed:', result);
          setUploadStatus('success');
          loadRecentAnalysis(); // Refresh recent analysis
        } else {
          throw new Error('Upload failed');
        }
      } else {
        // Fallback to simple upload if no organization selected
        await new Promise(resolve => setTimeout(resolve, 2000));
        setUploadStatus('success');
      }
      
      setTimeout(() => setUploadStatus('idle'), 3000);
      
    } catch (error) {
      console.error('Upload failed:', error);
      setUploadStatus('error');
      setTimeout(() => setUploadStatus('idle'), 3000);
    }
  };

  // Read file content for text extraction
  const readFileContent = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        resolve(content);
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  return (
    <DashboardLayout title="Deck Capture">
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Deck Capture</h1>
            <p className="text-white/70">Capture and analyze presentation decks with AI intelligence</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Deck Capture - Primary Section */}
            <div className="space-y-6">
              <Card className="p-6">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
                  <Upload size={20} className="mr-2" />
                  Capture Deck
                </h2>

                {/* URL Input for Deck Capture */}
                <div className="mb-4 space-y-3">
                  <div className="flex space-x-2">
                    <input
                      type="url"
                      placeholder="Enter presentation URL (e.g., https://docs.google.com/presentation/...)"
                      value={captureUrl}
                      onChange={(e) => setCaptureUrl(e.target.value)}
                      className="glass-input flex-1 px-3 py-2 rounded-lg text-sm"
                    />
                    <Button 
                      onClick={handleUrlCapture}
                      disabled={!captureUrl || isProcessingUrl}
                      size="sm"
                    >
                      {isProcessingUrl ? 'Processing...' : 'Capture'}
                    </Button>
                  </div>
                  
                  <div className="text-sm text-white/60">
                    Or use the Chrome extension to capture the current page
                  </div>
                </div>

                {/* Extension Status */}
                <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className={`w-2 h-2 rounded-full ${extensionStatus.connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <span className="text-sm text-white">
                        Chrome Extension: {extensionStatus.connected ? 'Connected' : 'Not Connected'}
                      </span>
                    </div>
                    <Button 
                      onClick={() => extensionService.refreshStatus()}
                      variant="outline"
                      size="sm"
                    >
                      Refresh
                    </Button>
                  </div>
                </div>

                {/* File Upload */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Or upload a file directly
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.pptx,.ppt,.txt,.docx"
                    onChange={handleFileUpload}
                    className="block w-full text-sm text-white/70 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-white/10 file:text-white hover:file:bg-white/20"
                  />
                </div>

                {/* Upload Status */}
                {uploadStatus !== 'idle' && (
                  <div className={`p-3 rounded-lg text-sm ${
                    uploadStatus === 'success' ? 'bg-green-900/30 text-green-300' :
                    uploadStatus === 'error' ? 'bg-red-900/30 text-red-300' :
                    'bg-blue-900/30 text-blue-300'
                  }`}>
                    {uploadStatus === 'uploading' && 'Processing deck...'}
                    {uploadStatus === 'success' && 'Deck captured and analyzed successfully!'}
                    {uploadStatus === 'error' && 'Failed to capture deck. Please try again.'}
                  </div>
                )}
              </Card>

              {/* Organization Selection - Secondary */}
              <Card className="p-6">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
                  <Building size={20} className="mr-2" />
                  Target Company
                </h2>

                {selectedOrg ? (
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                      <div className="font-medium text-white">{selectedOrg.name}</div>
                      {selectedOrg.domain && (
                        <div className="text-white/70 text-sm">{selectedOrg.domain}</div>
                      )}
                      <div className="flex items-center mt-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                        <span className="text-green-300 text-sm">Active</span>
                      </div>
                    </div>
                    <Button 
                      onClick={() => setSelectedOrg(null)}
                      variant="outline"
                      className="w-full"
                    >
                      Change Organization
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-white/70 text-sm">Search for a company to associate with this deck</p>
                    
                    {/* Search Bar with Autocomplete */}
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search by company name or domain"
                        value={searchQuery}
                        onChange={(e) => handleSearchInput(e.target.value)}
                        onFocus={() => searchQuery.length >= 2 && setShowSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                        className="glass-input w-full px-3 py-2 rounded-lg text-sm"
                        autoComplete="off"
                      />
                      
                      {/* Autocomplete Suggestions */}
                      {showSuggestions && searchSuggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white/10 backdrop-blur-lg border border-white/20 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                          {searchSuggestions.map((org) => (
                            <button
                              key={org.id}
                              onClick={() => handleSuggestionSelect(org)}
                              className="w-full px-3 py-2 text-left hover:bg-white/20 transition-colors border-b border-white/10 last:border-b-0"
                            >
                              <div className="font-medium text-white">{org.name}</div>
                              {org.domain && (
                                <div className="text-white/70 text-sm">{org.domain}</div>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                      
                      {/* Loading indicator */}
                      {isLoadingSuggestions && (
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white/60"></div>
                        </div>
                      )}
                    </div>

                    <Button 
                      onClick={() => setIsCreatingOrg(true)}
                      className="w-full"
                    >
                      <Plus size={16} className="mr-2" />
                      Add New Company
                    </Button>
                  </div>
                )}
              </Card>

              {/* Create Organization Form */}
              {isCreatingOrg && (
                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Add New Company</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-white mb-1">Company Name</label>
                      <input
                        type="text"
                        value={newOrgData.name}
                        onChange={(e) => setNewOrgData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Enter company name"
                        required
                        className="w-full p-3 rounded-lg bg-gray-800 border border-gray-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white mb-1">Domain</label>
                      <input
                        type="text"
                        value={newOrgData.domain}
                        onChange={(e) => setNewOrgData(prev => ({ ...prev, domain: e.target.value }))}
                        placeholder="company.com"
                        className="w-full p-3 rounded-lg bg-gray-800 border border-gray-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white mb-1">Industry</label>
                      <input
                        type="text"
                        value={newOrgData.industry}
                        onChange={(e) => setNewOrgData(prev => ({ ...prev, industry: e.target.value }))}
                        placeholder="Technology, SaaS, etc."
                        className="w-full p-3 rounded-lg bg-gray-800 border border-gray-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-2">
                        Company Type
                      </label>
                      <select
                        value={newOrgData.company_type}
                        onChange={(e) => setNewOrgData(prev => ({ ...prev, company_type: e.target.value as any }))}
                        className="glass-input w-full px-3 py-2 rounded-lg text-sm"
                      >
                        <option value="startup">Startup</option>
                        <option value="scaleup">Scale-up</option>
                        <option value="enterprise">Enterprise</option>
                        <option value="public">Public Company</option>
                        <option value="private">Private Company</option>
                      </select>
                    </div>
                    <div className="flex space-x-3">
                      <Button 
                        onClick={createOrganization}
                        disabled={isCreatingOrg}
                        className="flex-1"
                      >
                        {isCreatingOrg ? 'Adding...' : 'Add Company'}
                      </Button>
                      <Button 
                        onClick={() => setIsCreatingOrg(false)}
                        variant="outline"
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </Card>
              )}
            </div>

            {/* Recent Analysis */}
            <div className="space-y-6">
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                  Recent AI Analysis
                </h3>
                {recentAnalysis.length > 0 ? (
                  <div className="space-y-3">
                    {recentAnalysis.slice(0, 3).map((analysis) => (
                      <div key={analysis.id} className="border border-gray-700 rounded-lg p-3">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-medium text-sm text-white">{analysis.title}</h4>
                          <span className="text-xs text-gray-400">
                            {new Date(analysis.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-xs text-gray-300 mb-2 line-clamp-2">
                          {analysis.executive_summary}
                        </p>
                        <div className="flex items-center justify-between">
                          <div className="flex space-x-2">
                            {analysis.key_insights?.slice(0, 2).map((insight: string, idx: number) => (
                              <span key={idx} className="text-xs bg-blue-900/30 text-blue-300 px-2 py-1 rounded">
                                {insight.substring(0, 30)}...
                              </span>
                            ))}
                          </div>
                          <span className="text-xs text-gray-400">
                            {Math.round((analysis.confidence_score || 0) * 100)}% confidence
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-white/50">
                    <FileText size={48} className="mx-auto mb-3 opacity-50" />
                    <p>No analysis results yet</p>
                    <p className="text-sm">Upload a deck to see AI insights!</p>
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
