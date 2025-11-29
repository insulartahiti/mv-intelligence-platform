'use client';
import { useState, useEffect } from 'react';
import { Card, Button, SearchInput } from './ui/GlassComponents';

interface Email {
  id: string;
  email_id: string;
  subject: string;
  from_email: string;
  to_email: string;
  email_date: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  portfolio_relevant: boolean;
  status: 'pending' | 'processing' | 'processed' | 'failed';
  content?: string;
  insights_count?: number;
  email_insights?: Array<{
    id: string;
    insight_type: string;
    title: string;
    content: string;
    confidence: number;
    priority: string;
    actionable: boolean;
  }>;
}

interface QueueStats {
  pending: number;
  processing: number;
  processed: number;
  failed: number;
  total: number;
}

export default function UnifiedInbox() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [portfolioEmails, setPortfolioEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'processed' | 'failed'>('all');
  const [priority, setPriority] = useState<'all' | 'low' | 'medium' | 'high' | 'urgent'>('all');

  useEffect(() => {
    loadInbox();
    loadQueueStats();
  }, []);

  const loadInbox = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter !== 'all') params.append('status', filter);
      if (priority !== 'all') params.append('priority', priority);
      if (searchTerm) params.append('search', searchTerm);

      const response = await fetch(`/api/emails/inbox?${params.toString()}`);
      const result = await response.json();

      if (response.ok) {
        setEmails(result.emails || []);
        setPortfolioEmails(result.portfolioEmails || []);
      } else {
        setError(result.error || 'Failed to load inbox');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadQueueStats = async () => {
    try {
      const response = await fetch('/api/emails/process-queue');
      const result = await response.json();

      if (response.ok) {
        setQueueStats(result.queueStats);
      }
    } catch (err) {
      console.warn('Failed to load queue stats:', err);
    }
  };

  const processQueue = async () => {
    try {
      const response = await fetch('/api/emails/process-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 5 })
      });

      const result = await response.json();

      if (response.ok) {
        console.log('Queue processing result:', result);
        loadInbox();
        loadQueueStats();
      } else {
        setError(result.error || 'Failed to process queue');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'text-red-400 bg-red-900/20';
      case 'high': return 'text-orange-400 bg-orange-900/20';
      case 'medium': return 'text-yellow-400 bg-yellow-900/20';
      case 'low': return 'text-green-400 bg-green-900/20';
      default: return 'text-onGlass-secondary bg-surface-850';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processed': return 'text-green-400';
      case 'processing': return 'text-blue-400';
      case 'failed': return 'text-red-400';
      case 'pending': return 'text-yellow-400';
      default: return 'text-onGlass-secondary';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredEmails = emails.filter(email => {
    const matchesSearch = email.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         email.from_email.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  if (loading) {
    return (
      <Card className="p-6">
        <div className="text-center text-onGlass-secondary">
          Loading inbox...
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Queue Stats */}
      {queueStats && (
        <Card className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-onGlass">Email Processing Queue</h3>
            <Button 
              variant="primary" 
              onClick={processQueue}
              disabled={queueStats.pending === 0}
            >
              Process Queue ({queueStats.pending} pending)
            </Button>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-400">{queueStats.pending}</div>
              <div className="text-sm text-onGlass-secondary">Pending</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">{queueStats.processing}</div>
              <div className="text-sm text-onGlass-secondary">Processing</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">{queueStats.processed}</div>
              <div className="text-sm text-onGlass-secondary">Processed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-400">{queueStats.failed}</div>
              <div className="text-sm text-onGlass-secondary">Failed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-onGlass">{queueStats.total}</div>
              <div className="text-sm text-onGlass-secondary">Total</div>
            </div>
          </div>
        </Card>
      )}

      {/* Portfolio Emails */}
      {portfolioEmails.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-onGlass mb-4">Portfolio-Relevant Emails</h3>
          <div className="space-y-3">
            {portfolioEmails.slice(0, 5).map((email) => (
              <div 
                key={email.id}
                className="p-4 rounded-lg bg-surface-850 border border-border hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => setSelectedEmail(email)}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <h4 className="font-medium text-onGlass">{email.subject}</h4>
                    <p className="text-sm text-onGlass-secondary">{email.from_email}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 rounded text-xs ${getPriorityColor(email.priority)}`}>
                      {email.priority}
                    </span>
                    <span className={`text-sm ${getStatusColor(email.status)}`}>
                      {email.status}
                    </span>
                  </div>
                </div>
                <div className="text-sm text-onGlass-muted">
                  {formatDate(email.email_date)} • {email.insights_count || 0} insights
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Search and Filters */}
      <Card className="p-6">
        <div className="flex flex-col md:flex-row gap-4 mb-4">
          <div className="flex-1">
            <SearchInput
              placeholder="Search emails..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="flex gap-4">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="px-3 py-2 rounded-lg bg-surface-850 border border-border text-onGlass"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="processed">Processed</option>
              <option value="failed">Failed</option>
            </select>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as any)}
              className="px-3 py-2 rounded-lg bg-surface-850 border border-border text-onGlass"
            >
              <option value="all">All Priority</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <Button variant="secondary" onClick={loadInbox}>
              Refresh
            </Button>
          </div>
        </div>
        <div className="text-sm text-onGlass-secondary">
          {filteredEmails.length} of {emails.length} emails
        </div>
      </Card>

      {/* Email List */}
      <div className="space-y-3">
        {filteredEmails.map((email) => (
          <Card 
            key={email.id} 
            className="p-4 hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => setSelectedEmail(email)}
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1">
                <h4 className="font-medium text-onGlass">{email.subject}</h4>
                <p className="text-sm text-onGlass-secondary">{email.from_email} → {email.to_email}</p>
              </div>
              <div className="flex items-center space-x-2">
                <span className={`px-2 py-1 rounded text-xs ${getPriorityColor(email.priority)}`}>
                  {email.priority}
                </span>
                <span className={`text-sm ${getStatusColor(email.status)}`}>
                  {email.status}
                </span>
                {email.portfolio_relevant && (
                  <span className="px-2 py-1 rounded text-xs bg-blue-900/20 text-blue-400">
                    Portfolio
                  </span>
                )}
              </div>
            </div>
            <div className="text-sm text-onGlass-muted">
              {formatDate(email.email_date)}
              {email.email_insights && email.email_insights.length > 0 && (
                <span> • {email.email_insights.length} insights</span>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Email Detail Modal */}
      {selectedEmail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="max-w-4xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-onGlass">Email Details</h3>
              <Button 
                variant="secondary" 
                onClick={() => setSelectedEmail(null)}
              >
                ✕
              </Button>
            </div>
            
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-onGlass mb-2">Subject</h4>
                <p className="text-onGlass-secondary">{selectedEmail.subject}</p>
              </div>
              
              <div>
                <h4 className="font-medium text-onGlass mb-2">From/To</h4>
                <p className="text-onGlass-secondary">
                  {selectedEmail.from_email} → {selectedEmail.to_email}
                </p>
              </div>
              
              <div>
                <h4 className="font-medium text-onGlass mb-2">Date</h4>
                <p className="text-onGlass-secondary">{formatDate(selectedEmail.email_date)}</p>
              </div>
              
              {selectedEmail.content && (
                <div>
                  <h4 className="font-medium text-onGlass mb-2">Content</h4>
                  <div className="bg-surface-850 p-4 rounded-lg text-sm text-onGlass-secondary whitespace-pre-wrap">
                    {selectedEmail.content}
                  </div>
                </div>
              )}
              
              {selectedEmail.email_insights && selectedEmail.email_insights.length > 0 && (
                <div>
                  <h4 className="font-medium text-onGlass mb-2">Insights</h4>
                  <div className="space-y-2">
                    {selectedEmail.email_insights.map((insight) => (
                      <div key={insight.id} className="p-3 rounded-lg bg-surface-850 border border-border">
                        <div className="flex justify-between items-start mb-1">
                          <h5 className="font-medium text-onGlass">{insight.title}</h5>
                          <span className={`px-2 py-1 rounded text-xs ${getPriorityColor(insight.priority)}`}>
                            {insight.priority}
                          </span>
                        </div>
                        <p className="text-sm text-onGlass-secondary">{insight.content}</p>
                        <div className="text-xs text-onGlass-muted mt-2">
                          Confidence: {Math.round(insight.confidence * 100)}% • 
                          Type: {insight.insight_type} • 
                          {insight.actionable ? 'Actionable' : 'Informational'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="p-6">
          <div className="text-center text-red-400">
            Error: {error}
          </div>
          <Button 
            variant="primary" 
            onClick={loadInbox}
            className="mt-4"
          >
            Retry
          </Button>
        </Card>
      )}
    </div>
  );
}






