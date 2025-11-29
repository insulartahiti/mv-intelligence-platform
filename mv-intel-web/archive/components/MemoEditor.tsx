'use client';
import { useState, useEffect } from 'react';
import { Button } from './ui/GlassComponents';

interface MemoEditorProps {
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export function MemoEditor({ initialContent, onSave, onCancel, loading = false }: MemoEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await onSave(content);
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving memo:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setContent(initialContent);
    setIsEditing(false);
    onCancel();
  };

  const formatContent = (text: string) => {
    // Basic markdown formatting for preview
    return text
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold text-onGlass mb-4">$1</h1>')
      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold text-onGlass mb-3">$1</h2>')
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-medium text-onGlass mb-2">$1</h3>')
      .replace(/^#### (.*$)/gim, '<h4 class="text-base font-medium text-onGlass mb-2">$1</h4>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong class="font-semibold text-onGlass">$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em class="italic text-onGlass">$1</em>')
      .replace(/^- (.*$)/gim, '<li class="ml-4 text-onGlass">• $1</li>')
      .replace(/^\d+\. (.*$)/gim, '<li class="ml-4 text-onGlass">$1</li>')
      .replace(/\n\n/gim, '</p><p class="mb-4 text-onGlass">')
      .replace(/\n/gim, '<br>')
      .replace(/^(.*)$/gim, '<p class="mb-4 text-onGlass">$1</p>');
  };

  if (!isEditing) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-onGlass">Investment Memo</h3>
          <div className="flex space-x-2">
            <Button 
              onClick={() => setIsEditing(true)} 
              variant="secondary" 
              size="sm"
              disabled={loading}
            >
              Edit Memo
            </Button>
          </div>
        </div>
        
        <div className="prose prose-invert max-w-none">
          <div 
            className="whitespace-pre-wrap text-onGlass leading-relaxed"
            dangerouslySetInnerHTML={{ 
              __html: content ? formatContent(content) : '<p class="text-onGlass-secondary">No memo content available</p>' 
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-onGlass">Edit Investment Memo</h3>
        <div className="flex space-x-2">
          <Button 
            onClick={handleSave} 
            variant="primary" 
            size="sm"
            disabled={saving || loading}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button 
            onClick={handleCancel} 
            variant="secondary" 
            size="sm"
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Editor */}
        <div>
          <label className="block text-sm font-medium text-onGlass-secondary mb-2">
            Markdown Editor
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-96 p-4 bg-glass-light border border-glass-border rounded-lg text-onGlass font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="Enter your memo content in Markdown format..."
          />
        </div>
        
        {/* Preview */}
        <div>
          <label className="block text-sm font-medium text-onGlass-secondary mb-2">
            Preview
          </label>
          <div className="h-96 p-4 bg-glass-light border border-glass-border rounded-lg overflow-y-auto">
            <div 
              className="prose prose-invert max-w-none"
              dangerouslySetInnerHTML={{ 
                __html: content ? formatContent(content) : '<p class="text-onGlass-secondary">Start typing to see preview...</p>' 
              }}
            />
          </div>
        </div>
      </div>
      
      <div className="text-xs text-onGlass-secondary">
        💡 <strong>Tip:</strong> Use Markdown formatting for headers (# ## ###), bold (**text**), 
        italic (*text*), lists (- item), and more. The preview will update as you type.
      </div>
    </div>
  );
}






