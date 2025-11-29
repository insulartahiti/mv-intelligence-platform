'use client';
import { useState, useEffect } from 'react';
import { Button, Card } from './ui/GlassComponents';

interface PortfolioFile {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  description: string | null;
  uploaded_at: string;
}

interface PortfolioFilesListProps {
  companyId: string;
  onFileDeleted?: (fileId: string) => void;
}

export default function PortfolioFilesList({ 
  companyId, 
  onFileDeleted 
}: PortfolioFilesListProps) {
  const [files, setFiles] = useState<PortfolioFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadFiles();
  }, [companyId]);

  const loadFiles = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/portfolio/upload-file?companyId=${companyId}`);
      const result = await response.json();

      if (response.ok) {
        setFiles(result.files || []);
      } else {
        setError(result.error || 'Failed to load files');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteFile = async (fileId: string) => {
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
      const response = await fetch('/api/portfolio/upload-file', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileId }),
      });

      const result = await response.json();

      if (response.ok) {
        setFiles(prev => prev.filter(file => file.id !== fileId));
        onFileDeleted?.(fileId);
      } else {
        setError(result.error || 'Failed to delete file');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.includes('pdf')) return '📄';
    if (fileType.includes('word') || fileType.includes('document')) return '📝';
    if (fileType.includes('excel') || fileType.includes('spreadsheet')) return '📊';
    if (fileType.includes('powerpoint') || fileType.includes('presentation')) return '📈';
    if (fileType.includes('image')) return '🖼️';
    return '📁';
  };

  if (loading) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-onGlass mb-4">Files</h3>
        <div className="text-center text-onGlass-secondary">
          Loading files...
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-onGlass mb-4">Files</h3>
        <div className="text-center text-red-400">
          Error: {error}
        </div>
        <Button 
          variant="primary" 
          onClick={loadFiles}
          className="mt-4"
        >
          Retry
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-onGlass">Files</h3>
        <Button 
          variant="secondary" 
          size="sm" 
          onClick={loadFiles}
        >
          🔄 Refresh
        </Button>
      </div>

      {files.length === 0 ? (
        <div className="text-center text-onGlass-secondary py-8">
          <div className="text-4xl mb-2">📁</div>
          <p>No files uploaded yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {files.map((file) => (
            <div 
              key={file.id}
              className="flex items-center justify-between p-3 rounded-lg bg-surface-850 border border-border hover:border-primary/50 transition-colors"
            >
              <div className="flex items-center space-x-3 flex-1">
                <div className="text-2xl">
                  {getFileIcon(file.file_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-onGlass truncate">
                    {file.file_name}
                  </div>
                  <div className="text-sm text-onGlass-secondary">
                    {formatFileSize(file.file_size)} • {formatDate(file.uploaded_at)}
                  </div>
                  {file.description && (
                    <div className="text-sm text-onGlass-muted mt-1">
                      {file.description}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => window.open(file.file_url, '_blank')}
                >
                  👁️ View
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => deleteFile(file.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  🗑️ Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}






