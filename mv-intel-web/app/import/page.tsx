'use client';

import React, { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { Upload, FileText, Check, AlertCircle, Loader2, Search, Database, Cloud, History, AlertTriangle, Info, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';

export default function ImportPage() {
  const [selectedCompany, setSelectedCompany] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [textInput, setTextInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [showResolutionModal, setShowResolutionModal] = useState(false);
  const [resolutionCandidates, setResolutionCandidates] = useState<{id: string, name: string}[]>([]);
  const [targetCompanyName, setTargetCompanyName] = useState('');
  const [resolvedCompanyId, setResolvedCompanyId] = useState('');
  const [dryRunResults, setDryRunResults] = useState<any[]>([]);
  const [expandedChangelog, setExpandedChangelog] = useState<string | null>(null);
  const [guideUsed, setGuideUsed] = useState<any>(null);
  const [extractedCompany, setExtractedCompany] = useState<string>('');
  
  // Local mode state
  const [localMode, setLocalMode] = useState(true); // Default to local for development
  const [useCache, setUseCache] = useState(true);
  const [localStorageSummary, setLocalStorageSummary] = useState<any>(null);
  
  // Search state for modal
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{id: string, name: string}[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Load local storage summary on mount
  useEffect(() => {
    if (localMode) {
      fetch('/api/ingest-local')
        .then(res => res.json())
        .then(data => setLocalStorageSummary(data))
        .catch(() => {});
    }
  }, [localMode]);

  // Auto-detect company when files are added
  useEffect(() => {
    if (files.length > 0 && !selectedCompany) {
      const detect = async () => {
        try {
          const res = await fetch(`/api/detect-company?filename=${encodeURIComponent(files[0].name)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.detected_slug) {
              setSelectedCompany(data.detected_slug);
            }
          }
        } catch (err) {
          console.warn('Company detection failed:', err);
        }
      };
      detect();
    }
  }, [files, selectedCompany]);

  const handleCompanySearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
        setSearchResults([]);
        return;
    }
    
    setIsSearching(true);
    try {
        const res = await fetch(`/api/companies/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
            const data = await res.json();
            setSearchResults(data.companies || []);
        }
    } catch (err) {
        console.error('Search failed:', err);
    } finally {
        setIsSearching(false);
    }
  };

  // Reset search state when modal opens
  useEffect(() => {
      if (showResolutionModal) {
          setSearchQuery('');
          setSearchResults([]);
          setResolvedCompanyId('');
      }
  }, [showResolutionModal]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    const fileList = e.target.files;
    if (fileList && fileList.length > 0) {
      setFiles(prev => [...prev, ...Array.from(fileList)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleTestRun = async () => {
      if (files.length === 0) {
          alert('Please upload at least one file to test.');
          return;
      }
      
      // For dry runs, default to 'nelly' if no company selected (our test case)
      const testCompany = selectedCompany || 'nelly';
      
      setIsUploading(true);
      setUploadStatus('idle');
      setStatusMessage(`Running ${localMode ? 'LOCAL' : 'dry'} run with ${testCompany} guide...`);
      setDryRunResults([]); // Clear previous results

      try {
          // Reuse upload logic
          const uploadedPaths: string[] = [];
          for (let i = 0; i < files.length; i++) {
              const file = files[i];
              setStatusMessage(`Uploading test file ${i + 1}...`);
              const urlRes = await fetch(
                  `/api/upload?filename=${encodeURIComponent(file.name)}&companySlug=${encodeURIComponent(testCompany)}`
              );
              const urlData = await urlRes.json();
              if (urlData.status !== 'success') throw new Error(urlData.error);
              
              const uploadRes = await fetch(urlData.signedUrl, {
                  method: 'PUT',
                  headers: { 'Content-Type': file.type || 'application/octet-stream' },
                  body: file
              });
              if (!uploadRes.ok) throw new Error('Upload failed');
              uploadedPaths.push(urlData.path);
          }

          setStatusMessage(localMode ? 'Processing locally (checking cache)...' : 'Processing test run...');
          
          // Use local endpoint if local mode is enabled
          const endpoint = localMode ? '/api/ingest-local' : '/api/ingest';
          const res = await fetch(endpoint, { 
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  companySlug: testCompany,
                  filePaths: uploadedPaths,
                  dryRun: !localMode, // Only needed for non-local mode
                  useCache: useCache, // Local mode caching option
                  forceReextract: false
              })
          });
          
          const data = await res.json();
          
          // Update local storage summary
          if (localMode && data.local_storage) {
              setLocalStorageSummary(data.local_storage);
          }
          
          if (res.ok && data.status !== 'error') {
              setDryRunResults(data.results || []);
              setGuideUsed(data.guide_used || null);
              setExtractedCompany(data.company || selectedCompany);
              setUploadStatus('success');
              const cacheInfo = localMode && data.summary?.cached > 0 
                  ? ` (${data.summary.cached} from cache)` 
                  : '';
              setStatusMessage(`${localMode ? 'Local' : 'Test'} Run Complete${cacheInfo}`);
          } else {
              // Show detailed error from results if available
              const errorDetails = data.results?.map((r: any) => 
                  r.status === 'error' ? `${r.file}: ${r.error}` : null
              ).filter(Boolean).join('\n') || data.error || 'Test run failed';
              
              // Still show any partial results
              if (data.results?.length > 0) {
                  setDryRunResults(data.results);
              }
              throw new Error(errorDetails);
          }
      } catch (err: any) {
          console.error('Dry run error:', err);
          setUploadStatus('error');
          setStatusMessage(`Test failed: ${err.message}`);
          alert(`Test failed: ${err.message}`);
      } finally {
          setIsUploading(false);
      }
  };

  const handleSubmit = async (overrideCompanyId?: string) => {
    // Require at least one file - text input alone is not sufficient for ingestion
    if (files.length === 0) {
        alert('Please upload at least one file to ingest.');
        return;
    }
    if (!selectedCompany) {
        alert('Please select a company first.');
        return;
    }

    setIsUploading(true);
    setUploadStatus('idle');
    setStatusMessage('Uploading files...');

    try {
        // 1. Upload files using signed URLs (bypasses Vercel 4.5MB limit)
        const uploadedPaths: string[] = [];
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            setStatusMessage(`Uploading file ${i + 1} of ${files.length}...`);
            
            // Step 1: Get signed upload URL from our API
            const urlRes = await fetch(
                `/api/upload?filename=${encodeURIComponent(file.name)}&companySlug=${encodeURIComponent(selectedCompany)}`
            );
            const urlData = await urlRes.json();
            
            if (urlData.status !== 'success') {
                console.error('Failed to get upload URL:', urlData.error);
                throw new Error(`Failed to get upload URL for ${file.name}: ${urlData.error}`);
            }
            
            // Step 2: Upload directly to Supabase Storage using signed URL
            const uploadRes = await fetch(urlData.signedUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': file.type || 'application/octet-stream',
                },
                body: file
            });
            
            if (!uploadRes.ok) {
                const errorText = await uploadRes.text();
                console.error('Direct upload failed:', errorText);
                throw new Error(`Upload failed for ${file.name}: ${uploadRes.status}`);
            }
            
            uploadedPaths.push(urlData.path);
        }

        setStatusMessage('Processing files...');

        // 2. Trigger Ingestion API with paths
        const body: any = {
            companySlug: selectedCompany,
            filePaths: uploadedPaths,
            notes: textInput
        };
        if (overrideCompanyId) {
            body.forceCompanyId = overrideCompanyId;
        }

        const res = await fetch('/api/ingest', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        let data;
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await res.json();
        } else {
            // Handle non-JSON responses (e.g. Vercel 500/404/Auth pages)
            const text = await res.text();
            console.error('Non-JSON response from API:', text.slice(0, 500));
            throw new Error(`Server returned ${res.status}: ${res.statusText}. See console for details.`);
        }
        
        // Check response body status, not just HTTP status
        // API returns: 'success' (all files), 'partial' (some failed), 'error' (all failed)
        if (data.status === 'success') {
            setUploadStatus('success');
            setStatusMessage(`Ingestion Complete: ${data.summary?.success || 0} files processed`);
            setShowResolutionModal(false);
            setTimeout(() => {
                setUploadStatus('idle');
                setFiles([]);
                setTextInput('');
                setSelectedCompany('');
                setStatusMessage('');
            }, 3000);
        } else if (data.status === 'partial' || data.status === 'needs_review') {
            // Partial success - check if any were company_not_found
             const companyNotFound = data.results?.find((r: any) => r.status === 'company_not_found');
             if (companyNotFound) {
                 // Trigger resolution flow
                 setTargetCompanyName(selectedCompany); // Or parse from error message?
                 setResolutionCandidates(companyNotFound.candidates || []);
                 setShowResolutionModal(true);
                 setIsUploading(false);
                 return; 
             }

            setUploadStatus('error');
            // Include both error and needs_review files in the message
            const problemFiles = data.results?.filter((r: any) => r.status === 'error' || r.status === 'needs_review') || [];
            const failedNames = problemFiles.map((f: any) => {
                const filename = f.file?.split('/').pop() || f.file;
                const statusLabel = f.status === 'needs_review' ? ' (needs review)' : ' (failed)';
                return filename + statusLabel;
            }).join(', ');
            const errorCount = data.summary?.error || 0;
            const reviewCount = data.summary?.needs_review || 0;
            const totalProblems = errorCount + reviewCount;
            setStatusMessage(`${totalProblems} of ${data.summary?.total || 0} files had issues. Check: ${failedNames}`);
            
            // Alert details for partial failures
            console.warn('Partial success details:', data);
        } else {
            // Complete failure (overallStatus === 'error')
            
             // Check specifically for company_not_found at top level or in results
             const companyNotFound = data.results?.find((r: any) => r.status === 'company_not_found');
             if (companyNotFound) {
                 setTargetCompanyName(selectedCompany);
                 setResolutionCandidates(companyNotFound.candidates || []);
                 setShowResolutionModal(true);
                 setIsUploading(false);
                 return;
             }

            setUploadStatus('error');
            
            // Try to extract specific errors from results if available
            let errorMessage = '';
            if (data.results && Array.isArray(data.results) && data.results.length > 0) {
                const errors = data.results
                    .filter((r: any) => r.status === 'error' && r.error)
                    .map((r: any) => `${r.file || 'Unknown File'}: ${r.error}`)
                    .join('\n');
                if (errors) {
                    errorMessage = errors;
                }
            }
            
            // Fallback to top-level error/details if no result-specific errors found
            if (!errorMessage) {
                const mainError = data.error || 'Processing failed';
                const details = data.details ? `: ${data.details}` : '';
                errorMessage = `${mainError}${details}`;
                
                // If data seems empty/malformed, dump it for debugging
                if (!data.error && !data.details && (!data.results || data.results.length === 0)) {
                    errorMessage += `\nResponse: ${JSON.stringify(data, null, 2)}`;
                }
            }
            
            setStatusMessage(errorMessage);
            alert(`Ingestion Failed:\n${errorMessage}`); // Explicitly alert user with detailed errors
        }
    } catch (err: any) {
        console.error('Submission error:', err);
        setUploadStatus('error');
        setStatusMessage(`Upload failed: ${err.message || 'Unknown error'}`);
        alert(`Error: ${err.message || 'Unknown error occurred'}`);
    } finally {
        if (!showResolutionModal) {
             setIsUploading(false);
        }
    }
  };

  const handleResolveCompany = () => {
      if (!resolvedCompanyId) return;
      setShowResolutionModal(false);
      handleSubmit(resolvedCompanyId);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Resolution Modal */}
        {showResolutionModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                <div className="bg-gray-800 border border-white/10 rounded-xl p-6 max-w-md w-full shadow-2xl flex flex-col max-h-[80vh]">
                    <div className="flex-shrink-0 mb-4">
                        <h3 className="text-xl font-bold text-white">Confirm Company</h3>
                        <p className="text-gray-300 mt-2 text-sm">
                            We couldn't automatically match <strong>{targetCompanyName}</strong> to our database. 
                            Please select the correct company below:
                        </p>
                    </div>

                    {/* Search Input */}
                    <div className="flex-shrink-0 relative mb-4">
                        <Search className="absolute left-3 top-3 text-gray-400" size={16} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => handleCompanySearch(e.target.value)}
                            placeholder="Search all companies..."
                            className="w-full bg-black/40 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {isSearching && <Loader2 className="absolute right-3 top-3 text-blue-400 animate-spin" size={16} />}
                    </div>
                    
                    <div className="flex-1 overflow-y-auto min-h-[200px] space-y-2 mb-6 pr-2">
                        {/* Section: Suggested Candidates (if any) */}
                        {!searchQuery && resolutionCandidates.length > 0 && (
                            <div className="mb-4">
                                <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Suggested Matches</p>
                                {resolutionCandidates.map(c => (
                                    <label key={`cand-${c.id}`} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${resolvedCompanyId === c.id ? 'bg-blue-600/20 border-blue-500' : 'border-white/10 hover:bg-white/5'}`}>
                                        <input 
                                            type="radio" 
                                            name="company_resolution"
                                            value={c.id}
                                            checked={resolvedCompanyId === c.id}
                                            onChange={() => setResolvedCompanyId(c.id)}
                                            className="text-blue-500 focus:ring-blue-500"
                                        />
                                        <span className="text-white font-medium">{c.name}</span>
                                    </label>
                                ))}
                            </div>
                        )}

                        {/* Section: Search Results */}
                        {searchQuery && (
                            <div>
                                <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Search Results</p>
                                {searchResults.length > 0 ? (
                                    searchResults.map(c => (
                                        <label key={`search-${c.id}`} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${resolvedCompanyId === c.id ? 'bg-blue-600/20 border-blue-500' : 'border-white/10 hover:bg-white/5'}`}>
                                            <input 
                                                type="radio" 
                                                name="company_resolution"
                                                value={c.id}
                                                checked={resolvedCompanyId === c.id}
                                                onChange={() => setResolvedCompanyId(c.id)}
                                                className="text-blue-500 focus:ring-blue-500"
                                            />
                                            <span className="text-white font-medium">{c.name}</span>
                                        </label>
                                    ))
                                ) : (
                                    !isSearching && <p className="text-gray-500 text-sm italic p-2">No companies found.</p>
                                )}
                            </div>
                        )}
                        
                         {/* Empty State */}
                        {!searchQuery && resolutionCandidates.length === 0 && (
                            <div className="text-center py-8">
                                <p className="text-yellow-400 text-sm mb-2">No similar companies found automatically.</p>
                                <p className="text-gray-500 text-sm">Use the search box above to find the company.</p>
                            </div>
                        )}
                    </div>

                    <div className="flex-shrink-0 flex justify-end gap-3 pt-4 border-t border-white/10">
                        <button 
                            onClick={() => setShowResolutionModal(false)}
                            className="px-4 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleResolveCompany}
                            disabled={!resolvedCompanyId}
                            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Confirm & Retry
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
              Portfolio Data Ingestion
            </h1>
            <p className="text-gray-400 mt-2">
              Upload board decks, financial models, or paste investor updates.
            </p>
          </div>
          
          {/* Mode Toggle */}
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-3 bg-black/40 border border-white/10 rounded-lg px-4 py-2">
              <button
                onClick={() => setLocalMode(false)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  !localMode 
                    ? 'bg-blue-600 text-white' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Cloud size={14} />
                Cloud
              </button>
              <button
                onClick={() => setLocalMode(true)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  localMode 
                    ? 'bg-green-600 text-white' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Database size={14} />
                Local
              </button>
            </div>
            
            {localMode && (
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2 text-xs">
                  <label className="flex items-center gap-1.5 text-gray-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useCache}
                      onChange={(e) => setUseCache(e.target.checked)}
                      className="w-3 h-3 rounded border-gray-600 text-green-500 focus:ring-green-500"
                    />
                    Use API cache
                  </label>
                  {localStorageSummary && (
                    <span className="text-gray-500">
                      ({localStorageSummary.extractions} extractions, {localStorageSummary.cacheEntries} cached)
                    </span>
                  )}
                </div>
                {process.env.NODE_ENV !== 'development' && (
                  <span className="text-[10px] text-yellow-500/80">
                    Warning: Ephemeral storage (Vercel)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Company Selector */}
        <div className="glass-panel p-6 rounded-xl border border-white/10 bg-white/5">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Select Portfolio Company
          </label>
          <div className="flex gap-4">
             <select 
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
                className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="" disabled>-- Select Company --</option>
                <option value="nelly">Nelly Solutions</option>
                <option value="acme-corp">Acme Corp</option>
                <option value="stark-industries">Stark Industries</option>
              </select>
              {selectedCompany && (
                  <div className="flex items-center text-green-400 text-sm">
                      <Check size={16} className="mr-1"/> Detected
                  </div>
              )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* File Upload Section */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Upload size={20} className="text-blue-400" />
              Source Documents
            </h2>
            
            <div 
              className={`
                relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200
                ${dragActive 
                  ? 'border-blue-500 bg-blue-500/10' 
                  : 'border-white/20 hover:border-white/40 hover:bg-white/5'}
              `}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                type="file"
                multiple
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={handleChange}
              />
              
              <div className="pointer-events-none">
                <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <p className="text-lg font-medium">Drop files here</p>
                <p className="text-sm text-gray-500 mt-2">
                  PDF (Board Decks), XLSX (Financials), CSV
                </p>
              </div>
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div className="space-y-2 mt-4">
                {files.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white/5 p-3 rounded-lg border border-white/10">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="p-2 bg-blue-500/20 rounded-lg">
                        <FileText size={16} className="text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => removeFile(idx)}
                      className="p-1 hover:bg-white/10 rounded-full transition-colors"
                    >
                      <span className="sr-only">Remove</span>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Text Input Section */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <FileText size={20} className="text-purple-400" />
              Direct Input
            </h2>
            <div className="h-full">
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Paste text from board emails, memos, or key highlights here..."
                className="w-full h-[300px] bg-black/20 border border-white/10 rounded-xl p-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Submit Action */}
        <div className="flex flex-col gap-6 pt-6 border-t border-white/10">
          <div className="flex justify-end gap-4">
            <button
                onClick={handleTestRun}
                disabled={isUploading || files.length === 0}
                className={`px-6 py-3 rounded-xl font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                  localMode 
                    ? 'text-green-400 border border-green-500/30 hover:bg-green-500/10'
                    : 'text-blue-400 border border-blue-500/30 hover:bg-blue-500/10'
                }`}
                title={localMode ? "Extract locally with caching (no API costs for cached files)" : "Test extraction using Nelly guide (no database writes)"}
            >
                {localMode ? (
                  <>
                    <Database size={16} className="inline mr-2" />
                    Extract Locally
                  </>
                ) : (
                  'Test Run (Nelly)'
                )}
            </button>
            
            <button
                onClick={() => handleSubmit()}
                disabled={isUploading || files.length === 0}
                className={`
                flex items-center gap-2 px-8 py-3 rounded-xl font-medium transition-all duration-200
                ${uploadStatus === 'success' 
                    ? 'bg-green-500 hover:bg-green-600 text-white' 
                    : uploadStatus === 'error'
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white'}
                disabled:opacity-50 disabled:cursor-not-allowed
                `}
            >
                {isUploading ? (
                <>
                    <Loader2 size={20} className="animate-spin" />
                    {statusMessage || 'Processing...'}
                </>
                ) : uploadStatus === 'success' ? (
                <>
                    <Check size={20} />
                    Ingestion Complete
                </>
                ) : uploadStatus === 'error' ? (
                    <>
                    <AlertCircle size={20} />
                    Failed - Retry
                    </>
                ) : (
                <>
                    Start Ingestion
                </>
                )}
            </button>
          </div>

          {/* Portco Guide Card - Always visible when guide is loaded */}
          {guideUsed && (
              <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-xl border border-blue-500/30 overflow-hidden">
                  <div className="p-4 border-b border-blue-500/20 bg-blue-500/10 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-500/20 rounded-lg">
                              <FileText className="text-blue-400" size={20} />
                          </div>
                          <div>
                              <h3 className="text-lg font-semibold text-blue-400">
                                  Portco Guide: {guideUsed.company_metadata?.name || extractedCompany || selectedCompany}
                              </h3>
                              <p className="text-xs text-gray-400">
                                  Currency: {guideUsed.company_metadata?.currency || 'N/A'} • 
                                  FYE: {guideUsed.company_metadata?.fiscal_year_end || 'N/A'}
                              </p>
                          </div>
                      </div>
                      <div className="flex items-center gap-2">
                          <Link 
                              href={`/import/data?company=${extractedCompany || selectedCompany}`}
                              target="_blank"
                              className="px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 rounded-lg text-xs text-green-300 flex items-center gap-1.5 transition-colors"
                          >
                              <Database size={12} /> View Extracted Data
                          </Link>
                          <Link 
                              href={`/import/guide?company=${extractedCompany || selectedCompany}`}
                              target="_blank"
                              className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg text-xs text-blue-300 flex items-center gap-1.5 transition-colors"
                          >
                              View Guide <ExternalLink size={12} />
                          </Link>
                      </div>
                  </div>
                  <details className="group" open>
                      <summary className="px-4 py-2 cursor-pointer text-sm text-gray-400 hover:text-white flex items-center gap-2 bg-black/20">
                          <ChevronRight size={14} className="group-open:rotate-90 transition-transform" />
                          Metrics Mapping ({Object.keys(guideUsed.metrics_mapping || {}).length} metrics configured)
                      </summary>
                      <div className="p-4 bg-black/40 border-t border-white/5 max-h-64 overflow-y-auto">
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                              {Object.entries(guideUsed.metrics_mapping || {}).map(([id, cfg]: [string, any]) => (
                                  <div key={id} className="p-2 bg-white/5 rounded border border-white/10">
                                      <div className="font-mono text-blue-300">{id}</div>
                                      <div className="text-gray-500 truncate" title={(cfg.labels || []).join(', ')}>
                                          {(cfg.labels || []).slice(0, 2).join(', ')}
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </div>
                  </details>
              </div>
          )}

          {/* Dry Run Results */}
          {dryRunResults.length > 0 && (
              <div className="bg-black/40 rounded-xl border border-white/10 overflow-hidden">
                  <div className="p-4 border-b border-white/10 bg-white/5">
                      <h3 className="text-lg font-semibold text-blue-400">Extraction Results</h3>
                  </div>
                  <div className="p-4 space-y-6">
                      {dryRunResults.map((res, idx) => (
                          <div key={idx} className="space-y-4">
                              {/* File Header with Priority Badge */}
                              <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                      <h4 className="font-medium text-white">{res.file}</h4>
                                      {res.fileType && (
                                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase ${
                                              res.fileType === 'board_deck' ? 'bg-amber-500/20 text-amber-400' :
                                              res.fileType === 'investor_report' ? 'bg-blue-500/20 text-blue-400' :
                                              res.fileType === 'budget_file' ? 'bg-purple-500/20 text-purple-400' :
                                              'bg-gray-500/20 text-gray-400'
                                          }`}>
                                              {res.fileType?.replace('_', ' ')}
                                              {res.priority && <span className="ml-1 opacity-60">P{res.priority}</span>}
                                          </span>
                                      )}
                                  </div>
                                  <span className={`px-2 py-1 rounded text-xs ${res.status === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                      {res.status}
                                  </span>
                              </div>
                              
                              {/* Reconciliation Summary */}
                              {res.reconciliation && (
                                  <div className="flex flex-wrap gap-3 text-xs">
                                      {res.reconciliation.summary.inserted > 0 && (
                                          <span className="flex items-center gap-1 px-2 py-1 bg-green-500/10 border border-green-500/20 rounded text-green-400">
                                              <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span>
                                              {res.reconciliation.summary.inserted} new
                                          </span>
                                      )}
                                      {res.reconciliation.summary.updated > 0 && (
                                          <span className="flex items-center gap-1 px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded text-blue-400">
                                              <History size={10} />
                                              {res.reconciliation.summary.updated} updated
                                          </span>
                                      )}
                                      {res.reconciliation.summary.ignored > 0 && (
                                          <span className="flex items-center gap-1 px-2 py-1 bg-gray-500/10 border border-gray-500/20 rounded text-gray-400">
                                              {res.reconciliation.summary.ignored} ignored (lower priority)
                                          </span>
                                      )}
                                      {res.reconciliation.summary.conflicts > 0 && (
                                          <span className="flex items-center gap-1 px-2 py-1 bg-red-500/10 border border-red-500/20 rounded text-red-400">
                                              <AlertTriangle size={10} />
                                              {res.reconciliation.summary.conflicts} conflicts
                                          </span>
                                      )}
                                  </div>
                              )}

                              {/* Conflicts Panel */}
                              {res.reconciliation?.conflicts?.length > 0 && (
                                  <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
                                      <div className="flex items-center gap-2 text-red-400 font-medium text-sm mb-2">
                                          <AlertTriangle size={14} />
                                          Data Conflicts Detected
                                      </div>
                                      <div className="space-y-2">
                                          {res.reconciliation.conflicts.map((conflict: any, ci: number) => (
                                              <div key={ci} className="flex items-start gap-3 text-xs bg-black/20 rounded p-2">
                                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                                      conflict.severity === 'high' ? 'bg-red-500/20 text-red-400' :
                                                      conflict.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                                                      'bg-gray-500/20 text-gray-400'
                                                  }`}>
                                                      {conflict.severity}
                                                  </span>
                                                  <div className="flex-1">
                                                      <div className="text-white font-medium">{conflict.metric_id}</div>
                                                      <div className="text-gray-400 mt-0.5">
                                                          {conflict.existingValue.toLocaleString()} ({conflict.existingSource})
                                                          <span className="mx-2">→</span>
                                                          {conflict.newValue.toLocaleString()} ({conflict.newSource})
                                                      </div>
                                                      {conflict.newExplanation && (
                                                          <div className="mt-1 text-blue-400 italic flex items-start gap-1">
                                                              <Info size={10} className="mt-0.5 flex-shrink-0" />
                                                              {conflict.newExplanation}
                                                          </div>
                                                      )}
                                                  </div>
                                                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                                      conflict.recommendation === 'use_new' ? 'bg-green-500/20 text-green-400' :
                                                      conflict.recommendation === 'keep_existing' ? 'bg-gray-500/20 text-gray-400' :
                                                      'bg-yellow-500/20 text-yellow-400'
                                                  }`}>
                                                      {conflict.recommendation === 'use_new' ? 'Using New' :
                                                       conflict.recommendation === 'keep_existing' ? 'Kept Old' : 'Review'}
                                                  </span>
                                              </div>
                                          ))}
                                      </div>
                                  </div>
                              )}
                              
                              {/* Key Metrics Table (same layout as Financial Data) */}
                              {res.computed_metrics && res.computed_metrics.length > 0 && (
                                  <div className="mb-6">
                                      <h5 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                          Computed Metrics
                                          <span className="text-gray-500 font-normal ml-2">
                                              ({res.computed_metrics.length} metrics)
                                          </span>
                                      </h5>
                                      <div className="overflow-hidden border border-white/10 rounded-lg bg-white/5">
                                          <table className="w-full text-xs text-left border-collapse">
                                              <thead className="text-gray-400 bg-gray-900/90">
                                                  <tr>
                                                      <th className="py-3 px-4 font-medium min-w-[200px] border-r border-white/10">Metric</th>
                                                      <th className="py-3 px-4 text-right font-medium">Value</th>
                                                      <th className="py-3 px-4 text-center font-medium">Unit</th>
                                                      <th className="py-3 px-4 text-center font-medium">Period</th>
                                                  </tr>
                                              </thead>
                                              <tbody className="divide-y divide-white/5">
                                                  {res.computed_metrics.map((m: any, i: number) => (
                                                      <tr key={i} className="hover:bg-white/5 transition-colors">
                                                          <td className="py-2 px-4 font-mono text-gray-300 border-r border-white/10">
                                                              {m.metric_id.replace(/_/g, ' ')}
                                                          </td>
                                                          <td className="py-2 px-4 text-right font-medium text-white">
                                                              {typeof m.value === 'number' 
                                                                  ? m.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) 
                                                                  : m.value}
                                                          </td>
                                                          <td className="py-2 px-4 text-center text-gray-400">
                                                              {m.unit}
                                                          </td>
                                                          <td className="py-2 px-4 text-center text-gray-500 text-[10px]">
                                                              {m.period}
                                                          </td>
                                                      </tr>
                                                  ))}
                                              </tbody>
                                          </table>
                                      </div>
                                  </div>
                              )}
                              
                              {/* Time-Series Financial Data Table */}
                              {res.extracted_data && res.extracted_data.length > 0 && (() => {
                                  // Build time-series pivot: Metric (rows) × Date (columns) × Scenario
                                  const timeSeriesData: Record<string, Record<string, { actual?: any; budget?: any }>> = {};
                                  const allDates = new Set<string>();
                                  
                                  res.extracted_data.forEach((item: any) => {
                                      const date = item.date || res.period || 'Unknown';
                                      allDates.add(date);
                                      
                                      if (!timeSeriesData[item.line_item_id]) {
                                          timeSeriesData[item.line_item_id] = {};
                                      }
                                      if (!timeSeriesData[item.line_item_id][date]) {
                                          timeSeriesData[item.line_item_id][date] = {};
                                      }
                                      
                                      if (item.scenario === 'budget') {
                                          timeSeriesData[item.line_item_id][date].budget = item;
                                      } else {
                                          timeSeriesData[item.line_item_id][date].actual = item;
                                      }
                                  });
                                  
                                  // Sort dates chronologically
                                  const sortedDates = Array.from(allDates).sort();
                                  const metrics = Object.keys(timeSeriesData).sort();
                                  
                                  // Format date for display
                                  const formatDate = (d: string) => {
                                      try {
                                          const date = new Date(d);
                                          return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                                      } catch { return d; }
                                  };

                                  // Helper to render value with source link
                                  const renderValueWithSource = (item: any, colorClass: string) => {
                                      if (!item || typeof item.amount !== 'number') return <span className="text-gray-600">-</span>;
                                      
                                      // Get snippet URL (local or remote)
                                      let snippetUrl = item.snippet_url || item.source_location?.snippet_url;
                                      
                                      // If local mode and snippet exists but is a file path, convert to API URL
                                      if (localMode && !snippetUrl && item.source_location?.page) {
                                          // This is constructed in backend but fallback here
                                      }

                                      const valueDisplay = (
                                          <span className={colorClass}>{item.amount.toLocaleString()}</span>
                                      );

                                      if (snippetUrl) {
                                          return (
                                              <a href={snippetUrl} target="_blank" rel="noopener noreferrer" 
                                                 className="group flex items-center justify-end gap-1.5 hover:bg-white/5 px-1 rounded -mr-1"
                                                 title="View source snippet">
                                                  {valueDisplay}
                                                  <ExternalLink size={10} className="text-gray-600 group-hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all" />
                                              </a>
                                          );
                                      }
                                      
                                      return valueDisplay;
                                  };
                                  
                                  return (
                                      <div className="mb-4">
                                          <h5 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                              Financial Data 
                                              <span className="text-gray-500 font-normal ml-2">
                                                  ({metrics.length} metrics × {sortedDates.length} period{sortedDates.length > 1 ? 's' : ''})
                                              </span>
                                          </h5>
                                          <div className="overflow-hidden border border-white/10 rounded-lg bg-white/5">
                                              <div className="overflow-x-auto max-h-[600px]">
                                                  <table className="w-full text-xs text-left border-collapse">
                                                      <thead className="text-gray-400 bg-gray-900/90 sticky top-0 z-20 backdrop-blur-sm shadow-sm">
                                                          <tr>
                                                              <th className="py-3 px-4 font-medium sticky left-0 bg-gray-900 z-30 min-w-[200px] border-r border-white/10 shadow-[2px_0_5px_rgba(0,0,0,0.2)]">Metric</th>
                                                              {sortedDates.map(date => (
                                                                  <th key={date} colSpan={3} className="py-2 px-2 text-center border-l border-white/10">
                                                                      <div className="font-semibold text-white">{formatDate(date)}</div>
                                                                  </th>
                                                              ))}
                                                          </tr>
                                                          <tr className="text-[10px] border-b border-white/10">
                                                              <th className="py-1 px-4 sticky left-0 bg-gray-900 z-30 border-r border-white/10"></th>
                                                              {sortedDates.map(date => (
                                                                  <React.Fragment key={`${date}-headers`}>
                                                                      <th className="py-1.5 px-3 text-right text-green-400 bg-green-900/10 border-l border-white/10 font-medium">Actual</th>
                                                                      <th className="py-1.5 px-3 text-right text-purple-400 bg-purple-900/10 font-medium">Budget</th>
                                                                      <th className="py-1.5 px-3 text-right text-gray-400 font-medium">Var %</th>
                                                                  </React.Fragment>
                                                              ))}
                                                          </tr>
                                                      </thead>
                                                      <tbody className="divide-y divide-white/5">
                                                          {metrics.map((metric, mi) => {
                                                              const metricData = timeSeriesData[metric];
                                                              const changelogKey = `${mi}-${metric}`;
                                                              const isExpanded = expandedChangelog === changelogKey;
                                                              
                                                              // Check if any cell has changelog
                                                              const hasAnyChangelog = Object.values(metricData).some(
                                                                  d => d.actual?.hasChangelog || d.budget?.hasChangelog
                                                              );
                                                              
                                                              return (
                                                                  <React.Fragment key={metric}>
                                                                      <tr className={`hover:bg-white/5 transition-colors group ${hasAnyChangelog ? 'bg-blue-500/5' : ''}`}>
                                                                          <td className="py-2 px-4 font-mono text-gray-300 sticky left-0 bg-gray-900 z-10 border-r border-white/10 shadow-[2px_0_5px_rgba(0,0,0,0.2)] group-hover:bg-gray-800 transition-colors">
                                                  <div className="flex items-center gap-2">
                                                      {hasAnyChangelog && (
                                                          <button
                                                              onClick={() => setExpandedChangelog(isExpanded ? null : changelogKey)}
                                                              className="p-0.5 hover:bg-white/10 rounded text-blue-400"
                                                              title="View change history"
                                                          >
                                                              {isExpanded ? <ChevronDown size={10} /> : <History size={10} />}
                                                          </button>
                                                      )}
                                                  <div className="flex-1 min-w-0">
                                                      <div className="truncate" title={metric}>{metric.replace(/_/g, ' ')}</div>
                                                      {(() => {
                                                          // Find ANY cell for this metric that has a source location
                                                          // Prioritize actuals, then budget
                                                          // If it's a time series, any month will do for the row-level attribution
                                                          const allCells = Object.values(metricData);
                                                          const sourceCell = allCells.find(c => c.actual?.source_location) || 
                                                                           allCells.find(c => c.budget?.source_location);
                                                          
                                                          const src = sourceCell?.actual?.source_location || sourceCell?.budget?.source_location;
                                                          
                                                          if (!src) return null;
                                                          
                                                          // Format: "Sheet!Cell" or "Context"
                                                          // If context says "GPT-5.1 multi-period...", try to show sheet if available
                                                          const displayText = src.sheet 
                                                              ? `📄 ${src.sheet}${src.cell ? `!${src.cell}` : ''}`
                                                              : (src.context || '').replace('GPT-5.1 ', '');

                                                          return (
                                                              <div className="text-[9px] text-gray-500 truncate" title={src.context || ''}>
                                                                  {displayText}
                                                              </div>
                                                          );
                                                      })()}
                                                  </div>
                                                  </div>
                                          </td>
                                                                          {sortedDates.map(date => {
                                                                              const cell = metricData[date] || {};
                                                                              const actual = cell.actual;
                                                                              const budget = cell.budget;
                                                                              const hasActual = !!actual;
                                                                              const hasBudget = !!budget;
                                                                              
                                                                              let varPct: number | null = null;
                                                                              if (hasActual && hasBudget && budget.amount !== 0) {
                                                                                  varPct = ((actual.amount - budget.amount) / Math.abs(budget.amount)) * 100;
                                                                              }
                                                                              
                                                                              return (
                                                                                  <React.Fragment key={`${metric}-${date}`}>
                                                                                      <td className="py-2 px-3 text-right font-medium bg-green-900/5 border-l border-white/10 relative">
                                                                                          {renderValueWithSource(actual, "text-white")}
                                                                                      </td>
                                                                                      <td className="py-2 px-3 text-right font-medium bg-purple-900/5 relative">
                                                                                          {renderValueWithSource(budget, "text-gray-300")}
                                                                                      </td>
                                                                                      <td className="py-2 px-3 text-right">
                                                                                          {varPct !== null ? (
                                                                                              <span className={`font-medium ${varPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                                                                  {varPct > 0 ? '+' : ''}{varPct.toFixed(1)}%
                                                                                              </span>
                                                                                          ) : <span className="text-gray-600">-</span>}
                                                                                      </td>
                                                                                  </React.Fragment>
                                                                              );
                                                                          })}
                                                                      </tr>
                                                                      
                                                                      {/* Expanded row for changelog */}
                                                                      {isExpanded && (
                                                                          <tr>
                                                                              <td colSpan={1 + sortedDates.length * 3} className="bg-black/30 border-l-2 border-blue-500">
                                                                                  <div className="p-3 space-y-2">
                                                                                      <div className="text-[10px] text-gray-500 uppercase font-medium">Change History for {metric.replace(/_/g, ' ')}</div>
                                                                                      {Object.entries(metricData).map(([date, cell]) => {
                                                                                          const changelog = cell.actual?.changelog || cell.budget?.changelog || [];
                                                                                          if (changelog.length === 0) return null;
                                                                                          return (
                                                                                              <div key={date} className="space-y-1">
                                                                                                  <div className="text-xs text-gray-400">{formatDate(date)}</div>
                                                                                                  {changelog.map((entry: any, ei: number) => (
                                                                                                      <div key={ei} className="flex items-center gap-3 text-xs bg-white/5 rounded p-2 ml-4">
                                                                                                          <span className="text-gray-500 text-[10px] w-28 flex-shrink-0">
                                                                                                              {new Date(entry.timestamp).toLocaleString()}
                                                                                                          </span>
                                                                                                          <span className="text-gray-300">
                                                                                                              {entry.oldValue !== null && (
                                                                                                                  <>
                                                                                                                      <span className="text-red-400 line-through">{entry.oldValue?.toLocaleString()}</span>
                                                                                                                      <span className="mx-1">→</span>
                                                                                                                  </>
                                                                                                              )}
                                                                                                              <span className="text-green-400">{entry.newValue?.toLocaleString()}</span>
                                                                                                          </span>
                                                                                                          <span className="text-gray-500 flex-1 truncate">{entry.reason}</span>
                                                                                                          {entry.view_source_url && (
                                                                                                              <a href={entry.view_source_url} target="_blank" rel="noopener noreferrer"
                                                                                                                  className="text-blue-400 hover:text-blue-300 text-[10px] flex-shrink-0">
                                                                                                                  Source ↗
                                                                                                              </a>
                                                                                                          )}
                                                                                                      </div>
                                                                                                  ))}
                                                                                              </div>
                                                                                          );
                                                                                      })}
                                                                                  </div>
                                                                              </td>
                                                                          </tr>
                                                                      )}
                                                                  </React.Fragment>
                                                              );
                                                          })}
                                                      </tbody>
                                                  </table>
                                              </div>
                                          </div>
                                      </div>
                                  );
                              })()}
                              
                              {/* Variance Explanations from Document */}
                              {res.variance_explanations && res.variance_explanations.length > 0 && (
                                  <details className="group">
                                      <summary className="cursor-pointer text-sm text-blue-400 hover:text-blue-300 mb-2 flex items-center gap-2">
                                          <Info size={14} />
                                          {res.variance_explanations.length} Variance Explanation{res.variance_explanations.length > 1 ? 's' : ''} Found
                                      </summary>
                                      <div className="mt-2 space-y-2">
                                          {res.variance_explanations.map((exp: any, ei: number) => (
                                              <div key={ei} className="flex items-start gap-3 text-xs bg-blue-500/5 border border-blue-500/20 rounded p-3">
                                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${
                                                      exp.explanation_type === 'restatement' ? 'bg-red-500/20 text-red-400' :
                                                      exp.explanation_type === 'correction' ? 'bg-orange-500/20 text-orange-400' :
                                                      exp.explanation_type === 'one_time' ? 'bg-yellow-500/20 text-yellow-400' :
                                                      'bg-gray-500/20 text-gray-400'
                                                  }`}>
                                                      {exp.explanation_type}
                                                  </span>
                                                  <div className="flex-1">
                                                      <div className="text-white font-medium">{exp.metric_id}</div>
                                                      <div className="text-gray-300 mt-1">{exp.explanation}</div>
                                                  </div>
                                                  {exp.source_page && (
                                                      <span className="text-gray-500 text-[10px]">Page {exp.source_page}</span>
                                                  )}
                                              </div>
                                          ))}
                                      </div>
                                  </details>
                              )}
                              
                              {/* Reconciliation Changelog */}
                              {res.reconciliation?.changes?.length > 0 && (
                                  <details className="group">
                                      <summary className="cursor-pointer text-sm text-green-400 hover:text-green-300 mb-2 flex items-center gap-2">
                                          <History size={14} />
                                          {res.reconciliation.changes.length} Change{res.reconciliation.changes.length > 1 ? 's' : ''} Applied
                                      </summary>
                                      <div className="mt-2 pl-4 border-l-2 border-green-500/30 space-y-2 text-xs max-h-[200px] overflow-y-auto">
                                          {res.reconciliation.changes.map((change: any, ci: number) => (
                                              <div key={ci} className="flex items-center gap-3 bg-white/5 rounded p-2">
                                                  <span className="font-mono text-gray-400 w-24 flex-shrink-0 truncate">{change.metric_id || change.line_item_id}</span>
                                                  <span className="text-gray-300">
                                                      {change.oldValue !== null ? (
                                                          <>
                                                              <span className="text-red-400">{change.oldValue?.toLocaleString()}</span>
                                                              <span className="mx-1">→</span>
                                                          </>
                                                      ) : null}
                                                      <span className="text-green-400">{change.newValue?.toLocaleString()}</span>
                                                  </span>
                                                  <span className="text-gray-500 flex-1 truncate" title={change.reason}>{change.reason}</span>
                                                  {change.view_source_url && (
                                                      <a 
                                                          href={change.view_source_url}
                                                          target="_blank"
                                                          rel="noopener noreferrer"
                                                          className="text-blue-400 hover:text-blue-300 flex-shrink-0"
                                                      >
                                                          Source ↗
                                                      </a>
                                                  )}
                                              </div>
                                          ))}
                                      </div>
                                  </details>
                              )}
                              
                              {/* Diff View (Local Mode) */}
                              {res.diff && (
                                  <details className="group">
                                      <summary className="cursor-pointer text-sm text-yellow-400 hover:text-yellow-300 mb-2">
                                          📊 Changes from Previous Extraction
                                      </summary>
                                      <div className="mt-2 pl-4 border-l-2 border-yellow-500/30 space-y-2 text-xs">
                                          {res.diff.added.length > 0 && (
                                              <div>
                                                  <span className="text-green-400 font-medium">+ Added:</span>
                                                  <ul className="ml-4 text-gray-300">
                                                      {res.diff.added.map((item: any, i: number) => (
                                                          <li key={i}>{item.metric}: {item.value.toLocaleString()}</li>
                                                      ))}
                                                  </ul>
                                              </div>
                                          )}
                                          {res.diff.removed.length > 0 && (
                                              <div>
                                                  <span className="text-red-400 font-medium">- Removed:</span>
                                                  <ul className="ml-4 text-gray-300">
                                                      {res.diff.removed.map((item: any, i: number) => (
                                                          <li key={i}>{item.metric}: {item.value.toLocaleString()}</li>
                                                      ))}
                                                  </ul>
                                              </div>
                                          )}
                                          {res.diff.changed.length > 0 && (
                                              <div>
                                                  <span className="text-yellow-400 font-medium">~ Changed:</span>
                                                  <ul className="ml-4 text-gray-300">
                                                      {res.diff.changed.map((item: any, i: number) => (
                                                          <li key={i}>
                                                              {item.metric}: {item.oldValue.toLocaleString()} → {item.newValue.toLocaleString()}
                                                              <span className={item.delta > 0 ? 'text-green-400' : 'text-red-400'}>
                                                                  {' '}({item.delta > 0 ? '+' : ''}{item.delta.toLocaleString()})
                                                              </span>
                                                          </li>
                                                      ))}
                                                  </ul>
                                              </div>
                                          )}
                                      </div>
                                  </details>
                              )}
                              
                              {/* Portco Guide Link */}
                              {res.guide_used && (
                                  <div className="mt-4 pt-4 border-t border-white/5 flex justify-end">
                                      <Link 
                                          href={`/import/guide?company=${res.company || selectedCompany}`}
                                          target="_blank"
                                          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1.5 transition-colors"
                                      >
                                          <FileText size={12} />
                                          View Full Portco Guide Config
                                          <ExternalLink size={10} />
                                      </Link>
                                  </div>
                              )}
                              
                              {/* Cache indicator */}
                              {res.usedCache && (
                                  <div className="text-xs text-gray-500 flex items-center gap-1">
                                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                                      Loaded from cache (no API call)
                                  </div>
                              )}
                              
                              {res.error && (
                                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-sm">
                                      {res.error}
                                  </div>
                              )}
                          </div>
                      ))}
                  </div>
              </div>
          )}
        </div>

      </div>
    </div>
  );
}
