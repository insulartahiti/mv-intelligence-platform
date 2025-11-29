'use client';
import { useState, useRef } from 'react';
import { Button, Card } from './ui/GlassComponents';

interface PortfolioFileUploaderProps {
  companyId: string;
  onFileUploaded?: (fileId: string) => void;
}

export default function PortfolioFileUploader({ 
  companyId, 
  onFileUploaded 
}: PortfolioFileUploaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    fileType: '',
    description: ''
  });

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const file = files[0];
    uploadFile(file);
  };

  const uploadFile = async (file: File) => {
    setLoading(true);
    setMessage('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('companyId', companyId);
      formData.append('fileType', formData.get('fileType') as string || file.type);
      formData.append('description', formData.get('description') as string || '');

      const response = await fetch('/api/portfolio/upload-file', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        setMessage('File uploaded successfully!');
        setFormData({
          fileType: '',
          description: ''
        });
        setIsOpen(false);
        onFileUploaded?.(result.fileId);
      } else {
        setMessage(`Error: ${result.error}`);
      }
    } catch (error: any) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  if (!isOpen) {
    return (
      <Button 
        variant="primary" 
        onClick={() => setIsOpen(true)}
        className="w-full"
      >
        📁 Upload File
      </Button>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-onGlass">Upload File</h3>
        <Button 
          variant="secondary" 
          size="sm" 
          onClick={() => setIsOpen(false)}
        >
          ✕
        </Button>
      </div>

      <div className="space-y-4">
        {/* File Type Selection */}
        <div>
          <label className="block text-sm font-medium text-onGlass-secondary mb-1">
            File Type
          </label>
          <select
            name="fileType"
            value={formData.fileType}
            onChange={handleSelectChange}
            className="w-full p-3 rounded-lg bg-surface-850 border border-border text-onGlass focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Select file type...</option>
            <option value="financial_report">Financial Report</option>
            <option value="presentation">Presentation</option>
            <option value="contract">Contract</option>
            <option value="legal_document">Legal Document</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-onGlass-secondary mb-1">
            Description (Optional)
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            rows={3}
            className="w-full p-3 rounded-lg bg-surface-850 border border-border text-onGlass placeholder-onGlass-muted focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            placeholder="Describe the file..."
          />
        </div>

        {/* File Upload Area */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive 
              ? 'border-primary bg-primary/5' 
              : 'border-border hover:border-primary/50'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <div className="space-y-2">
            <div className="text-4xl">📁</div>
            <p className="text-onGlass-secondary">
              Drag and drop a file here, or{' '}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-primary hover:underline"
              >
                browse
              </button>
            </p>
            <p className="text-sm text-onGlass-muted">
              Supported: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, JPG, PNG, GIF (Max 10MB)
            </p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          onChange={(e) => handleFileSelect(e.target.files)}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.gif"
          className="hidden"
        />

        {message && (
          <div className={`p-3 rounded-lg text-sm ${
            message.includes('Error') 
              ? 'bg-red-900/20 text-red-400 border border-red-800' 
              : 'bg-green-900/20 text-green-400 border border-green-800'
          }`}>
            {message}
          </div>
        )}

        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setIsOpen(false)}
            className="flex-1"
          >
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  );
}






