'use client';

import { useState, useCallback, useEffect } from 'react';
import { Upload, FileText, Check, AlertCircle, Loader2, Search } from 'lucide-react';

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
  
  // Search state for modal
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{id: string, name: string}[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // ... (existing useEffect and handlers) ...

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
          // If candidates exist, we don't pre-select to force user choice
      }
  }, [showResolutionModal]);

  // ... (handleSubmit and handleResolveCompany remain same) ...

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
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
            Portfolio Data Ingestion
          </h1>
          <p className="text-gray-400 mt-2">
            Upload board decks, financial models, or paste investor updates.
          </p>
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
        <div className="flex justify-end pt-6 border-t border-white/10">
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

      </div>
    </div>
  );
}
