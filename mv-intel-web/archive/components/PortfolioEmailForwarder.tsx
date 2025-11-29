'use client';
import { useState } from 'react';
import { Button, Card } from './ui/GlassComponents';

interface PortfolioEmailForwarderProps {
  companyId: string;
  onEmailForwarded?: (emailId: string) => void;
}

export default function PortfolioEmailForwarder({ 
  companyId, 
  onEmailForwarded 
}: PortfolioEmailForwarderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [formData, setFormData] = useState({
    googleWorkspaceId: '',
    emailSubject: '',
    emailContent: '',
    emailFrom: '',
    emailTo: '',
    emailDate: new Date().toISOString().split('T')[0]
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/portfolio/forward-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          companyId,
          ...formData
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setMessage('Email forwarded successfully!');
        setFormData({
          googleWorkspaceId: '',
          emailSubject: '',
          emailContent: '',
          emailFrom: '',
          emailTo: '',
          emailDate: new Date().toISOString().split('T')[0]
        });
        setIsOpen(false);
        onEmailForwarded?.(result.emailId);
      } else {
        setMessage(`Error: ${result.error}`);
      }
    } catch (error: any) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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
        📧 Forward Email
      </Button>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-onGlass">Forward Email</h3>
        <Button 
          variant="secondary" 
          size="sm" 
          onClick={() => setIsOpen(false)}
        >
          ✕
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-onGlass-secondary mb-1">
            Google Workspace ID
          </label>
          <input
            type="text"
            name="googleWorkspaceId"
            value={formData.googleWorkspaceId}
            onChange={handleInputChange}
            required
            className="w-full p-3 rounded-lg bg-surface-850 border border-border text-onGlass placeholder-onGlass-muted focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Enter Google Workspace ID"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-onGlass-secondary mb-1">
            Email Subject
          </label>
          <input
            type="text"
            name="emailSubject"
            value={formData.emailSubject}
            onChange={handleInputChange}
            required
            className="w-full p-3 rounded-lg bg-surface-850 border border-border text-onGlass placeholder-onGlass-muted focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Enter email subject"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-onGlass-secondary mb-1">
            From Email
          </label>
          <input
            type="email"
            name="emailFrom"
            value={formData.emailFrom}
            onChange={handleInputChange}
            className="w-full p-3 rounded-lg bg-surface-850 border border-border text-onGlass placeholder-onGlass-muted focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="sender@example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-onGlass-secondary mb-1">
            To Email
          </label>
          <input
            type="email"
            name="emailTo"
            value={formData.emailTo}
            onChange={handleInputChange}
            className="w-full p-3 rounded-lg bg-surface-850 border border-border text-onGlass placeholder-onGlass-muted focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="recipient@example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-onGlass-secondary mb-1">
            Email Date
          </label>
          <input
            type="date"
            name="emailDate"
            value={formData.emailDate}
            onChange={handleInputChange}
            className="w-full p-3 rounded-lg bg-surface-850 border border-border text-onGlass placeholder-onGlass-muted focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-onGlass-secondary mb-1">
            Email Content
          </label>
          <textarea
            name="emailContent"
            value={formData.emailContent}
            onChange={handleInputChange}
            required
            rows={6}
            className="w-full p-3 rounded-lg bg-surface-850 border border-border text-onGlass placeholder-onGlass-muted focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            placeholder="Enter email content..."
          />
        </div>

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
            type="submit"
            variant="primary"
            disabled={loading}
            className="flex-1"
          >
            {loading ? 'Forwarding...' : 'Forward Email'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setIsOpen(false)}
            className="flex-1"
          >
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}






