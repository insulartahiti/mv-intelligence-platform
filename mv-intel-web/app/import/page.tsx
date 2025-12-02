'use client';

import { useState, useCallback, useEffect } from 'react';
import { Upload, FileText, Check, AlertCircle, Loader2 } from 'lucide-react';

export default function ImportPage() {
  const [selectedCompany, setSelectedCompany] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [textInput, setTextInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');

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
        const res = await fetch('/api/ingest', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                companySlug: selectedCompany,
                filePaths: uploadedPaths,
                notes: textInput
            })
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
            setTimeout(() => {
                setUploadStatus('idle');
                setFiles([]);
                setTextInput('');
                setSelectedCompany('');
                setStatusMessage('');
            }, 3000);
        } else if (data.status === 'partial' || data.status === 'needs_review') {
            // Partial success - some files failed or need review
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
