'use client';

import React, { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import * as Tabs from '@radix-ui/react-tabs';
import { Upload, FileText, Check, AlertCircle, Loader2, Search, Database, Cloud, History, AlertTriangle, Info, ChevronDown, ChevronRight, ExternalLink, Settings, X, Play } from 'lucide-react';

interface Job {
  id: string;
  companySlug: string;
  companyId: string; // Added companyId to Job
  files: string[];
  status: 'uploading' | 'processing' | 'success' | 'partial' | 'error';
  progress: number;
  message: string;
  result?: any;
  createdAt: number;
}

interface PortfolioCompany {
  id: string;
  name: string;
  domain?: string;
}

export default function ImportPage() {
  const [activeTab, setActiveTab] = useState('import');
  const [selectedCompanyId, setSelectedCompanyId] = useState(''); // Changed to store UUID
  const [selectedCompanyName, setSelectedCompanyName] = useState('');
  const [portfolioCompanies, setPortfolioCompanies] = useState<PortfolioCompany[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [textInput, setTextInput] = useState('');
  const [isDetecting, setIsDetecting] = useState(false);
  
  // Job Queue State
  const [jobs, setJobs] = useState<Job[]>([]);

  // Load portfolio companies on mount
  useEffect(() => {
    const loadPortfolioCompanies = async () => {
      try {
        const res = await fetch('/api/portfolio/companies?limit=100');
        if (res.ok) {
          const data = await res.json();
          setPortfolioCompanies(data.companies || []);
        }
      } catch (err) {
        console.error('Failed to load portfolio companies:', err);
      } finally {
        setLoadingCompanies(false);
      }
    };
    loadPortfolioCompanies();
  }, []);
  
  // Auto-detect company when files are added
  useEffect(() => {
    if (files.length > 0 && !selectedCompanyId && portfolioCompanies.length > 0) {
      const detect = async () => {
        setIsDetecting(true);
        try {
          const res = await fetch(`/api/detect-company?filename=${encodeURIComponent(files[0].name)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.detected_slug) {
              // Try to match the detected slug to a portfolio company
              const match = portfolioCompanies.find(c => 
                c.name.toLowerCase().includes(data.detected_slug.toLowerCase()) ||
                data.detected_slug.toLowerCase().includes(c.name.toLowerCase().split(' ')[0])
              );
              if (match) {
                setSelectedCompanyId(match.id);
                setSelectedCompanyName(match.name);
              }
            }
          }
        } catch (err) {
          console.warn('Company detection failed:', err);
        } finally {
          setIsDetecting(false);
        }
      };
      detect();
    }
  }, [files, selectedCompanyId, portfolioCompanies]);

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

  const updateJob = (id: string, updates: Partial<Job>) => {
    setJobs(prev => prev.map(job => job.id === id ? { ...job, ...updates } : job));
  };
  
  // Process job with companyId directly (UUID from dropdown selection)
  const runIngestion = async (jobId: string, companyId: string, companyName: string, fileList: File[], notes: string) => {
      try {
        const uploadedPaths: string[] = [];
        
        // Upload - use companyName for folder organization
        if (fileList.length > 0) {
            for (let i = 0; i < fileList.length; i++) {
                const file = fileList[i];
                updateJob(jobId, { 
                    status: 'uploading',
                    progress: Math.round((i / fileList.length) * 40),
                    message: `Uploading ${file.name}...`
                });
                
                // Use company name (sanitized) as folder slug
                const folderSlug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
                const urlRes = await fetch(
                    `/api/upload?filename=${encodeURIComponent(file.name)}&companySlug=${encodeURIComponent(folderSlug)}`
                );
                const urlData = await urlRes.json();
                if (urlData.status !== 'success') throw new Error(urlData.error);
                
                const uploadRes = await fetch(urlData.signedUrl, {
                    method: 'PUT',
                    headers: { 'Content-Type': file.type || 'application/octet-stream' },
                    body: file
                });
                if (!uploadRes.ok) throw new Error(`Upload failed`);
                uploadedPaths.push(urlData.path);
            }
        }

        // Process - pass companyId directly (no resolution needed)
        updateJob(jobId, { status: 'processing', progress: 50, message: 'Extracting financial data...' });
        
        const body = {
            companyId: companyId, // UUID from dropdown - primary identifier
            companySlug: companyName, // For logging/display purposes
            filePaths: uploadedPaths,
            notes: notes
        };

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
            throw new Error(`Server error: ${res.statusText}`);
        }

        if (data.status === 'success') {
            updateJob(jobId, { status: 'success', progress: 100, message: 'Complete', result: { ...data, companyId } });
        } else if (data.status === 'partial' || data.status === 'needs_review') {
            updateJob(jobId, { status: 'partial', progress: 100, message: 'Completed with warnings', result: { ...data, companyId } });
        } else {
            throw new Error(data.error || 'Processing failed');
        }

      } catch (err: any) {
          updateJob(jobId, { status: 'error', progress: 100, message: err.message });
      }
  };

  const handleSubmit = () => {
    if (files.length === 0 && (!textInput || textInput.trim().length === 0)) {
        alert('Please upload a file or enter text.');
        return;
    }
    if (!selectedCompanyId) {
        alert('Please select a company.');
        return;
    }

    const newJob: Job = {
        id: Math.random().toString(36).substring(2, 15),
        companySlug: selectedCompanyName, // Display name
        companyId: selectedCompanyId, // UUID
        files: files.map(f => f.name),
        status: 'uploading',
        progress: 0,
        message: 'Starting...',
        createdAt: Date.now()
    };

    setJobs(prev => [newJob, ...prev]);
    
    // Capture current state values
    const currentFiles = [...files];
    const currentText = textInput;
    const currentCompanyId = selectedCompanyId;
    const currentCompanyName = selectedCompanyName;

    // Reset Form
    setFiles([]);
    setTextInput('');
    setSelectedCompanyId('');
    setSelectedCompanyName('');
    
    // Start Background Process - pass companyId directly (no resolution needed)
    runIngestion(newJob.id, currentCompanyId, currentCompanyName, currentFiles, currentText);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black text-white p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
              Financial Intelligence
            </h1>
            <p className="text-slate-400 mt-2">
              Upload board decks, financial models, or paste investor updates.
            </p>
          </div>
        </div>

        <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <Tabs.List className="flex border-b border-white/10 mb-8">
            <Tabs.Trigger 
              value="import"
              className="px-6 py-3 text-sm font-medium text-white/50 hover:text-white data-[state=active]:text-emerald-400 data-[state=active]:border-b-2 data-[state=active]:border-emerald-400 transition-colors flex items-center gap-2"
            >
              <FileText size={16} />
              Import Data
            </Tabs.Trigger>
            <Tabs.Trigger 
              value="history"
              className="px-6 py-3 text-sm font-medium text-white/50 hover:text-white data-[state=active]:text-emerald-400 data-[state=active]:border-b-2 data-[state=active]:border-emerald-400 transition-colors flex items-center gap-2"
            >
              <History size={16} />
              History
            </Tabs.Trigger>
            <Tabs.Trigger 
              value="config"
              className="px-6 py-3 text-sm font-medium text-white/50 hover:text-white data-[state=active]:text-emerald-400 data-[state=active]:border-b-2 data-[state=active]:border-emerald-400 transition-colors flex items-center gap-2"
            >
              <Settings size={16} />
              Guide Configuration
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="import" className="focus:outline-none space-y-8">
            
            {/* Job Queue / Status Bar (Integrated) */}
            {jobs.length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Active Uploads</h3>
                    <div className="grid gap-4">
                        {jobs.map(job => (
                            <div key={job.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                                <div className="flex items-center gap-4 flex-1">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                                        job.status === 'success' ? 'bg-green-500/20 text-green-400' :
                                        job.status === 'error' ? 'bg-red-500/20 text-red-400' :
                                        'bg-blue-500/20 text-blue-400'
                                    }`}>
                                        {job.status === 'uploading' || job.status === 'processing' ? (
                                            <Loader2 size={20} className="animate-spin" />
                                        ) : job.status === 'success' ? (
                                            <Check size={20} />
                                        ) : (
                                            <AlertCircle size={20} />
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-white">{job.companySlug}</span>
                                            <span className="text-xs text-gray-500">• {new Date(job.createdAt).toLocaleTimeString()}</span>
                                        </div>
                                        <div className="text-sm text-gray-400 truncate">{job.message}</div>
                                        {(job.status === 'uploading' || job.status === 'processing') && (
                                            <div className="h-1 bg-white/10 rounded-full mt-2 overflow-hidden w-full max-w-xs">
                                                <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${job.progress}%` }} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {job.status === 'success' && job.result?.companyId && (
                                    <a 
                                        href={`/portfolio/${job.result.companyId}?tab=financials`}
                                        className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-white transition-colors flex items-center gap-2"
                                    >
                                        View Dashboard 
                                        <ExternalLink size={14} className="text-white/50" />
                                    </a>
                                )}
                                {job.status === 'error' && (
                                    <button onClick={() => setJobs(prev => prev.filter(j => j.id !== job.id))} className="text-gray-500 hover:text-white p-2">
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Company Selector */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6">
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Select Portfolio Company
              </label>
              <div className="flex gap-4">
                 <select 
                    value={selectedCompanyId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedCompanyId(id);
                      const company = portfolioCompanies.find(c => c.id === id);
                      setSelectedCompanyName(company?.name || '');
                    }}
                    className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                    disabled={loadingCompanies}
                  >
                    <option value="" disabled>
                      {loadingCompanies ? 'Loading companies...' : '-- Select Company --'}
                    </option>
                    {portfolioCompanies.map(company => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                  {loadingCompanies ? (
                      <div className="flex items-center text-slate-400 text-sm font-medium px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700">
                          <Loader2 size={14} className="mr-1.5 animate-spin"/> 
                          Loading...
                      </div>
                  ) : selectedCompanyId ? (
                      <div className="flex items-center text-emerald-400 text-sm font-medium px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                          <Check size={14} className="mr-1.5"/> 
                          Selected
                      </div>
                  ) : isDetecting && (
                      <div className="flex items-center text-blue-400 text-sm font-medium px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                          <Loader2 size={14} className="mr-1.5 animate-spin"/> 
                          Detecting...
                      </div>
                  )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* File Upload Section */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 space-y-4 h-full flex flex-col">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-white">
                  <Upload size={20} className="text-emerald-400" />
                  Source Documents
                </h2>
                
                <div 
                  className={`
                    relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 flex-1 flex flex-col justify-center items-center
                    ${dragActive 
                      ? 'border-emerald-500 bg-emerald-500/10 scale-[1.02]' 
                      : 'border-white/10 hover:border-emerald-500/30 hover:bg-white/5'}
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
                    <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-400">
                      <Upload size={24} />
                    </div>
                    <p className="text-lg font-medium text-white">Drop files here</p>
                    <p className="text-sm text-white/40 mt-2">
                      PDF (Board Decks), XLSX (Financials), CSV
                    </p>
                  </div>
                </div>

                {/* File List */}
                {files.length > 0 && (
                  <div className="space-y-2 mt-4">
                    {files.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white/5 p-3 rounded-lg border border-white/10 hover:bg-white/10 transition-colors">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="p-2 bg-emerald-500/20 rounded-lg">
                            <FileText size={16} className="text-emerald-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate">{file.name}</p>
                            <p className="text-xs text-white/40">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => removeFile(idx)}
                          className="p-1.5 hover:bg-red-500/20 text-white/40 hover:text-red-400 rounded-lg transition-colors"
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
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 space-y-4 h-full flex flex-col">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-white">
                  <FileText size={20} className="text-blue-400" />
                  Direct Input
                </h2>
                <div className="flex-1">
                  <textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Paste text from board emails, memos, or key highlights here..."
                    className="w-full h-full min-h-[300px] bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none placeholder:text-white/20"
                  />
                </div>
              </div>
            </div>

            {/* Submit Action */}
            <div className="flex flex-col gap-6 pt-6 border-t border-white/10">
              <div className="flex justify-end gap-4">
                <button
                    onClick={() => handleSubmit()}
                    disabled={files.length === 0 && textInput.trim().length === 0}
                    className="flex items-center gap-2 px-8 py-3 rounded-xl font-medium transition-all duration-200 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Play size={20} className="fill-current" />
                    Start Ingestion
                </button>
              </div>
            </div>
          </Tabs.Content>

          <Tabs.Content value="config" className="focus:outline-none">
             <div className="flex flex-col items-center justify-center py-20 bg-white/5 rounded-xl border border-white/10">
               <Settings size={48} className="text-white/20 mb-4" />
               <h3 className="text-xl font-medium text-white mb-2">Guide Configuration</h3>
               <p className="text-white/50 mb-6">View and manage financial ingestion guides for portfolio companies.</p>
               <Link href="/import/guide" className="px-6 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white transition-colors">
                 Go to Guide Editor
               </Link>
             </div>
          </Tabs.Content>

          <Tabs.Content value="history" className="focus:outline-none">
             <div className="flex flex-col items-center justify-center py-20 bg-white/5 rounded-xl border border-white/10">
               <History size={48} className="text-white/20 mb-4" />
               <h3 className="text-xl font-medium text-white mb-2">Ingestion History</h3>
               <p className="text-white/50 mb-6">View logs of past financial data uploads.</p>
               <Link href="/import/history" className="px-6 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white transition-colors">
                 View Logs
               </Link>
             </div>
          </Tabs.Content>
        </Tabs.Root>
      </div>
    </div>
  );
}
