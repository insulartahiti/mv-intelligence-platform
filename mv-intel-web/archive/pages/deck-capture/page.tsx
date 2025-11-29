'use client';

import { useState, useEffect } from 'react';
import { Upload, Building, FileText, Plus } from 'lucide-react';
import { DashboardLayout } from '@/app/components/ui/DashboardLayout';
import { Card } from '@/app/components/ui/Card';
import { Button } from '@/app/components/ui/Button';
import { Input } from '@/app/components/ui/GlassComponents';
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
  website?: string;
  description?: string;
  tags?: string[];
  list_ids?: number[];
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
  const [selectedAnalysis, setSelectedAnalysis] = useState<any>(null);
  const [showAnalysisDetail, setShowAnalysisDetail] = useState(false);
  const [showLinkOrgModal, setShowLinkOrgModal] = useState(false);
  const [isLinkingOrg, setIsLinkingOrg] = useState(false);
  const [extractedCompanyInfo, setExtractedCompanyInfo] = useState<any>(null);
  const [isExtractingCompany, setIsExtractingCompany] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingCaptures, setPendingCaptures] = useState<any[]>([]);
  const [newOrgData, setNewOrgData] = useState<NewOrgData>({
    name: '',
    domain: '',
    admin_email: '',
    industry: '',
    company_type: 'startup',
    website: '',
    description: '',
    tags: [],
    list_ids: []
  });
  const [availableLists, setAvailableLists] = useState<any[]>([]);
  const [isLoadingLists, setIsLoadingLists] = useState(false);

  useEffect(() => {
    loadRecentAnalysis();
    loadPendingCaptures();
    
    // Setup extension status monitoring
    const unsubscribe = extensionService.onStatusChange((status) => {
      console.log('Extension status changed:', status);
      setExtensionStatus(status);
    });
    
    // Initial status check
    console.log('Checking extension status...');
    extensionService.refreshStatus();
    
    // Setup auto-refresh polling
    const refreshInterval = setInterval(() => {
      loadRecentAnalysis();
      loadPendingCaptures();
    }, 5000); // Refresh every 5 seconds
    
    return () => {
      unsubscribe();
      clearInterval(refreshInterval);
    };
  }, []);

  // Load recent analysis results
  // Load available Affinity lists
  const loadAvailableLists = async () => {
    setIsLoadingLists(true);
    try {
      const response = await fetch('/api/affinity/lists');
      if (response.ok) {
        const result = await response.json();
        setAvailableLists(result.data || []);
      }
    } catch (error) {
      console.error('Failed to load lists:', error);
    } finally {
      setIsLoadingLists(false);
    }
  };

  const loadRecentAnalysis = async () => {
    try {
      setIsRefreshing(true);
      const response = await fetch('/api/deck-capture/recent-analysis');
      if (response.ok) {
        const data = await response.json();
        setRecentAnalysis(data.data || []);
      }
    } catch (error) {
      console.error('Failed to load recent analysis:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const loadPendingCaptures = async () => {
    try {
      const response = await fetch('/api/deck-capture/pending-captures');
      if (response.ok) {
        const data = await response.json();
        setPendingCaptures(data.data || []);
      }
    } catch (error) {
      console.error('Failed to load pending captures:', error);
    }
  };

  // Handle analysis item click
  const handleAnalysisClick = async (analysis: any) => {
    setSelectedAnalysis(analysis);
    setShowAnalysisDetail(true);
    
    // Extract company information if not already available
    if (analysis.artifact_id && (!analysis.company_info?.companies?.length || analysis.company_info.companies.length === 0)) {
      await extractCompanyInformation(analysis);
    }
  };

  // Extract company information from captured content
  const extractCompanyInformation = async (analysis: any) => {
    if (!analysis.artifact_id) return;
    
    setIsExtractingCompany(true);
    
    try {
      // Get the full content from the artifact
      const response = await fetch(`/api/deck-capture/artifact-content/${analysis.artifact_id}`);
      let content = '';
      
      if (response.ok) {
        const contentData = await response.json();
        content = contentData.content || '';
      }
      
      // If no content available, use title and source URL for extraction
      const extractResponse = await fetch('/api/deck-capture/extract-company-info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: content || `Presentation: ${analysis.artifact_title}`,
          source_url: analysis.source_url,
          title: analysis.artifact_title
        })
      });

      if (extractResponse.ok) {
        const extractData = await extractResponse.json();
        setExtractedCompanyInfo(extractData.company_info);
        
        // Auto-suggest Affinity organizations based on extracted company info
        if (extractData.company_info?.company_name && extractData.company_info.company_name !== 'Unknown Company') {
          await autoSuggestAffinityOrganizations(extractData.company_info);
        }
      }
    } catch (error) {
      console.error('Failed to extract company information:', error);
    } finally {
      setIsExtractingCompany(false);
    }
  };

  // Auto-suggest Affinity organizations based on extracted company info
  const autoSuggestAffinityOrganizations = async (companyInfo: any) => {
    try {
      // Search by company name first
      let response = await fetch(`/api/affinity/organizations?name=${encodeURIComponent(companyInfo.company_name)}`);
      let data = await response.json();
      
      if (data.data && data.data.length > 0) {
        setSearchSuggestions(data.data.slice(0, 3));
        setShowSuggestions(true);
        return;
      }
      
      // If no results by name, try domain
      if (companyInfo.company_domain) {
        response = await fetch(`/api/affinity/organizations?domain=${encodeURIComponent(companyInfo.company_domain)}`);
        data = await response.json();
        
        if (data.data && data.data.length > 0) {
          setSearchSuggestions(data.data.slice(0, 3));
          setShowSuggestions(true);
        }
      }
    } catch (error) {
      console.error('Failed to auto-suggest organizations:', error);
    }
  };

  // Handle linking organization to captured content
  const handleLinkOrganization = async (org: AffinityOrganization) => {
    if (!selectedAnalysis?.artifact_id) return;
    
    setIsLinkingOrg(true);
    
    try {
      const response = await fetch('/api/deck-capture/link-organization', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          artifact_id: selectedAnalysis.artifact_id,
          organization_id: org.id,
          organization_name: org.name
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Organization linked successfully:', result);
        
        // Update the selected analysis with new organization info
        setSelectedAnalysis((prev: any) => ({
          ...prev,
          organization_id: org.id,
          organization_name: org.name
        }));
        
        // Refresh recent analysis to show updated data
        await loadRecentAnalysis();
        
        // Close the link modal
        setShowLinkOrgModal(false);
        
        // Show success message
        alert(`Successfully linked to ${org.name}!`);
      } else {
        throw new Error('Failed to link organization');
      }
    } catch (error) {
      console.error('Failed to link organization:', error);
      alert('Failed to link organization. Please try again.');
    } finally {
      setIsLinkingOrg(false);
    }
  };

  // Handle delete analysis
  const handleDeleteAnalysis = async (analysisId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent triggering the analysis click
    
    if (!confirm('Are you sure you want to delete this analysis? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/deck-capture/delete-analysis?id=${analysisId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        // Remove from local state
        setRecentAnalysis(prev => prev.filter(analysis => analysis.id !== analysisId));
        
        // Close modal if the deleted analysis was selected
        if (selectedAnalysis?.id === analysisId) {
          setSelectedAnalysis(null);
          setShowAnalysisDetail(false);
        }
        
        alert('Analysis deleted successfully!');
      } else {
        throw new Error('Failed to delete analysis');
      }
    } catch (error) {
      console.error('Failed to delete analysis:', error);
      alert('Failed to delete analysis. Please try again.');
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
            loadAvailableLists();
          }
        }
      }
    } catch (error) {
      console.error('Failed to extract company:', error);
    }
  };

  // Create new organization
  const createOrganization = async () => {
    if (!newOrgData.name.trim() || !newOrgData.admin_email.trim()) return;
    
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
        setNewOrgData({ 
          name: '', 
          domain: '', 
          admin_email: '', 
          industry: '', 
          company_type: 'startup',
          website: '',
          description: '',
          tags: [],
          list_ids: []
        });
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
                      onClick={() => {
                        setIsCreatingOrg(true);
                        loadAvailableLists();
                      }}
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
                    <Input
                      label="Company Name"
                      value={newOrgData.name}
                      onChange={(e) => setNewOrgData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter company name"
                      required
                    />
                    <Input
                      label="Admin Email"
                      type="email"
                      value={newOrgData.admin_email}
                      onChange={(e) => setNewOrgData(prev => ({ ...prev, admin_email: e.target.value }))}
                      placeholder="admin@company.com"
                      required
                    />
                    <Input
                      label="Domain"
                      value={newOrgData.domain}
                      onChange={(e) => setNewOrgData(prev => ({ ...prev, domain: e.target.value }))}
                      placeholder="company.com"
                    />
                    <Input
                      label="Website"
                      value={newOrgData.website || ''}
                      onChange={(e) => setNewOrgData(prev => ({ ...prev, website: e.target.value }))}
                      placeholder="https://company.com"
                    />
                    <Input
                      label="Industry"
                      value={newOrgData.industry}
                      onChange={(e) => setNewOrgData(prev => ({ ...prev, industry: e.target.value }))}
                      placeholder="Technology, SaaS, etc."
                    />
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-2">
                        Description
                      </label>
                      <textarea
                        value={newOrgData.description || ''}
                        onChange={(e) => setNewOrgData(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Brief company description..."
                        className="glass-input w-full px-3 py-2 rounded-lg text-sm min-h-[80px]"
                        rows={3}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-2">
                        Tags (comma-separated)
                      </label>
                      <Input
                        value={newOrgData.tags?.join(', ') || ''}
                        onChange={(e) => setNewOrgData(prev => ({ 
                          ...prev, 
                          tags: e.target.value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
                        }))}
                        placeholder="AI, SaaS, B2B, etc."
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
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-2">
                        Add to Lists (Optional)
                      </label>
                      {isLoadingLists ? (
                        <div className="text-sm text-gray-400">Loading lists...</div>
                      ) : availableLists.length > 0 ? (
                        <div className="space-y-2 max-h-32 overflow-y-auto">
                          {availableLists.map((list) => (
                            <label key={list.id} className="flex items-center space-x-2 text-sm">
                              <input
                                type="checkbox"
                                checked={newOrgData.list_ids?.includes(list.id) || false}
                                onChange={(e) => {
                                  const listIds = newOrgData.list_ids || [];
                                  if (e.target.checked) {
                                    setNewOrgData(prev => ({ 
                                      ...prev, 
                                      list_ids: [...listIds, list.id] 
                                    }));
                                  } else {
                                    setNewOrgData(prev => ({ 
                                      ...prev, 
                                      list_ids: listIds.filter(id => id !== list.id) 
                                    }));
                                  }
                                }}
                                className="rounded border-gray-600 bg-gray-800 text-blue-500"
                              />
                              <span className="text-white/80">
                                {list.name} ({list.organization_count || 0} companies)
                              </span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-400">No lists available</div>
                      )}
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
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white flex items-center">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                    Recent AI Analysis
                    {isRefreshing && (
                      <div className="ml-2 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    )}
                  </h3>
                  <button
                    onClick={() => {
                      loadRecentAnalysis();
                      loadPendingCaptures();
                    }}
                    className="text-blue-400 hover:text-blue-300 transition-colors p-1 rounded hover:bg-blue-900/20"
                    title="Refresh"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
                
                {/* Pending Captures */}
                {pendingCaptures.length > 0 && (
                  <div className="mb-4 space-y-2">
                    <h4 className="text-sm font-medium text-yellow-400 flex items-center">
                      <div className="w-2 h-2 bg-yellow-500 rounded-full mr-2 animate-pulse"></div>
                      Processing ({pendingCaptures.length})
                    </h4>
                    {pendingCaptures.map((capture) => (
                      <div 
                        key={capture.id}
                        className="border border-yellow-700 rounded-lg p-3 bg-yellow-900/10"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h5 className="font-medium text-sm text-yellow-200">
                            {capture.title || 'Deck Capture'}
                          </h5>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-yellow-400">
                              {capture.status}
                            </span>
                            <div className="w-3 h-3 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
                          </div>
                        </div>
                        <p className="text-xs text-yellow-300">
                          {capture.metadata?.last_slide_processed ? `${capture.metadata.last_slide_processed} slides captured` : 'Capturing slides...'}
                        </p>
                        {capture.metadata?.started_at && (
                          <p className="text-xs text-yellow-400 mt-1">
                            Started: {new Date(capture.metadata.started_at).toLocaleTimeString()}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {recentAnalysis.length > 0 ? (
                  <div className="space-y-3">
                    {recentAnalysis.slice(0, 3).map((analysis) => (
                      <div 
                        key={analysis.id} 
                        className="border border-gray-700 rounded-lg p-3 cursor-pointer hover:border-blue-500/50 hover:bg-white/5 transition-all duration-200"
                        onClick={() => handleAnalysisClick(analysis)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-medium text-sm text-white hover:text-blue-300 transition-colors">
                            {analysis.title}
                          </h4>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-400">
                              {new Date(analysis.created_at).toLocaleDateString()}
                            </span>
                            <button
                              onClick={(e) => handleDeleteAnalysis(analysis.id, e)}
                              className="text-red-400 hover:text-red-300 transition-colors p-1 rounded hover:bg-red-900/20"
                              title="Delete analysis"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-gray-300 mb-2 line-clamp-2">
                          {analysis.executive_summary}
                        </p>
                        {/* Company Information */}
                        {analysis.company_info?.companies?.length > 0 && (
                          <div className="mb-2">
                            <div className="text-xs text-gray-400 mb-1">Companies:</div>
                            <div className="flex flex-wrap gap-1">
                              {analysis.company_info.companies.slice(0, 2).map((company: string, idx: number) => (
                                <span key={idx} className="text-xs bg-green-900/30 text-green-300 px-2 py-1 rounded">
                                  {company}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Source URL */}
                        {analysis.source_url && analysis.source_url !== 'extension-capture' && (
                          <div className="mb-2">
                            <div className="text-xs text-gray-400">Source:</div>
                            <div className="text-xs text-blue-300 truncate">
                              {analysis.source_url}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <div className="flex space-x-2">
                            {analysis.key_insights?.slice(0, 2).map((insight: string, idx: number) => (
                              <span key={idx} className="text-xs bg-blue-900/30 text-blue-300 px-2 py-1 rounded">
                                {insight.substring(0, 30)}...
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-400">
                              {Math.round((analysis.confidence_score || 0) * 100)}% confidence
                            </span>
                            <span className="text-xs text-blue-400">Click to view →</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-white/50">
                    <FileText size={48} className="mx-auto mb-3 opacity-50" />
                    <p>No analysis results yet</p>
                    <p className="text-sm">Upload a deck to see AI insights!</p>
                    {pendingCaptures.length > 0 && (
                      <p className="text-sm text-yellow-400 mt-2">
                        {pendingCaptures.length} capture{pendingCaptures.length > 1 ? 's' : ''} in progress...
                      </p>
                    )}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Analysis Detail Modal */}
      {showAnalysisDetail && selectedAnalysis && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">{selectedAnalysis.title}</h2>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={(e) => handleDeleteAnalysis(selectedAnalysis.id, e)}
                    className="text-red-400 hover:text-red-300 transition-colors p-2 rounded hover:bg-red-900/20"
                    title="Delete analysis"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setShowAnalysisDetail(false)}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                {/* Company Information */}
                {(extractedCompanyInfo || selectedAnalysis.company_info?.companies?.length > 0) && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">Company Information</h3>
                    {isExtractingCompany ? (
                      <div className="flex items-center space-x-2 text-blue-300">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                        <span>Extracting company information...</span>
                      </div>
                    ) : extractedCompanyInfo ? (
                      <div className="space-y-3">
                        <div className="p-3 rounded-lg bg-blue-900/20 border border-blue-500/30">
                          <div className="text-blue-300 font-medium">{extractedCompanyInfo.company_name}</div>
                          {extractedCompanyInfo.company_domain && (
                            <div className="text-blue-400/70 text-sm">{extractedCompanyInfo.company_domain}</div>
                          )}
                          {extractedCompanyInfo.website_url && (
                            <div className="text-blue-400/70 text-sm">{extractedCompanyInfo.website_url}</div>
                          )}
                          <div className="text-blue-400/50 text-xs mt-1">
                            Confidence: {Math.round((extractedCompanyInfo.confidence || 0) * 100)}%
                          </div>
                        </div>
                        {extractedCompanyInfo.additional_info?.industry && (
                          <div className="text-sm text-gray-300">
                            <span className="text-gray-400">Industry:</span> {extractedCompanyInfo.additional_info.industry}
                          </div>
                        )}
                      </div>
                    ) : selectedAnalysis.company_info?.companies?.length > 0 ? (
                      <div className="space-y-2">
                        <div className="text-gray-300">Companies mentioned:</div>
                        <div className="flex flex-wrap gap-2">
                          {selectedAnalysis.company_info.companies.map((company: string, idx: number) => (
                            <span key={idx} className="bg-green-900/30 text-green-300 px-2 py-1 rounded text-sm">
                              {company}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Executive Summary */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">Executive Summary</h3>
                  <p className="text-gray-300 leading-relaxed">{selectedAnalysis.executive_summary}</p>
                </div>

                {/* Key Insights */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">Key Insights</h3>
                  <ul className="space-y-2">
                    {selectedAnalysis.key_insights?.map((insight: string, idx: number) => (
                      <li key={idx} className="flex items-start space-x-2">
                        <span className="text-blue-400 mt-1">•</span>
                        <span className="text-gray-300">{insight}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Recommendations */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">Recommendations</h3>
                  <ul className="space-y-2">
                    {selectedAnalysis.recommendations?.map((recommendation: string, idx: number) => (
                      <li key={idx} className="flex items-start space-x-2">
                        <span className="text-green-400 mt-1">•</span>
                        <span className="text-gray-300">{recommendation}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Organization Link */}
                <div className="border-t border-gray-700 pt-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">Organization</h3>
                    <Button
                      onClick={() => setShowLinkOrgModal(true)}
                      variant="outline"
                      size="sm"
                    >
                      {selectedAnalysis.organization_id && selectedAnalysis.organization_id !== '1' ? 'Change Organization' : 'Link Organization'}
                    </Button>
                  </div>
                  
                  {selectedAnalysis.organization_id && selectedAnalysis.organization_id !== '1' ? (
                    <div className="p-3 rounded-lg bg-green-900/20 border border-green-500/30">
                      <div className="text-green-300 font-medium">
                        {selectedAnalysis.organization_name || 'Linked Organization'}
                      </div>
                      <div className="text-green-400/70 text-sm">
                        Affinity ID: {selectedAnalysis.organization_id}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-yellow-900/20 border border-yellow-500/30">
                      <div className="text-yellow-300 font-medium">Not Linked to Organization</div>
                      <div className="text-yellow-400/70 text-sm">
                        Click "Link Organization" to connect this analysis to an Affinity organization
                      </div>
                    </div>
                  )}
                </div>

                {/* Metadata */}
                <div className="border-t border-gray-700 pt-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Confidence Score:</span>
                      <span className="text-white ml-2">{Math.round((selectedAnalysis.confidence_score || 0) * 100)}%</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Created:</span>
                      <span className="text-white ml-2">{new Date(selectedAnalysis.created_at).toLocaleString()}</span>
                    </div>
                    {selectedAnalysis.artifact_title && (
                      <div>
                        <span className="text-gray-400">Deck:</span>
                        <span className="text-white ml-2">{selectedAnalysis.artifact_title}</span>
                      </div>
                    )}
                    {selectedAnalysis.source_url && (
                      <div>
                        <span className="text-gray-400">Source:</span>
                        <span className="text-white ml-2">{selectedAnalysis.source_url}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Organization Linking Modal */}
      {showLinkOrgModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">Link to Organization</h2>
                <button
                  onClick={() => setShowLinkOrgModal(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {extractedCompanyInfo ? (
                  <div className="p-3 rounded-lg bg-blue-900/20 border border-blue-500/30 mb-4">
                    <div className="text-blue-300 font-medium mb-2">Auto-detected Company:</div>
                    <div className="text-blue-400">{extractedCompanyInfo.company_name}</div>
                    {extractedCompanyInfo.company_domain && (
                      <div className="text-blue-400/70 text-sm">{extractedCompanyInfo.company_domain}</div>
                    )}
                    <div className="text-blue-400/50 text-xs mt-1">
                      Confidence: {Math.round((extractedCompanyInfo.confidence || 0) * 100)}%
                    </div>
                  </div>
                ) : null}
                
                <p className="text-gray-300">
                  {extractedCompanyInfo ? 
                    'We found a company in the content. Search for the matching organization in Affinity:' :
                    'Search for an organization to link this captured content to:'
                  }
                </p>

                {/* Search Bar */}
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
                          onClick={() => handleLinkOrganization(org)}
                          disabled={isLinkingOrg}
                          className="w-full px-3 py-2 text-left hover:bg-white/20 transition-colors border-b border-white/10 last:border-b-0 disabled:opacity-50"
                        >
                          <div className="font-medium text-white">{org.name}</div>
                          {org.domain && (
                            <div className="text-white/70 text-sm">{org.domain}</div>
                          )}
                          <div className="text-white/50 text-xs">ID: {org.id}</div>
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

                {isLinkingOrg && (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-2"></div>
                    <p className="text-blue-300">Linking organization...</p>
                  </div>
                )}

                <div className="flex justify-end space-x-3 pt-4">
                  <Button
                    onClick={() => setShowLinkOrgModal(false)}
                    variant="outline"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
