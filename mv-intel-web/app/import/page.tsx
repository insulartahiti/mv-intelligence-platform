'use client';

import { useState, useCallback, useEffect } from 'react';
import { Upload, FileText, Check, AlertCircle, Loader2, LogIn } from 'lucide-react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function ImportPage() {
  const [selectedCompany, setSelectedCompany] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [textInput, setTextInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  const supabase = createClientComponentClient();

  // Check authentication status on mount
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);
      if (!session) {
        console.warn('[Import] User not authenticated - storage uploads will fail RLS');
      }
    };
    checkAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  // Auto-detect company when files are added
  useEffect(() => {
    if (files.length > 0 && !selectedCompany) {
      const detect = async () => {
        const res = await fetch(`/api/ingest?filename=${encodeURIComponent(files[0].name)}`);
        const data = await res.json();
        if (data.detected_slug) {
          setSelectedCompany(data.detected_slug);
        }
      };
      detect();
    }
  }, [files, selectedCompany]);

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

  const handleSubmit = async () => {
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
        // 1. Upload files to Supabase Storage
        const timestamp = Date.now();
        const uploadedPaths: string[] = [];
        
        for (const file of files) {
            // Use a single consistent timestamp for the batch
            const relativePath = `${selectedCompany}/${timestamp}_${file.name}`;
            
            const { data, error } = await supabase.storage
                .from('financial-docs')
                .upload(relativePath, file);

            if (error) {
                console.error('Upload failed:', error);
                throw new Error(`Upload failed for ${file.name}`);
            }
            
            // Store the full "logical" path we use in the backend
            uploadedPaths.push(`financial-docs/${relativePath}`);
        }

        setStatusMessage('Processing files...');

        // 2. Trigger Ingestion API with paths
        const res = await fetch('/api/ingest', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                companySlug: selectedCompany,
                filePaths: uploadedPaths,
                notes: textInput
            })
        });
        
        const data = await res.json();
        
        // Check response body status, not just HTTP status
        // API returns: 'success' (all files), 'partial' (some failed), 'error' (all failed)
        if (data.status === 'success') {
            setUploadStatus('success');
            setStatusMessage(`Ingestion Complete: ${data.summary?.success || 0} files processed`);
            setTimeout(() => {
                setUploadStatus('idle');
                setFiles([]);
                setTextInput('');
                setSelectedCompany('');
                setStatusMessage('');
            }, 3000);
        } else if (data.status === 'partial') {
            // Partial success - some files failed
            setUploadStatus('error');
            const failedFiles = data.results?.filter((r: any) => r.status === 'error') || [];
            const failedNames = failedFiles.map((f: any) => f.file?.split('/').pop() || f.file).join(', ');
            setStatusMessage(`Partial failure: ${data.summary?.error || 0} of ${data.summary?.total || 0} files failed. Check: ${failedNames}`);
        } else {
            // Complete failure
            setUploadStatus('error');
            setStatusMessage(data.error || 'Processing failed - all files had errors');
        }
    } catch (err) {
        console.error(err);
        setUploadStatus('error');
        setStatusMessage('Upload failed');
    } finally {
        setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
            Portfolio Data Ingestion
          </h1>
          <p className="text-gray-400 mt-2">
            Upload board decks, financial models, or paste investor updates.
          </p>
        </div>

        {/* Auth Warning Banner */}
        {isAuthenticated === false && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-300">
            <LogIn size={20} />
            <div>
              <p className="font-medium">Authentication Required</p>
              <p className="text-sm text-yellow-300/70">Please log in to upload files. Storage uploads require an authenticated session.</p>
            </div>
          </div>
        )}

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
            onClick={handleSubmit}
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
