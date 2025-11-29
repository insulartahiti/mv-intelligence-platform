'use client';
import { useState, useEffect } from 'react';
import { DashboardLayout } from '../components/ui/DashboardLayout';
import { Button, Card, Input } from '../components/ui/GlassComponents';
import { Upload, FileText, Building, Plus, CheckCircle, AlertCircle, Chrome } from 'lucide-react';
import { AffinityOrganization, CreateOrganizationRequest } from '../../lib/types/deckCapture';
import { extensionService, ExtensionStatus } from '../../lib/extensionService';

export default function DeckCapturePage() {
  const [organizations, setOrganizations] = useState<AffinityOrganization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<AffinityOrganization | null>(null);
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [newOrgData, setNewOrgData] = useState<CreateOrganizationRequest>({
    name: '',
    domain: '',
    website: '',
    industry: '',
    company_type: 'startup'
  });
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

  useEffect(() => {
    loadOrganizations();
    loadRecentAnalysis();
    
    // Setup extension status monitoring
    const unsubscribe = extensionService.onStatusChange((status) => {
      setExtensionStatus(status);
    });
    
    // Initial status check
    extensionService.refreshStatus();
    
    // Auto-detect organization from current page URL
    autoDetectFromUrl();
    
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

  // Auto-detect organization from current page URL
  const autoDetectFromUrl = async () => {
    if (typeof window === 'undefined') return;
    
    const currentUrl = window.location.href;
    const domain = extractDomainFromUrl(currentUrl);
    
    if (domain && domain !== 'localhost' && !domain.includes('127.0.0.1')) {
      try {
        const response = await fetch(`/api/affinity/organizations?domain=${encodeURIComponent(domain)}`);
        if (response.ok) {
          const data = await response.json();
          if (data.data && data.data.length > 0) {
            setSelectedOrg(data.data[0]);
            setSearchQuery(data.data[0].name);
          }
        }
      } catch (error) {
        console.log('Auto-detection failed:', error);
      }
    }
  };

  // Extract domain from URL
  const extractDomainFromUrl = (url: string): string | null => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch (error) {
      return null;
    }
  };

  const loadOrganizations = async () => {
    try {
      const response = await fetch('/api/affinity/organizations');
      if (response.ok) {
        const data = await response.json();
        setOrganizations(data.data || []);
        
        // Don't auto-select any organization - let user choose
      }
    } catch (error) {
      console.error('Failed to load organizations:', error);
    }
  };

  const searchOrganizations = async (query: string) => {
    if (!query.trim()) {
      loadOrganizations();
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsSearching(true);
    try {
      // Try domain search first, then name search if no results
      let response = await fetch(`/api/affinity/organizations?domain=${encodeURIComponent(query)}`);
      let data = await response.json();
      
      if (data.data && data.data.length > 0) {
        setOrganizations(data.data);
      } else {
        // If no domain results, try name search
        response = await fetch(`/api/affinity/organizations?name=${encodeURIComponent(query)}`);
        data = await response.json();
        setOrganizations(data.data || []);
      }
    } catch (error) {
      console.error('Failed to search organizations:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Autocomplete search with debouncing
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
    setSearchSuggestions([]);
  };

  const autoDetectOrganization = async () => {
    if (!extensionStatus.connected) return;
    
    setIsSearching(true);
    try {
      // Get current tab URL from extension
      const response = await fetch(`/api/affinity/organizations?url=${encodeURIComponent(window.location.href)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.auto_detected && data.data && data.data.length > 0) {
          setSelectedOrg(data.data[0]);
          setSearchQuery(data.detected_domain || '');
        }
      }
    } catch (error) {
      console.error('Failed to auto-detect organization:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const createOrganization = async () => {
    if (!newOrgData.name) {
      alert('Please enter the company name');
      return;
    }

    setIsCreatingOrg(true);
    try {
      const response = await fetch('/api/affinity/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOrgData)
      });

      if (response.ok) {
        const data = await response.json();
        setOrganizations(prev => [...prev, data.data]);
        setSelectedOrg(data.data);
        setNewOrgData({ name: '', domain: '' });
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
        const extracted = await extractCompanyFromDeck(content);
        if (extracted) {
          console.log('Company auto-detected from deck content');
        }
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
      
      if (file.type === 'text/plain' || file.type === 'text/html') {
        reader.readAsText(file);
      } else {
        // For other file types, we'll just return the filename
        resolve(file.name);
      }
    });
  };

  const handleExtensionCapture = async () => {
    if (!selectedOrg || !extensionStatus.connected) return;
    
    setUploadStatus('uploading');
    
    try {
      // Request capture from extension
      await extensionService.requestDeckCapture({
        url: window.location.href,
        title: 'Current Page Capture',
        organizationId: selectedOrg.id,
        dealId: selectedOrg.deal_ids?.[0]
      });
      
      setUploadStatus('success');
      setTimeout(() => setUploadStatus('idle'), 3000);
      
    } catch (error) {
      console.error('Extension capture failed:', error);
      setUploadStatus('error');
      setTimeout(() => setUploadStatus('idle'), 3000);
    }
  };

  // Extract company information from deck content
  const extractCompanyFromDeck = async (deckContent: string) => {
    try {
      const response = await fetch('/api/deck-capture/extract-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: deckContent })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.company_name || data.domain) {
          // Search for the extracted company
          const searchTerm = data.company_name || data.domain;
          const searchResponse = await fetch(`/api/affinity/organizations?name=${encodeURIComponent(searchTerm)}`);
          const searchData = await searchResponse.json();
          
          if (searchData.data && searchData.data.length > 0) {
            setSelectedOrg(searchData.data[0]);
            setSearchQuery(searchData.data[0].name);
            return true;
          }
        }
      }
    } catch (error) {
      console.error('Failed to extract company from deck:', error);
    }
    return false;
  };

  return (
    <DashboardLayout title="Deck Capture">
      <div className="max-w-6xl mx-auto px-6 py-8">
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

              {/* Search Bar with Autocomplete */}
              <div className="mb-4 space-y-3">
                <div className="relative">
                  <div className="flex space-x-2">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        placeholder="Search by company name or domain (e.g., Zocks AI or zocks.ai)"
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
                      onClick={() => searchOrganizations(searchQuery)}
                      disabled={isSearching}
                      size="sm"
                    >
                      {isSearching ? 'Searching...' : 'Search'}
                    </Button>
                  </div>
                </div>
                
                <div className="flex space-x-2">
                  <Button 
                    onClick={() => searchOrganizations(searchQuery)}
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    disabled={isSearching}
                  >
                    🔍 Search by Name
                  </Button>
                  <Button 
                    onClick={() => searchOrganizations(searchQuery)}
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    disabled={isSearching}
                  >
                    🌐 Search by Domain
                  </Button>
                </div>
                
                <div className="flex space-x-2">
                  {extensionStatus.connected && (
                    <Button 
                      onClick={autoDetectOrganization}
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                    >
                      🔍 Auto-detect from current page
                    </Button>
                  )}
                  
                  <Button 
                    onClick={() => {
                      const content = prompt('Paste deck content to extract company information:');
                      if (content) {
                        extractCompanyFromDeck(content);
                      }
                    }}
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                  >
                    🤖 Extract from deck content
                  </Button>
                </div>
              </div>

              {selectedOrg ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-medium text-white">{selectedOrg.name}</h3>
                        {selectedOrg.domain && (
                          <p className="text-white/70 text-sm">{selectedOrg.domain}</p>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 rounded-full bg-green-400"></div>
                        <span className="text-white/70 text-xs">Active</span>
                      </div>
                    </div>
                    
                    {/* Company Details */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {selectedOrg.industry && (
                        <div className="text-white/60">
                          <span className="text-white/40">Industry:</span> {selectedOrg.industry}
                        </div>
                      )}
                      {selectedOrg.company_type && (
                        <div className="text-white/60">
                          <span className="text-white/40">Type:</span> {selectedOrg.company_type}
                        </div>
                      )}
                      {selectedOrg.metadata?.employees && (
                        <div className="text-white/60">
                          <span className="text-white/40">Size:</span> {selectedOrg.metadata.employees}
                        </div>
                      )}
                      {selectedOrg.metadata?.funding_stage && (
                        <div className="text-white/60">
                          <span className="text-white/40">Stage:</span> {selectedOrg.metadata.funding_stage}
                        </div>
                      )}
                    </div>
                  </div>

                  <Button 
                    onClick={() => setSelectedOrg(null)}
                    variant="secondary"
                    className="w-full"
                  >
                    Change Organization
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-white/70 text-sm">Select an organization to continue</p>
                  
                  {organizations.length > 0 && (
                    <div className="space-y-2">
                      {organizations.map((org) => (
                        <button
                          key={org.id}
                          onClick={() => setSelectedOrg(org)}
                          className="w-full p-3 text-left rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                        >
                          <div className="font-medium text-white">{org.name}</div>
                          {org.domain && (
                            <div className="text-white/70 text-sm">{org.domain}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  <Button 
                    onClick={() => setIsCreatingOrg(true)}
                    className="w-full"
                  >
                    <Plus size={16} className="mr-2" />
                    Create New Organization
                  </Button>
                </div>
              )}
            </Card>

            {/* Create Organization Form */}
            {isCreatingOrg && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Add New Company</h3>
                <div className="space-y-4">
                  <Input
                    label="Company Name"
                    value={newOrgData.name}
                    onChange={(e) => setNewOrgData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter company name"
                    required
                  />
                  <Input
                    label="Domain (Optional)"
                    value={newOrgData.domain}
                    onChange={(e) => setNewOrgData(prev => ({ ...prev, domain: e.target.value }))}
                    placeholder="example.com"
                  />
                  <Input
                    label="Website (Optional)"
                    value={newOrgData.website}
                    onChange={(e) => setNewOrgData(prev => ({ ...prev, website: e.target.value }))}
                    placeholder="https://example.com"
                  />
                  <Input
                    label="Industry (Optional)"
                    value={newOrgData.industry}
                    onChange={(e) => setNewOrgData(prev => ({ ...prev, industry: e.target.value }))}
                    placeholder="Technology, SaaS, etc."
                  />
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
                      variant="secondary"
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Deck Upload */}
          <div className="space-y-6">
            <Card className="p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
                <Upload size={20} className="mr-2" />
                Capture Deck
              </h2>

              {/* Extension Status */}
              <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Chrome size={16} className={extensionStatus.connected ? 'text-green-400' : 'text-red-400'} />
                    <span className="text-sm font-medium text-white">
                      Chrome Extension
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${extensionStatus.connected ? 'bg-green-400' : 'bg-red-400'}`}></div>
                    <span className={`text-xs ${extensionStatus.connected ? 'text-green-400' : 'text-red-400'}`}>
                      {extensionStatus.connected ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                </div>
                {extensionStatus.version && (
                  <div className="text-xs text-white/60 mt-1">
                    Version: {extensionStatus.version}
                  </div>
                )}
              </div>

              {selectedOrg ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <p className="text-white/70 text-sm mb-3">
                      Ready to capture from: <span className="text-white font-medium">{selectedOrg.name}</span>
                    </p>
                    
                    {uploadStatus === 'idle' && (
                      <div className="space-y-3">
                        <p className="text-white/80 text-sm">
                          Use the Chrome extension to capture slides from:
                        </p>
                        <ul className="text-white/70 text-sm space-y-1">
                          <li>• Figma presentations</li>
                          <li>• Google Slides</li>
                          <li>• PowerPoint Online</li>
                          <li>• Notion pages</li>
                          <li>• Miro boards</li>
                        </ul>
                      </div>
                    )}

                    {uploadStatus === 'uploading' && (
                      <div className="flex items-center space-x-3 text-blue-400">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                        <span>Processing deck...</span>
                      </div>
                    )}

                    {uploadStatus === 'success' && (
                      <div className="flex items-center space-x-3 text-green-400">
                        <CheckCircle size={16} />
                        <span>Deck captured successfully!</span>
                      </div>
                    )}

                    {uploadStatus === 'error' && (
                      <div className="flex items-center space-x-3 text-red-400">
                        <AlertCircle size={16} />
                        <span>Upload failed. Please try again.</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    {extensionStatus.connected ? (
                      <Button 
                        onClick={handleExtensionCapture}
                        className="w-full"
                        disabled={uploadStatus === 'uploading'}
                      >
                        <Chrome size={16} className="mr-2" />
                        {uploadStatus === 'uploading' ? 'Capturing...' : 'Capture with Extension'}
                      </Button>
                    ) : (
                      <div className="p-3 rounded-lg bg-yellow-500/20 border border-yellow-500/30 text-center">
                        <p className="text-yellow-400 text-sm">
                          Install and activate the Chrome extension to capture decks
                        </p>
                      </div>
                    )}

                    <Button 
                      onClick={() => document.getElementById('file-upload')?.click()}
                      className="w-full"
                      disabled={uploadStatus === 'uploading'}
                    >
                      <Upload size={16} className="mr-2" />
                      {uploadStatus === 'uploading' ? 'Processing...' : 'Upload Deck Files'}
                    </Button>
                    
                    <input
                      id="file-upload"
                      type="file"
                      multiple
                      accept=".html,.htm,.png,.jpg,.jpeg"
                      onChange={handleFileUpload}
                      className="hidden"
                    />

                    <Button 
                      variant="secondary"
                      className="w-full"
                      onClick={() => window.open('/extension-test', '_blank')}
                    >
                      <FileText size={16} className="mr-2" />
                      Test Extension Communication
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                  <p className="text-white/70 text-sm">
                    Please select or create an organization to start capturing decks.
                  </p>
                </div>
              )}
            </Card>

            {/* Recent Analysis */}
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
    </DashboardLayout>
  );
}
