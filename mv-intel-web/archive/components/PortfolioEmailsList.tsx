'use client';
import { useState, useEffect } from 'react';
import { Button, Card } from './ui/GlassComponents';

interface PortfolioEmail {
  id: string;
  subject: string;
  content: string;
  from_email: string | null;
  to_email: string | null;
  email_date: string | null;
  status: string;
  created_at: string;
}

interface PortfolioEmailsListProps {
  companyId: string;
  onEmailDeleted?: (emailId: string) => void;
}

export default function PortfolioEmailsList({ 
  companyId, 
  onEmailDeleted 
}: PortfolioEmailsListProps) {
  const [emails, setEmails] = useState<PortfolioEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadEmails();
  }, [companyId]);

  const loadEmails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/portfolio/forward-email?companyId=${companyId}`);
      const result = await response.json();

      if (response.ok) {
        setEmails(result.emails || []);
      } else {
        setError(result.error || 'Failed to load emails');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'forwarded':
        return 'text-green-400';
      case 'pending':
        return 'text-yellow-400';
      case 'failed':
        return 'text-red-400';
      default:
        return 'text-onGlass-secondary';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'forwarded':
        return '✅';
      case 'pending':
        return '⏳';
      case 'failed':
        return '❌';
      default:
        return '📧';
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-onGlass mb-4">Forwarded Emails</h3>
        <div className="text-center text-onGlass-secondary">
          Loading emails...
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-onGlass mb-4">Forwarded Emails</h3>
        <div className="text-center text-red-400">
          Error: {error}
        </div>
        <Button 
          variant="primary" 
          onClick={loadEmails}
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
        <h3 className="text-lg font-semibold text-onGlass">Forwarded Emails</h3>
        <Button 
          variant="secondary" 
          size="sm" 
          onClick={loadEmails}
        >
          🔄 Refresh
        </Button>
      </div>

      {emails.length === 0 ? (
        <div className="text-center text-onGlass-secondary py-8">
          <div className="text-4xl mb-2">📧</div>
          <p>No emails forwarded yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {emails.map((email) => (
            <div 
              key={email.id}
              className="p-4 rounded-lg bg-surface-850 border border-border hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-onGlass truncate">
                    {email.subject}
                  </div>
                  <div className="text-sm text-onGlass-secondary mt-1">
                    {email.from_email && email.to_email && (
                      <span>
                        From: {email.from_email} → To: {email.to_email}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2 ml-4">
                  <span className={`text-sm ${getStatusColor(email.status)}`}>
                    {getStatusIcon(email.status)} {email.status}
                  </span>
                </div>
              </div>
              
              <div className="text-sm text-onGlass-muted mb-3">
                {email.email_date ? formatDate(email.email_date) : formatDate(email.created_at)}
              </div>
              
              <div className="text-sm text-onGlass-secondary line-clamp-3">
                {email.content}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}






