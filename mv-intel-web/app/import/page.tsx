'use client';

import { useState, useCallback, useEffect } from 'react';
import { Upload, FileText, Check, AlertCircle, Loader2, Search, Database, Cloud } from 'lucide-react';

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

          {/* Dry Run Results */}
          {dryRunResults.length > 0 && (
              <div className="bg-black/40 rounded-xl border border-white/10 overflow-hidden">
                  <div className="p-4 border-b border-white/10 bg-white/5">
                      <h3 className="text-lg font-semibold text-blue-400">Dry Run Results</h3>
                  </div>
                  <div className="p-4 space-y-6">
                      {dryRunResults.map((res, idx) => (
                          <div key={idx} className="space-y-4">
                              <div className="flex items-center justify-between">
                                  <h4 className="font-medium text-white">{res.file}</h4>
                                  <span className={`px-2 py-1 rounded text-xs ${res.status === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                      {res.status}
                                  </span>
                              </div>
                              
                              {res.computed_metrics && res.computed_metrics.length > 0 && (
                                  <div className="overflow-x-auto">
                                      <table className="w-full text-sm text-left">
                                          <thead className="text-xs text-gray-400 uppercase bg-white/5">
                                              <tr>
                                                  <th className="px-4 py-2">Metric</th>
                                                  <th className="px-4 py-2">Value</th>
                                                  <th className="px-4 py-2">Unit</th>
                                                  <th className="px-4 py-2">Period</th>
                                              </tr>
                                          </thead>
                                          <tbody>
                                              {res.computed_metrics.map((m: any, i: number) => (
                                                  <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                                                      <td className="px-4 py-2 font-medium text-gray-300">{m.metric_id}</td>
                                                      <td className="px-4 py-2 text-white">
                                                          {typeof m.value === 'number' 
                                                              ? m.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) 
                                                              : m.value}
                                                      </td>
                                                      <td className="px-4 py-2 text-gray-400">{m.unit}</td>
                                                      <td className="px-4 py-2 text-gray-400">{m.period}</td>
                                                  </tr>
                                              ))}
                                          </tbody>
                                      </table>
                                  </div>
                              )}
                              
                              {res.extracted_data && res.extracted_data.length > 0 && (
                                  <details className="group" open>
                                      <summary className="cursor-pointer text-sm text-blue-400 hover:text-blue-300 mb-2">
                                          View {res.extracted_data.length} Raw Line Items
                                      </summary>
                                      <div className="overflow-x-auto mt-2 pl-4 border-l-2 border-white/10">
                                          <table className="w-full text-xs text-left">
                                              <thead>
                                                  <tr className="text-gray-500">
                                                      <th className="py-1 px-2">Line Item ID</th>
                                                      <th className="py-1 px-2">Amount</th>
                                                      <th className="py-1 px-2">Scenario</th>
                                                      <th className="py-1 px-2">Source</th>
                                                  </tr>
                                              </thead>
                                              <tbody>
                                                  {res.extracted_data.map((row: any, k: number) => (
                                                      <tr key={k} className="border-b border-white/5 hover:bg-white/5">
                                                          <td className="py-1 px-2 font-mono text-gray-400">{row.line_item_id}</td>
                                                          <td className="py-1 px-2 text-white">{typeof row.amount === 'number' ? row.amount.toLocaleString() : row.amount}</td>
                                                          <td className="py-1 px-2">
                                                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                                                  row.scenario === 'budget' 
                                                                      ? 'bg-purple-500/20 text-purple-400' 
                                                                      : 'bg-green-500/20 text-green-400'
                                                              }`}>
                                                                  {row.scenario || 'Actual'}
                                                              </span>
                                                          </td>
                                                          <td className="py-1 px-2">
                                                              {row.snippet_url ? (
                                                                  <a 
                                                                      href={row.snippet_url} 
                                                                      target="_blank" 
                                                                      rel="noopener noreferrer"
                                                                      className="text-blue-400 hover:text-blue-300 underline"
                                                                  >
                                                                      Page {row.source_location?.page || '?'}
                                                                  </a>
                                                              ) : row.source_location?.page ? (
                                                                  <span className="text-gray-500">Page {row.source_location.page}</span>
                                                              ) : row.source_location?.sheet ? (
                                                                  <span className="text-gray-500">{row.source_location.sheet}</span>
                                                              ) : (
                                                                  <span className="text-gray-600">-</span>
                                                              )}
                                                          </td>
                                                      </tr>
                                                  ))}
                                              </tbody>
                                          </table>
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
